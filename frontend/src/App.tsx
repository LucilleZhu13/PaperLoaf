import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PdfView, type Anchors } from "./components/PdfView";
import { SummaryRail } from "./components/SummaryRail";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { ChatPanel } from "./components/ChatPanel";
import { SelectionLayer, type Highlight } from "./components/SelectionLayer";
import { api, STATUS_LABEL, type SectionOut } from "./api/client";
import type { Section } from "./mockData";
import type { AnchorSection } from "./components/PdfView";
import "./App.css";

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

const sectionId = (s: SectionOut) => s.number ?? `s${s.order}`;

/** Every section, for locating headings in the PDF (jump-to targets). */
function toAnchorSections(sections: SectionOut[]): AnchorSection[] {
  return sections.map((s) => ({ id: sectionId(s), headingText: s.heading_text }));
}

/** Only sections that have a summary get a margin card. */
function toRailSections(sections: SectionOut[]): Section[] {
  return sections
    .filter((s) => s.summary)
    .map((s, i) => ({
      id: sectionId(s),
      headingText: s.heading_text,
      label: s.number ? `§${s.number} · ${s.title}` : s.title,
      side: i % 2 === 0 ? "left" : "right",
      summary: s.summary ?? "",
    }));
}

export default function App() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<Anchors>({});
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [libCollapsed, setLibCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const [columnEl, setColumnElState] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [flashY, setFlashY] = useState<number | null>(null);

  const readingRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const papers = useQuery({ queryKey: ["papers"], queryFn: api.listPapers });
  const paper = useQuery({
    queryKey: ["paper", currentId],
    queryFn: () => api.getPaper(currentId!),
    enabled: !!currentId,
    refetchInterval: (q) =>
      q.state.data && !["ready", "failed"].includes(q.state.data.status) ? 2000 : false,
  });

  // Default the selection to the most recent paper.
  useEffect(() => {
    if (!currentId && papers.data && papers.data.length > 0) setCurrentId(papers.data[0].id);
  }, [papers.data, currentId]);

  // Reset per-paper view state when switching papers.
  useEffect(() => {
    setAnchors({});
    setReady(false);
    setActiveId(null);
    setHighlights([]);
    setFlashY(null);
    setZoom(1);
  }, [currentId]);

  const anchorSections = useMemo(
    () => (paper.data ? toAnchorSections(paper.data.sections) : []),
    [paper.data],
  );
  const railSections = useMemo(
    () => (paper.data ? toRailSections(paper.data.sections) : []),
    [paper.data],
  );

  const onAnchors = useCallback((a: Anchors) => setAnchors(a), []);
  const onReady = useCallback(() => setReady(true), []);
  const setColumnEl = useCallback((el: HTMLDivElement | null) => setColumnElState(el), []);

  const zoomIdx = (() => {
    const i = ZOOM_STEPS.indexOf(zoom);
    return i < 0 ? ZOOM_STEPS.indexOf(1) : i;
  })();

  // Track which section is at the top of the viewport.
  useEffect(() => {
    const el = readingRef.current;
    if (!el || Object.keys(anchors).length === 0) return;
    const ordered = Object.entries(anchors)
      .map(([id, y]) => ({ id, y }))
      .sort((a, b) => a.y - b.y);

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const probe = el.scrollTop + 130;
        let current = ordered[0]?.id ?? null;
        for (const s of ordered) if (s.y <= probe) current = s.id;
        setActiveId(current);
      });
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [anchors]);

  const jumpTo = useCallback(
    (id: string) => {
      const y = anchors[id];
      if (y == null || !readingRef.current) return;
      readingRef.current.scrollTo({ top: y - 56 });
      setActiveId(id);
      setFlashY(y);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashY(null), 1400);
    },
    [anchors],
  );

  const detail = paper.data;
  const ingesting =
    detail != null && detail.status !== "ready" && detail.status !== "failed";
  const providerHint = detail?.status === "ready" && !detail.one_liner;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">Paper Reader</div>
        {detail && (
          <div className="app-header__paper">
            <span className="app-header__title">{detail.title}</span>
            <span className="app-header__authors">
              {[detail.authors, detail.year].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        <p className="app-header__oneliner">
          {detail?.one_liner ??
            (ingesting
              ? STATUS_LABEL[detail!.status]
              : providerHint
                ? "Add a model in config.yaml to generate summaries."
                : detail?.status === "failed"
                  ? `Ingest failed: ${detail.error ?? "unknown error"}`
                  : "")}
        </p>

        <div className="zoom" role="group" aria-label="Display size">
          <button
            onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIdx - 1)])}
            disabled={zoomIdx <= 0 || !currentId}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button className="zoom__level" onClick={() => setZoom(1)} title="Reset to 100%">
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1)])}
            disabled={zoomIdx >= ZOOM_STEPS.length - 1 || !currentId}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </header>

      <div className="app-body">
        <LibrarySidebar
          collapsed={libCollapsed}
          onToggle={() => setLibCollapsed((v) => !v)}
          currentId={currentId}
          onSelect={setCurrentId}
        />

        <main className="reading-area" ref={readingRef}>
          {!currentId && (
            <div className="empty-state">
              {papers.isLoading ? "Loading library…" : "Add a PDF from the library to start."}
            </div>
          )}

          {currentId && (
            <>
              {!ready && <div className="loading">Rendering paper…</div>}
              <div className="reading-inner">
                <SummaryRail
                  side="left"
                  sections={railSections}
                  anchors={anchors}
                  activeId={activeId}
                  onJump={jumpTo}
                />

                <PdfView
                  key={currentId}
                  url={api.pdfUrl(currentId)}
                  sections={anchorSections}
                  zoom={zoom}
                  onAnchors={onAnchors}
                  onReady={onReady}
                  columnRef={setColumnEl}
                >
                  {highlights.map((h) => (
                    <div key={h.id}>
                      {h.rects.map((r, i) => (
                        <div key={i} className="hl-mark" style={{ ...r }} />
                      ))}
                    </div>
                  ))}
                  {flashY != null && (
                    <div className="section-flash" style={{ top: flashY - 16 }} />
                  )}
                </PdfView>

                <SummaryRail
                  side="right"
                  sections={railSections}
                  anchors={anchors}
                  activeId={activeId}
                  onJump={jumpTo}
                />
              </div>

              <SelectionLayer
                columnEl={columnEl}
                highlights={highlights}
                onAsk={(text) => {
                  setPendingAsk(text);
                  setChatCollapsed(false);
                }}
                onHighlight={(rects) =>
                  setHighlights((h) => [...h, { id: crypto.randomUUID(), rects }])
                }
                onRemoveHighlights={(ids) =>
                  setHighlights((h) => h.filter((x) => !ids.includes(x.id)))
                }
              />
            </>
          )}
        </main>

        <ChatPanel
          collapsed={chatCollapsed}
          onToggle={() => setChatCollapsed((v) => !v)}
          pending={pendingAsk}
          onConsumePending={() => setPendingAsk(null)}
          onJump={jumpTo}
        />
      </div>
    </div>
  );
}
