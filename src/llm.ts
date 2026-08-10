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
