# Paper Reader

A PDF reader for academic papers with LLM-assisted reading tools: per-section
plain-language summaries in the margins, an inline glossary, key questions with
citations, a paper-scoped chat, and select-to-ask.

Self-hosted and model-agnostic — bring your own API key or point it at a local
open-source model through an OpenAI-compatible endpoint. No bundled model, no
external services (SQLite + local embeddings out of the box).

## Status

**Milestone 1 — working end to end.** Library, PDF upload, an ingest pipeline
that parses papers into sections and builds a vector index, and a reader that
renders the real PDF with margin summaries synced to it. Chat, key questions,
and inline definitions still run on fixtures (milestones 2–3).

## Run it

Two processes. Backend:

```bash
cd backend
uv sync
cp config.example.yaml config.yaml     # edit to point at a model (optional)
uv run uvicorn app.main:app --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Upload a PDF from the library panel. Parsing + indexing runs with no API key
(local `fastembed` embeddings). **Per-section and one-line summaries need a
model** — set one in `backend/config.yaml`:

```yaml
models:
  summarize: { model: openai/gpt-4o-mini }     # or anthropic/…, ollama/…, etc.
providers:
  openai: { api_key_env: OPENAI_API_KEY }
```

Anything [LiteLLM](https://docs.litellm.ai/docs/providers) supports works,
including a local OpenAI-compatible server via `api_base`.

## Architecture

```
backend/app/
  ingest/     store → parse (PyMuPDF) → chunk → embed → generate
  llm/        LiteLLM wrapper, per-task model routing
  retrieval   paper-scoped KNN over sqlite-vec
  api/        /api/papers CRUD + upload
frontend/src/
  components/ PdfView (pdf.js + text layer), SummaryRail, ChatPanel, …
  api/        typed client
```

Every row is scoped by `paper_id`; retrieval and (later) chat threads never
cross papers. The parser sits behind `parse_pdf()` so GROBID or Docling can
replace the heuristic PyMuPDF pass without touching the pipeline.

## Reader features (live now)

- Two-column-aware PDF render with a selectable text layer
- Section summaries in the left/right margins, pinned to their headings and
  scroll-synced
- One-sentence whole-paper summary in the header
- Zoom (`− 100% +`), re-rasterised in place
- Select text → Highlight / Ask; Define for single words. Highlights blend
  under the text and are removable.
- Key-question answers cite sections; clicking a citation jumps there

## Known limitations (v1 parser)

- Year detection trusts PDF metadata only (often wrong or missing — GROBID fixes
  this)
- Author extraction is best-effort
- Figures, tables and equations aren't extracted yet
