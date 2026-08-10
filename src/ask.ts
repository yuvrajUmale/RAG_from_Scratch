import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus } from "./loadDocs.js";
import { embed, embedBatch } from "./embed.js";
import { search, type EmbeddedChunk } from "./store.js";
import { generate } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, "..", "sample-docs");
const TOP_K = 3;

async function buildIndex(): Promise<EmbeddedChunk[]> {
  const chunks = await loadCorpus(CORPUS_DIR);
  const embeddings = await embedBatch(chunks.map((c) => c.text));
  return chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] }));
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('Usage: npm run ask -- "your question"');
    process.exit(1);
  }

  console.log("Indexing corpus...");
  const index = await buildIndex();
  console.log(`Indexed ${index.length} chunks from ${new Set(index.map((c) => c.source)).size} files.\n`);

  const queryEmbedding = await embed(question);
  const retrieved = search(queryEmbedding, index, TOP_K);

  console.log("Retrieved chunks:");
  for (const r of retrieved) {
    console.log(`  [${r.score.toFixed(3)}] ${r.source} — "${r.text.slice(0, 60)}..."`);
  }
  console.log();

  const context = retrieved
    .map((r, i) => `[${i + 1}] (source: ${r.source})\n${r.text}`)
    .join("\n\n");

  const systemPrompt =
    "Answer the user's question using ONLY the provided context. " +
    "If the context doesn't contain the answer, say so plainly instead of guessing. " +
    "Cite which source file(s) you used in your answer.";

  const answer = await generate(systemPrompt, `Context:\n${context}\n\nQuestion: ${question}`);
  console.log("Answer:");
  console.log(answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
