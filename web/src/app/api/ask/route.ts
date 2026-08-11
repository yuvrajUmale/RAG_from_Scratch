import { answerQuestion, type AskOptions } from "@rag/answer";

export async function POST(req: Request) {
  const body = await req.json();
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }

  const options: AskOptions = {
    source: typeof body.source === "string" && body.source ? body.source : undefined,
    topK: typeof body.topK === "number" && body.topK > 0 ? body.topK : undefined,
    hybrid: Boolean(body.hybrid),
    rerank: Boolean(body.rerank),
    stream: Boolean(body.stream),
  };

  const encoder = new TextEncoder();

  // NDJSON: one AskEvent per line, same shape answerQuestion() yields --
  // mirrors the pattern already used for Ollama's own streaming responses
  // (src/llm.ts) rather than inventing a second wire format.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of answerQuestion(question, options)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
