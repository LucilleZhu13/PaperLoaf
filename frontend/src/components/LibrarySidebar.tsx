import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, STATUS_LABEL, type PaperListItem } from "../api/client";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  currentId: string | null;
  onSelect: (id: string) => void;
}

export function LibrarySidebar({ collapsed, onToggle, currentId, onSelect }: Props) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const papers = useQuery({
    queryKey: ["papers"],
    queryFn: api.listPapers,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((p) => !["ready", "failed"].includes(p.status)) ? 2500 : false,
  });

  const upload = useMutation({
    mutationFn: api.uploadPaper,
    onSuccess: (paper) => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      onSelect(paper.id);
    },
  });

  const remove = useMutation({
    mutationFn: api.deletePaper,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });

  return (
    <aside className={`library${collapsed ? " is-collapsed" : ""}`}>
      <button className="panel-toggle" onClick={onToggle} title={collapsed ? "Show library" : "Hide library"}>
        {collapsed ? "»" : "«"}
      </button>

      <div className="panel-body">
        <header className="panel-head">
          <h2>Library</h2>
          <button
            className="ghost-btn"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? "Uploading…" : "+ Add"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </header>

        {upload.isError && <p className="lib-error">Upload failed. Is the backend running?</p>}

        <p className="panel-subhead">Recent</p>
        {papers.isLoading && <p className="lib-hint">Loading…</p>}
        {papers.isError && <p className="lib-error">Can’t reach the backend.</p>}
        {papers.data?.length === 0 && <p className="lib-hint">No papers yet — add a PDF.</p>}

        <ul className="lib-list">
          {papers.data?.map((paper: PaperListItem) => (
            <li
              key={paper.id}
              className={`lib-item${paper.id === currentId ? " is-active" : ""}`}
              onClick={() => onSelect(paper.id)}
            >
              <span className="lib-item__title">{paper.title}</span>
              <span className="lib-item__meta">
                {[paper.authors, paper.year].filter(Boolean).join(" · ") ||
                  (paper.status === "ready" ? "—" : STATUS_LABEL[paper.status])}
              </span>
              {paper.status !== "ready" && paper.status !== "failed" && (
                <span className="lib-item__status">{STATUS_LABEL[paper.status]}</span>
              )}
              {paper.status === "failed" && <span className="lib-item__status is-error">Failed</span>}
              <button
                className="lib-item__del"
                title="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate(paper.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
