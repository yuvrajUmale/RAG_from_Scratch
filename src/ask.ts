import { embed } from "./embed.js";
import { search } from "./vectorstore.js";
import { hybridSearch } from "./hybridSearch.js";
import { generate } from "./llm.js";

const DEFAULT_TOP_K = 3;

// Empirically chosen from our test corpus: true supporting chunks have scored
// as low as ~0.45-0.52, while genuinely unrelated questions scored ~0.20-0.33.
// The "gym membership" false-positive sat at 0.384, right in between -- a
// real threshold has to be tuned per embedding model/corpus (see Stage 6),
// but 0.4 cleanly separates the two clusters we've actually measured so far.
const MIN_SCORE = 0.4;

function parseArgs(argv: string[]): { question: string; source?: string; topK: number; hybrid: boolean } {
  let source: string | undefined;
  let topK = DEFAULT_TOP_K;
  let hybrid = false;
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
    } else if (arg.startsWith("--k=")) {
      topK = Number(arg.slice("--k=".length));
    } else if (arg === "--hybrid") {
      hybrid = true;
    } else {
      rest.push(arg);
    }
  }
  return { question: rest.join(" ").trim(), source, topK, hybrid };
}

async function main() {
  const { question, source, topK, hybrid } = parseArgs(process.argv.slice(2));
  if (!question) {
    console.error('Usage: npm run ask -- "your question" [--source=filename.md] [--k=N] [--hybrid]');
    console.error('(Run `npm run index` first if you haven\'t built the index yet.)');
    process.exit(1);
  }

  const queryEmbedding = await embed(question);
  const retrieved = hybrid
    ? await hybridSearch(question, queryEmbedding, topK, { source })
    : await search(queryEmbedding, topK, { source });

  const mode = hybrid ? "hybrid: vector+BM25 via RRF" : "vector only";
  console.log(`Retrieved chunks${source ? ` (filtered to source="${source}")` : ""} (top-${topK}, ${mode}):`);
  for (const r of retrieved) {
    const ranks =
      "vectorRank" in r ? ` (vecRank=${r.vectorRank ?? "-"}, kwRank=${r.keywordRank ?? "-"})` : "";
    const belowCutoff = !hybrid && r.score < MIN_SCORE ? " (below cutoff, excluded)" : "";
    console.log(`  [${r.score.toFixed(4)}] ${r.source} — "${r.text.slice(0, 60)}..."${ranks}${belowCutoff}`);
  }
  console.log();

  // The min-score cutoff is calibrated for cosine similarity (0-1 range);
  // RRF's fused scores live on a different scale entirely, so it isn't
  // meaningful to apply the same threshold in hybrid mode -- that's a gap
  // to close if hybrid becomes the default (would need its own cutoff,
  // tuned separately, or a per-source score normalization step).
  const relevant = hybrid ? retrieved : retrieved.filter((r) => r.score >= MIN_SCORE);
  if (relevant.length === 0) {
    console.log("Answer:");
    console.log(
      `No retrieved chunk scored above the relevance cutoff (${MIN_SCORE}) -- ` +
        "skipping generation rather than risk an answer built on weak context.",
    );
    return;
  }

  const context = relevant
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
