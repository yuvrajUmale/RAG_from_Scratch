import { embed } from "./embed.js";
import { search } from "./vectorstore.js";
import { generate } from "./llm.js";

const TOP_K = 3;

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('Usage: npm run ask -- "your question"');
    console.error('(Run `npm run index` first if you haven\'t built the index yet.)');
    process.exit(1);
  }

  const queryEmbedding = await embed(question);
  const retrieved = await search(queryEmbedding, TOP_K);

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
