// Fixtures for the parts of the reader not yet wired to the backend:
// the chat thread and the key-questions panel (milestones 2-3).
//
// Section-anchored features key off a section id, which for real papers is the
// section number ("3.2.1"); the citations below use that scheme.

export interface Section {
  id: string;
  /** Text to locate in the PDF text layer to anchor this summary. */
  headingText: string;
  label: string;
  side: "left" | "right";
  summary: string;
}

/** A pointer into the paper. `id` matches a Section; omit it for spots with no anchor. */
export interface Citation {
  id?: string;
  label: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  cites?: Citation[];
}

export const CHAT_SEED: ChatMessage[] = [
  {
    role: "assistant",
    text: "Ask me anything about this paper. I only draw on the paper you have open — my context resets for every paper in your library.",
  },
];

export interface KeyQuestion {
  q: string;
  a: string;
  where: Citation[];
}

// Placeholder set — real questions come from the ingest pipeline.
export const KEY_QUESTIONS: KeyQuestion[] = [
  {
    q: "What problem with recurrent models does the Transformer solve?",
    a: "Recurrence forces sequential computation and long paths between distant words. The Transformer replaces it with attention, enabling parallel training and constant-length paths.",
    where: [
      { id: "1", label: "§1 Introduction" },
      { id: "4", label: "§4 Why Self-Attention" },
    ],
  },
  {
    q: "Why divide the attention scores by √dₖ?",
    a: "For large key dimensions the dot products grow large in magnitude, pushing softmax into regions with tiny gradients. Scaling counteracts this.",
    where: [{ id: "3.2.1", label: "§3.2.1 Scaled Dot-Product Attention" }],
  },
  {
    q: "How does the model represent word order without recurrence?",
    a: "Fixed sinusoidal positional encodings are added to the input embeddings, letting the model attend by relative position and extrapolate to longer sequences.",
    where: [{ id: "3.5", label: "§3.5 Positional Encoding" }],
  },
  {
    q: "What were the headline results?",
    a: "28.4 BLEU on WMT 2014 English-to-German and 41.8 BLEU on English-to-French, both state of the art, trained in well under the compute of prior work.",
    where: [
      { id: "6", label: "§6 Results" },
      { label: "Table 2" },
    ],
  },
];
