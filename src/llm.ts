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
 * one JSON object at the end. onToken is called as each piece arrives (for
 * printing without waiting on the full response); the full concatenated text
 * is still returned at the end since callers (citation checking) need it
 * whole. Buffers by newline rather than assuming a network chunk lines up
 * with one JSON object -- TCP doesn't guarantee that.
 */
export async function generateStream(
  system: string,
  user: string,
  onToken: (token: string) => void,
): Promise<string> {
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

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { message?: { content: string }; done: boolean };
      const token = parsed.message?.content ?? "";
      if (token) {
        onToken(token);
        full += token;
      }
    }
  }

  return full;
}
