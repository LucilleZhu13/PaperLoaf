import { useEffect, useRef, useState } from "react";
import { CHAT_SEED, KEY_QUESTIONS, type ChatMessage, type Citation } from "../mockData";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  pending: string | null;
  onConsumePending: () => void;
  /** Jump the PDF to a section by id. */
  onJump: (id: string) => void;
}

function CiteLinks({ cites, onJump }: { cites: Citation[]; onJump: (id: string) => void }) {
  return (
    <div className="cites">
      {cites.map((c, i) =>
        c.id ? (
          <button key={i} className="cite" onClick={() => onJump(c.id!)}>
            {c.label}
          </button>
        ) : (
          <span key={i} className="cite cite--plain">
            {c.label}
          </span>
        ),
      )}
    </div>
  );
}

export function ChatPanel({ collapsed, onToggle, pending, onConsumePending, onJump }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_SEED);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"chat" | "questions">("chat");
  const threadRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: clean },
      {
        role: "assistant",
        text: "Prototype response — the real assistant retrieves passages from this paper and answers with citations. Your question is scoped to the open paper only.",
        cites: [{ id: "3.2", label: "§3.2 Attention" }],
      },
    ]);
    setDraft("");
  }

  useEffect(() => {
    if (pending) {
      setTab("chat");
      setDraft((d) => (d ? d : `About this passage: “${pending}” — `));
      onConsumePending();
    }
  }, [pending, onConsumePending]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  return (
    <aside className={`chat${collapsed ? " is-collapsed" : ""}`}>
      <button className="panel-toggle" onClick={onToggle} title={collapsed ? "Show chat" : "Hide chat"}>
        {collapsed ? "«" : "»"}
      </button>

      <div className="panel-body">
        <header className="panel-head">
          <div className="chat-tabs">
            <button className={tab === "chat" ? "is-on" : ""} onClick={() => setTab("chat")}>
              Chat
            </button>
            <button className={tab === "questions" ? "is-on" : ""} onClick={() => setTab("questions")}>
              Key questions
            </button>
          </div>
        </header>

        {tab === "chat" ? (
          <>
            <div className="chat-thread" ref={threadRef}>
              {messages.map((m, i) => (
                <div key={i} className={`bubble bubble--${m.role}`}>
                  {m.text}
                  {m.cites && m.cites.length > 0 && <CiteLinks cites={m.cites} onJump={onJump} />}
                </div>
              ))}
            </div>
            <form
              className="chat-input"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about this paper…"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="questions-list">
            {KEY_QUESTIONS.map((item, i) => (
              <article key={i} className="question">
                <h4>{item.q}</h4>
                <p>{item.a}</p>
                <CiteLinks cites={item.where} onJump={onJump} />
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
