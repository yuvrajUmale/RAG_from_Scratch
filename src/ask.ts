import { embed } from "./embed.js";
import { search } from "./vectorstore.js";
import { hybridSearch } from "./hybridSearch.js";
import { rerank as rerankCandidates } from "./rerank.js";
import { generate, generateStream } from "./llm.js";
import { checkCitations } from "./citations.js";

const DEFAULT_TOP_K = 3;

// Empirically chosen from our test corpus: true supporting chunks have scored
// as low as ~0.45-0.52, while genuinely unrelated questions scored ~0.20-0.33.
// The "gym membership" false-positive sat at 0.384, right in between -- a
// real threshold has to be tuned per embedding model/corpus (see Stage 6),
// but 0.4 cleanly separates the two clusters we've actually measured so far.
const MIN_SCORE = 0.4;

// Hybrid mode's fused score is now normalized to (0, 1] (see hybridSearch.ts),
// but it measures something different from cosine similarity -- "how highly
// both/either signal ranked this chunk" rather than "semantic closeness" --
// so it gets its own threshold rather than reusing MIN_SCORE. Chosen
// empirically from the two logged regression cases: the "coworking space"
// chunk (the one hybrid exists to rescue) normalizes to ~0.87, while the
// "skip-level manager" noise chunk that derailed the "trip reimbursement"
// answer normalizes to ~0.75 -- 0.8 sits cleanly between them.
const HYBRID_MIN_SCORE = 0.8;

// Placeholder -- to be tuned empirically against live test results, same as
// MIN_SCORE and HYBRID_MIN_SCORE were.
const RERANK_MIN_SCORE = 0.5;

// Reranking is a second pass, so it needs a wider net from the first-stage
// retriever than the final top-k -- otherwise there's nothing extra for the
// cross-encoder to find that vector/hybrid search didn't already surface.
function rerankPoolSize(topK: number): number {
  return Math.max(topK * 4, 8);
}

function parseArgs(
  argv: string[],
): { question: string; source?: string; topK: number; hybrid: boolean; rerank: boolean; stream: boolean } {
  let source: string | undefined;
  let topK = DEFAULT_TOP_K;
  let hybrid = false;
  let rerank = false;
  let stream = false;
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
    } else if (arg.startsWith("--k=")) {
      topK = Number(arg.slice("--k=".length));
    } else if (arg === "--hybrid") {
      hybrid = true;
    } else if (arg === "--rerank") {
      rerank = true;
    } else if (arg === "--stream") {
      stream = true;
    } else {
      rest.push(arg);
    }
  }
  return { question: rest.join(" ").trim(), source, topK, hybrid, rerank, stream };
}

interface DisplayResult {
  id: string;
  text: string;
  source: string;
  score: number;
  vectorRank?: number;
  keywordRank?: number;
  origScore?: number;
}

async function main() {
  const { question, source, topK, hybrid, rerank, stream } = parseArgs(process.argv.slice(2));
  if (!question) {
    console.error(
      'Usage: npm run ask -- "your question" [--source=filename.md] [--k=N] [--hybrid] [--rerank] [--stream]',
    );
    console.error('(Run `npm run index` first if you haven\'t built the index yet.)');
    process.exit(1);
  }

  const queryEmbedding = await embed(question);
  const poolK = rerank ? rerankPoolSize(topK) : topK;
  const firstPassRaw = hybrid
    ? await hybridSearch(question, queryEmbedding, poolK, { source })
    : await search(queryEmbedding, poolK, { source });
  const firstPass: DisplayResult[] = firstPassRaw.map((r) => ({
    id: r.id,
    text: r.text,
    source: r.source,
    score: r.score,
    vectorRank: "vectorRank" in r ? r.vectorRank : undefined,
    keywordRank: "keywordRank" in r ? r.keywordRank : undefined,
  }));

  const retrieved: DisplayResult[] = rerank
    ? (await rerankCandidates(question, firstPass, topK)).map(({ item, rerankScore }) => ({
        ...item,
        score: rerankScore,
        origScore: item.score,
      }))
    : firstPass;

  const modeParts = [hybrid ? "hybrid: vector+BM25 via RRF" : "vector only"];
  if (rerank) modeParts.push("reranked (cross-encoder)");
  const mode = modeParts.join(" -> ");
  console.log(`Retrieved chunks${source ? ` (filtered to source="${source}")` : ""} (top-${topK}, ${mode}):`);
  const activeCutoff = rerank ? RERANK_MIN_SCORE : hybrid ? HYBRID_MIN_SCORE : MIN_SCORE;
  for (const r of retrieved) {
    const ranks =
      r.vectorRank !== undefined || r.keywordRank !== undefined
        ? ` (vecRank=${r.vectorRank ?? "-"}, kwRank=${r.keywordRank ?? "-"})`
        : "";
    const orig = r.origScore !== undefined ? ` (pre-rerank score: ${r.origScore.toFixed(4)})` : "";
    const belowCutoff = r.score < activeCutoff ? " (below cutoff, excluded)" : "";
    console.log(
      `  [${r.score.toFixed(4)}] ${r.source} — "${r.text.slice(0, 60)}..."${ranks}${orig}${belowCutoff}`,
    );
  }
  console.log();

  const relevant = retrieved.filter((r) => r.score >= activeCutoff);
  if (relevant.length === 0) {
    console.log("Answer:");
    console.log(
      `No retrieved chunk scored above the relevance cutoff (${activeCutoff}) -- ` +
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
    "Cite context chunks inline using their [n] number as you use them.";
  const userPrompt = `Context:\n${context}\n\nQuestion: ${question}`;

  console.log("Answer:");
  let answer: string;
  if (stream) {
    answer = await generateStream(systemPrompt, userPrompt, (token) => process.stdout.write(token));
    console.log();
  } else {
    answer = await generate(systemPrompt, userPrompt);
    console.log(answer);
  }

  const { citedSources, invalidMarkers } = checkCitations(answer, relevant);
  console.log();
  console.log(
    citedSources.length > 0
      ? `Sources: ${citedSources.join(", ")}`
      : "Sources: none cited -- answer may not be grounded in the retrieved context.",
  );
  if (invalidMarkers.length > 0) {
    console.log(
      `Warning: answer cited [${invalidMarkers.join(", ")}] which ${invalidMarkers.length === 1 ? "doesn't" : "don't"} correspond to any retrieved chunk -- possible fabricated citation.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
