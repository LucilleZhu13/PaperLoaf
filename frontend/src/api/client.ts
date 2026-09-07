const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type PaperStatus =
  | "pending"
  | "parsing"
  | "embedding"
  | "generating"
  | "ready"
  | "failed";

export interface SectionOut {
  order: number;
  number: string | null;
  title: string;
  heading_text: string;
  page: number | null;
  summary: string | null;
}

export interface PaperListItem {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  status: PaperStatus;
  page_count: number | null;
  created_at: string;
}

export interface PaperDetail extends PaperListItem {
  one_liner: string | null;
  error: string | null;
  sections: SectionOut[];
}

export interface ProviderStatus {
  summarize: boolean;
  chat: boolean;
  define: boolean;
  embeddings_backend: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  pdfUrl: (id: string) => `${BASE}/api/papers/${id}/pdf`,

  listPapers: () => fetch(`${BASE}/api/papers`).then(json<PaperListItem[]>),
  getPaper: (id: string) => fetch(`${BASE}/api/papers/${id}`).then(json<PaperDetail>),
  providerStatus: () => fetch(`${BASE}/api/provider`).then(json<ProviderStatus>),

  uploadPaper: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return fetch(`${BASE}/api/papers`, { method: "POST", body }).then(json<PaperListItem>);
  },

  deletePaper: (id: string) =>
    fetch(`${BASE}/api/papers/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok && r.status !== 204) throw new Error(`delete failed: ${r.status}`);
    }),
};

export const STATUS_LABEL: Record<PaperStatus, string> = {
  pending: "Queued…",
  parsing: "Reading the PDF…",
  embedding: "Indexing…",
  generating: "Writing summaries…",
  ready: "Ready",
  failed: "Failed",
};
