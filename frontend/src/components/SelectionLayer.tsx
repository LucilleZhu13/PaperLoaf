import { useCallback, useEffect, useRef, useState } from "react";

export interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Highlight {
  id: string;
  rects: HighlightRect[];
}

interface Toolbar {
  x: number;
  y: number;
  text: string;
  /** ids of existing highlights the selection overlaps */
  hitIds: string[];
}

interface Props {
  /** The positioned PDF column; selection must live inside it. */
  columnEl: HTMLDivElement | null;
  highlights: Highlight[];
  onAsk: (text: string) => void;
  onHighlight: (rects: HighlightRect[]) => void;
  onRemoveHighlights: (ids: string[]) => void;
}

function rectsOverlap(a: HighlightRect, b: HighlightRect) {
  return !(
    a.left + a.width < b.left ||
    b.left + b.width < a.left ||
    a.top + a.height < b.top ||
    b.top + b.height < a.top
  );
}

export function SelectionLayer({
  columnEl,
  highlights,
  onAsk,
  onHighlight,
  onRemoveHighlights,
}: Props) {
  const [toolbar, setToolbar] = useState<Toolbar | null>(null);
  const [define, setDefine] = useState<{ x: number; y: number; term: string } | null>(null);
  const pendingRects = useRef<HighlightRect[]>([]);

  const columnRects = useCallback(
    (range: Range): HighlightRect[] => {
      const colRect = columnEl!.getBoundingClientRect();
      return Array.from(range.getClientRects()).map((r) => ({
        left: r.left - colRect.left,
        top: r.top - colRect.top,
        width: r.width,
        height: r.height,
      }));
    },
    [columnEl],
  );

  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !columnEl) {
      setToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (text.length < 2 || !columnEl.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }

    const cr = columnRects(range);
    pendingRects.current = cr;
    const hitIds = highlights
      .filter((h) => h.rects.some((hr) => cr.some((sr) => rectsOverlap(hr, sr))))
      .map((h) => h.id);

    const viewportRects = Array.from(range.getClientRects());
    const last = viewportRects[viewportRects.length - 1];
    setToolbar({ x: last.right, y: last.bottom, text, hitIds });
  }, [columnEl, columnRects, highlights]);

  useEffect(() => {
    document.addEventListener("mouseup", readSelection);
    return () => document.removeEventListener("mouseup", readSelection);
  }, [readSelection]);

  useEffect(() => {
    const scroller = columnEl?.closest(".reading-area");
    if (!scroller) return;
    const dismiss = () => {
      setToolbar(null);
      setDefine(null);
    };
    scroller.addEventListener("scroll", dismiss, { passive: true });
    return () => scroller.removeEventListener("scroll", dismiss);
  }, [columnEl]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }

  const isWord = toolbar != null && /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(toolbar.text);

  return (
    <>
      {toolbar && (
        <div className="sel-toolbar" style={{ left: toolbar.x, top: toolbar.y + 8 }}>
          {toolbar.hitIds.length > 0 ? (
            <button
              onClick={() => {
                onRemoveHighlights(toolbar.hitIds);
                clearSelection();
              }}
            >
              Remove highlight
            </button>
          ) : (
            <button
              onClick={() => {
                onHighlight(pendingRects.current);
                clearSelection();
              }}
            >
              Highlight
            </button>
          )}
          <button
            onClick={() => {
              onAsk(toolbar.text);
              clearSelection();
            }}
          >
            Ask
          </button>
          {/* Define is a single-term lookup, so only offer it for one word */}
          {isWord && (
            <button
              onClick={() => {
                setDefine({ x: toolbar.x, y: toolbar.y, term: toolbar.text });
                setToolbar(null);
              }}
            >
              Define
            </button>
          )}
        </div>
      )}

      {define && (
        <div
          className="define-pop"
          style={{ left: Math.max(12, define.x - 260), top: define.y + 8 }}
        >
          <p className="define-pop__term">“{define.term}”</p>
          <p className="define-pop__body">
            In the real app the definition is pulled from where this term is first
            introduced in the paper, with a jump link to that spot. Placeholder text.
          </p>
          <button className="ghost-btn" onClick={() => setDefine(null)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
