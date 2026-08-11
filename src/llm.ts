const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "llama3.2:3b";

export async function generate(system: string, user: string): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama request failed (${res.status}). Is it running? Try: ollama serve\n${await res.text()}`
    );
  }

  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}

/**
 * Same call as generate(), but with stream: true -- Ollama sends one
 * newline-delimited JSON object per token (or small token group) instead of
 * one JSON object at the end. Yields each token as it arrives, rather than
 * taking a callback, so callers (ask.ts's CLI printer, answer.ts's own
 * generator) can compose it with `yield*`/`for await` instead of threading a
 * side-effecting function through. Buffers by newline rather than assuming a
 * network chunk lines up with one JSON object -- TCP doesn't guarantee that.
 */
export async function* generateStream(
  system: string,
  user: string,
): AsyncGenerator<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(
      `Ollama request failed (${res.status}). Is it running? Try: ollama serve\n${await res.text()}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // getReader().read() rather than `for await (const chunk of res.body)` --
  // the latter relies on ReadableStream's Symbol.asyncIterator, which Node's
  // lib types expose but TS's "dom" lib (used by the Next.js web app that
  // also imports this file) doesn't, so it fails to typecheck there.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { message?: { content: string }; done: boolean };
      const token = parsed.message?.content ?? "";
      if (token) yield token;
    }
  }
}
