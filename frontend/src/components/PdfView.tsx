import { useCallback, useEffect, useRef, type ReactNode } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/** Map of section id -> vertical pixel offset of its heading within the PDF column, at the current zoom. */
export type Anchors = Record<string, number>;

/** The minimum a section needs for its heading to be located in the PDF text. */
export interface AnchorSection {
  id: string;
  headingText: string;
}

interface Props {
  url: string;
  sections: AnchorSection[];
  /** 1 = fit-to-width ("100%"); render scale is the fit scale times `zoom`. */
  zoom: number;
  onAnchors: (anchors: Anchors) => void;
  onReady: () => void;
  columnRef: (el: HTMLDivElement | null) => void;
  children?: ReactNode;
}

interface Line {
  col: 0 | 1;
  y: number;
  items: { x: number; str: string }[];
}

interface PageBox {
  page: pdfjsLib.PDFPageProxy;
  pageEl: HTMLDivElement;
  canvas: HTMLCanvasElement;
  textLayerEl: HTMLDivElement;
  textLayer: pdfjsLib.TextLayer;
  task: ReturnType<pdfjsLib.PDFPageProxy["render"]> | null;
}

const squash = (s: string) =>
  s.replace(/\s+/g, "").replace(/[‐-―−]/g, "-").toLowerCase();

const outputScale = () => Math.min(window.devicePixelRatio || 1, 2);

/** Scan one page's text content for section headings and record their y-offset. */
function scanHeadings(
  content: Awaited<ReturnType<pdfjsLib.PDFPageProxy["getTextContent"]>>,
  viewport: pdfjsLib.PageViewport,
  pageTop: number,
  anchors: Anchors,
  sections: AnchorSection[],
) {
  const lines: Line[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [, , , , x, y] = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const col: 0 | 1 = x < viewport.width / 2 ? 0 : 1;
    let line = lines.find((l) => l.col === col && Math.abs(l.y - y) < 4);
    if (!line) {
      line = { col, y, items: [] };
      lines.push(line);
    }
    line.items.push({ x, str: item.str });
  }

  for (const line of lines) {
    // The heading number and title are separate text items separated only by
    // positional spacing, so match with whitespace and hyphen variants removed.
    const key = squash(line.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(""));
    for (const section of sections) {
      if (anchors[section.id] != null) continue;
      const h = squash(section.headingText);
      if (key === h || key.startsWith(h)) {
        anchors[section.id] = Math.round(pageTop + line.y);
      }
    }
  }
}

function sizeCanvas(canvas: HTMLCanvasElement, viewport: pdfjsLib.PageViewport) {
  const os = outputScale();
  canvas.width = Math.floor(viewport.width * os);
  canvas.height = Math.floor(viewport.height * os);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
}

function paintCanvas(box: PageBox, viewport: pdfjsLib.PageViewport) {
  const os = outputScale();
  box.task?.cancel();
  box.task = box.page.render({
    canvasContext: box.canvas.getContext("2d")!,
    viewport,
    transform: os !== 1 ? [os, 0, 0, os, 0, 0] : undefined,
  });
  return box.task.promise;
}

export function PdfView({ url, sections, zoom, onAnchors, onReady, columnRef, children }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<PageBox[]>([]);
  const fitScaleRef = useRef(1);
  const loadedRef = useRef(false);
  const zoomRef = useRef(zoom);
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  /** Re-derive every heading anchor from the current page layout. Cheap after
   * the first render — pdf.js caches getTextContent. */
  const recomputeAnchors = useCallback(async () => {
    const pages = pagesRef.current;
    if (pages.length === 0) return;
    const scale = fitScaleRef.current * zoomRef.current;
    const anchors: Anchors = {};
    for (const box of pages) {
      const viewport = box.page.getViewport({ scale });
      const content = await box.page.getTextContent();
      scanHeadings(content, viewport, box.pageEl.offsetTop, anchors, sectionsRef.current);
    }
    onAnchors(anchors);
  }, [onAnchors]);

  /** Re-raster every page at the given zoom, in place, preserving scroll. */
  const applyZoom = useCallback(
    async (z: number) => {
      const scroller = hostRef.current?.closest(".reading-area") as HTMLElement | null;
      const ratio =
        scroller && scroller.scrollHeight > 0 ? scroller.scrollTop / scroller.scrollHeight : 0;
      const renderScale = fitScaleRef.current * z;

      for (const box of pagesRef.current) {
        const viewport = box.page.getViewport({ scale: renderScale });
        box.pageEl.style.width = `${viewport.width}px`;
        box.pageEl.style.height = `${viewport.height}px`;
        box.textLayerEl.style.setProperty("--scale-factor", String(renderScale));
        sizeCanvas(box.canvas, viewport);
        try {
          await paintCanvas(box, viewport);
        } catch {
          return; // superseded by a newer zoom
        }
        box.textLayer.update({ viewport });
      }

      await recomputeAnchors();
      if (scroller && ratio > 0) scroller.scrollTop = ratio * scroller.scrollHeight;
    },
    [recomputeAnchors],
  );

  // ---- initial load + full render (always at zoom = 1) ----
  useEffect(() => {
    let cancelled = false;
    let finished = false;
    let running = false;
    const host = hostRef.current;
    if (!host) return;

    const run = async () => {
      if (running || finished) return;
      running = true;
      loadedRef.current = false;
      const pdf = await pdfjsLib.getDocument(url).promise;
      if (cancelled) return;
      host.replaceChildren();
      pagesRef.current = [];

      const available = host.clientWidth - 4;
      const base = (await pdf.getPage(1)).getViewport({ scale: 1 });
      const fitScale = Math.min(2, Math.max(1, available / base.width));
      fitScaleRef.current = fitScale;
      const anchors: Anchors = {};

      for (let p = 1; p <= pdf.numPages; p++) {
        if (cancelled) return;
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: fitScale });

        const pageEl = document.createElement("div");
        pageEl.className = "pdf-page";
        pageEl.style.width = `${viewport.width}px`;
        pageEl.style.height = `${viewport.height}px`;

        const canvas = document.createElement("canvas");
        const textLayerEl = document.createElement("div");
        textLayerEl.className = "textLayer";
        textLayerEl.style.setProperty("--scale-factor", String(fitScale));
        sizeCanvas(canvas, viewport);

        pageEl.append(canvas, textLayerEl);
        host.append(pageEl);
        const pageTop = pageEl.offsetTop;

        const box: PageBox = { page, pageEl, canvas, textLayerEl, textLayer: null!, task: null };
        await paintCanvas(box, viewport);
        if (cancelled) return;

        box.textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textLayerEl,
          viewport,
        });
        await box.textLayer.render();
        if (cancelled) return;
        pagesRef.current.push(box);

        scanHeadings(await page.getTextContent(), viewport, pageTop, anchors, sectionsRef.current);
        onAnchors({ ...anchors });
        if (p === 1) onReady();
      }
      finished = true;
      loadedRef.current = true;
      if (zoomRef.current !== 1) await applyZoom(zoomRef.current);
      else await recomputeAnchors();
    };

    const start = () => {
      run()
        .catch((err) => console.error("[PdfView] render failed", err))
        .finally(() => {
          running = false;
        });
    };
    start();

    // pdf.js paints via requestAnimationFrame, paused while the tab is hidden;
    // if a render stalled there, restart it when the tab returns.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !finished && !running) start();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, onAnchors, onReady, applyZoom, recomputeAnchors]);

  // ---- zoom changes after load ----
  useEffect(() => {
    zoomRef.current = zoom;
    if (loadedRef.current) void applyZoom(zoom);
  }, [zoom, applyZoom]);

  // ---- sections arrive (ingest finishing) after the PDF is already rendered ----
  useEffect(() => {
    if (loadedRef.current) void recomputeAnchors();
  }, [sections, recomputeAnchors]);

  return (
    <div className="pdf-col" ref={columnRef}>
      <div className="pdf-pages" ref={hostRef} />
      {children}
    </div>
  );
}
