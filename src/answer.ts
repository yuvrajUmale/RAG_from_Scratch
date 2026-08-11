import { embed } from "./embed";
import { search } from "./vectorstore";
import { hybridSearch } from "./hybridSearch";
import { rerank as rerankCandidates } from "./rerank";
import { generate, generateStream } from "./llm";
import { checkCitations } from "./citations";

export const DEFAULT_TOP_K = 3;

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

// Chosen empirically: true hits scored 0.79-1.0, non-hits ~0.0000 across the
// PTO true-hit and dress-code/gym-membership not-in-corpus tests.
const RERANK_MIN_SCORE = 0.5;

// Reranking is a second pass, so it needs a wider net from the first-stage
// retriever than the final top-k -- otherwise there's nothing extra for the
// cross-encoder to find that vector/hybrid search didn't already surface.
function rerankPoolSize(topK: number): number {
  return Math.max(topK * 4, 8);
}

export interface AskOptions {
  source?: string;
  topK?: number;
  hybrid?: boolean;
  rerank?: boolean;
  stream?: boolean;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  score: number;
  vectorRank?: number;
  keywordRank?: number;
  origScore?: number;
  belowCutoff: boolean;
}

export type AskEvent =
  | { type: "retrieved"; chunks: RetrievedChunk[]; mode: string; cutoff: number; source?: string; topK: number }
  | { type: "no-context"; cutoff: number }
  | { type: "token"; text: string }
  | { type: "answer"; text: string }
  | { type: "citations"; citedSources: string[]; invalidMarkers: number[] };

/**
 * The full retrieve -> (rerank) -> generate -> cite pipeline, as an async
 * generator so both the CLI (ask.ts) and the web API route can consume the
 * same events -- one prints them, the other serializes them to the client.
 * Mirrors the exact logic that used to live inline in ask.ts's main().
 */
export async function* answerQuestion(
  question: string,
  options: AskOptions = {},
): AsyncGenerator<AskEvent> {
  const { source, hybrid = false, rerank = false, stream = false } = options;
  const topK = options.topK ?? DEFAULT_TOP_K;

  const queryEmbedding = await embed(question);
  const poolK = rerank ? rerankPoolSize(topK) : topK;
  const firstPassRaw = hybrid
    ? await hybridSearch(question, queryEmbedding, poolK, { source })
    : await search(queryEmbedding, poolK, { source });
  const firstPass = firstPassRaw.map((r) => ({
    id: r.id,
    text: r.text,
    source: r.source,
    score: r.score,
    vectorRank: "vectorRank" in r ? r.vectorRank : undefined,
    keywordRank: "keywordRank" in r ? r.keywordRank : undefined,
  }));

  const retrievedRaw = rerank
    ? (await rerankCandidates(question, firstPass, topK)).map(({ item, rerankScore }) => ({
        ...item,
        score: rerankScore,
        origScore: item.score,
      }))
    : firstPass;

  const modeParts = [hybrid ? "hybrid: vector+BM25 via RRF" : "vector only"];
  if (rerank) modeParts.push("reranked (cross-encoder)");
  const mode = modeParts.join(" -> ");
  const cutoff = rerank ? RERANK_MIN_SCORE : hybrid ? HYBRID_MIN_SCORE : MIN_SCORE;

  const retrieved: RetrievedChunk[] = retrievedRaw.map((r) => ({
    ...r,
    belowCutoff: r.score < cutoff,
  }));

  yield { type: "retrieved", chunks: retrieved, mode, cutoff, source, topK };

  const relevant = retrieved.filter((r) => !r.belowCutoff);
  if (relevant.length === 0) {
    yield { type: "no-context", cutoff };
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

  let answer: string;
  if (stream) {
    let full = "";
    for await (const token of generateStream(systemPrompt, userPrompt)) {
      full += token;
      yield { type: "token", text: token };
    }
    answer = full;
  } else {
    answer = await generate(systemPrompt, userPrompt);
  }
  yield { type: "answer", text: answer };

  const { citedSources, invalidMarkers } = checkCitations(answer, relevant);
  yield { type: "citations", citedSources, invalidMarkers };
}
