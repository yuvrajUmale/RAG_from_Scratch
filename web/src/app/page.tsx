"use client";

import { useRef, useState } from "react";
import type { AskEvent, RetrievedChunk } from "@rag/answer";

// Fixed, since the sample corpus (rag/sample-docs/) is a small hand-written
// set of 5 files, not something users add to through this UI.
const SOURCES = [
  "remote-work-policy.md",
  "onboarding-checklist.md",
  "expense-reimbursement.md",
  "security-guidelines.md",
  "pto-policy.md",
];

interface AssistantMeta {
  mode?: string;
  cutoff?: number;
  chunks?: RetrievedChunk[];
  citedSources?: string[];
  invalidMarkers?: number[];
  noContext?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  meta?: AssistantMeta;
  pending?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState("");
  const [topK, setTopK] = useState(3);
  const [hybrid, setHybrid] = useState(false);
  // Defaults on -- Stage 6's eval suite found rerank the only mode that
  // reliably declined to answer out-of-corpus questions (see rag.md).
  const [rerank, setRerank] = useState(true);
  const [stream, setStream] = useState(true);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask(q: string) {
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", pending: true, meta: {} },
    ]);
    setBusy(true);

    const updateLast = (fn: (m: Message) => Message) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, source: source || undefined, topK, hybrid, rerank, stream }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text();
        updateLast((m) => ({ ...m, pending: false, content: `Request failed: ${detail}` }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AskEvent | { type: "error"; message: string };
          handleEvent(event, updateLast);
        }
      }
    } catch (err) {
      updateLast((m) => ({ ...m, pending: false, content: `Error: ${(err as Error).message}` }));
    } finally {
      updateLast((m) => ({ ...m, pending: false }));
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleEvent(
    event: AskEvent | { type: "error"; message: string },
    updateLast: (fn: (m: Message) => Message) => void,
  ) {
    switch (event.type) {
      case "retrieved":
        updateLast((m) => ({
          ...m,
          meta: { ...m.meta, mode: event.mode, cutoff: event.cutoff, chunks: event.chunks },
        }));
        break;
      case "no-context":
        updateLast((m) => ({
          ...m,
          content: `No retrieved chunk scored above the relevance cutoff (${event.cutoff}) -- skipping generation rather than risk an ungrounded answer.`,
          meta: { ...m.meta, noContext: true },
        }));
        break;
      case "token":
        updateLast((m) => ({ ...m, content: m.content + event.text }));
        break;
      case "answer":
        updateLast((m) => ({ ...m, content: event.text }));
        break;
      case "citations":
        updateLast((m) => ({
          ...m,
          meta: { ...m.meta, citedSources: event.citedSources, invalidMarkers: event.invalidMarkers },
        }));
        break;
      case "error":
        updateLast((m) => ({ ...m, content: `Error: ${event.message}` }));
        break;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    void ask(q);
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto w-full">
      <header className="px-4 py-3 border-b border-black/10 dark:border-white/10">
        <h1 className="text-lg font-semibold">Chat with your docs</h1>
        <p className="text-sm opacity-60">
          Local RAG over a 5-file sample handbook — Ollama (llama3.2:3b) + LanceDB, fully offline.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="opacity-50 text-sm">
            Try: &quot;How many days of PTO do I get?&quot; or &quot;Do I get reimbursed for a coworking
            space?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-black/10 dark:border-white/10 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 text-xs opacity-80">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-transparent border border-black/20 dark:border-white/20 rounded px-2 py-1"
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            k=
            <input
              type="number"
              min={1}
              max={10}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value) || 1)}
              className="w-12 bg-transparent border border-black/20 dark:border-white/20 rounded px-1 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} />
            hybrid
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
            rerank
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} />
            stream
          </label>
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the handbook..."
            className="flex-1 border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="px-4 py-2 rounded bg-foreground text-background disabled:opacity-40"
          >
            {busy ? "..." : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap text-sm ${
          isUser ? "bg-foreground text-background" : "bg-black/5 dark:bg-white/10"
        }`}
      >
        {message.content || (message.pending ? "Thinking..." : "")}
      </div>
      {!isUser && message.meta?.chunks && message.meta.chunks.length > 0 && (
        <details className="mt-1 text-xs opacity-70 max-w-[85%]">
          <summary className="cursor-pointer">
            Retrieved ({message.meta.mode}, cutoff {message.meta.cutoff})
          </summary>
          <ul className="mt-1 space-y-1">
            {message.meta.chunks.map((c: RetrievedChunk) => (
              <li key={c.id} className={c.belowCutoff ? "line-through opacity-50" : ""}>
                [{c.score.toFixed(3)}] {c.source} — {c.text.slice(0, 70)}...
              </li>
            ))}
          </ul>
        </details>
      )}
      {!isUser && (message.meta?.citedSources?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs opacity-60">Sources: {message.meta!.citedSources!.join(", ")}</p>
      )}
      {!isUser && (message.meta?.invalidMarkers?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs text-amber-600">
          Warning: cited [{message.meta!.invalidMarkers!.join(", ")}] with no matching chunk — possible
          fabricated citation.
        </p>
      )}
    </div>
  );
}
