import type { Section } from "../mockData";
import type { Anchors } from "./PdfView";

interface Props {
  side: "left" | "right";
  sections: Section[];
  anchors: Anchors;
  activeId: string | null;
  onJump: (id: string) => void;
}

const CARD_H = 132; // approx; used only to nudge overlapping cards apart

export function SummaryRail({ side, sections, anchors, activeId, onJump }: Props) {
  const placed = sections
    .filter((s) => s.side === side && anchors[s.id] != null)
    // lift the card so its first line, not its top padding, meets the heading
    .map((s) => ({ section: s, y: anchors[s.id] - 16 }))
    .sort((a, b) => a.y - b.y);

  // Push cards down if they would overlap their predecessor.
  let lastBottom = -Infinity;
  const laidOut = placed.map(({ section, y }) => {
    const top = Math.max(y, lastBottom + 12);
    lastBottom = top + CARD_H;
    return { section, top, anchorY: y };
  });

  return (
    <div className={`rail rail--${side}`}>
      {laidOut.map(({ section, top, anchorY }) => (
        <article
          key={section.id}
          className={`summary-card${activeId === section.id ? " is-active" : ""}`}
          style={{ top }}
          onClick={() => onJump(section.id)}
        >
          <span
            className="summary-card__tick"
            style={{ top: Math.max(0, anchorY - top) + 14 }}
          />
          <h3 className="summary-card__label">{section.label}</h3>
          <p className="summary-card__body">{section.summary}</p>
        </article>
      ))}
    </div>
  );
}
