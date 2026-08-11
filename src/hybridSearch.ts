import { search as vectorSearch, getAllChunks } from "./vectorstore";
import { bm25Search } from "./keywordSearch";

export interface HybridResult {
  id: string;
  text: string;
  source: string;
  score: number;
  vectorRank?: number;
  keywordRank?: number;
}

// The constant from the original RRF paper (Cormack et al.). Large enough
// that rank 1 vs rank 2 doesn't dominate the fused score too aggressively.
const RRF_K = 10;

// A chunk ranked #1 by both vector and BM25 gets the highest possible fused
// score: 1/(RRF_K+1) from each method, summed. Dividing every fused score by
// this ceiling rescales results into (0, 1] -- comparable in *shape* to
// cosine similarity's 0-1 range, so the same kind of min-score cutoff can be
// applied in hybrid mode (raw RRF scores, ~0.016-0.033, were nowhere near
// MIN_SCORE=0.4 and could never trigger it).
const MAX_RRF_SCORE = 2 / (RRF_K + 1);

/**
 * Combines vector search and BM25 keyword search via Reciprocal Rank Fusion:
 * each method contributes 1/(RRF_K + rank) per chunk it surfaces, summed
 * across methods. RRF only looks at *rank position* in each list, not the
 * raw scores -- which sidesteps the fact that cosine similarity and BM25
 * scores live on totally different, non-comparable scales.
 */
export async function hybridSearch(
  question: string,
  queryEmbedding: number[],
  topK: number,
  options: { source?: string } = {},
): Promise<HybridResult[]> {
  const poolSize = Math.max(topK * 3, 5);

  const vectorResults = await vectorSearch(queryEmbedding, poolSize, options);

  let corpus = await getAllChunks();
  if (options.source) corpus = corpus.filter((c) => c.source === options.source);
  const keywordResults = bm25Search(question, corpus, poolSize);

  const fusedScore = new Map<string, number>();
  const vectorRank = new Map<string, number>();
  const keywordRank = new Map<string, number>();
  const chunkById = new Map<string, { text: string; source: string }>();

  vectorResults.forEach((r, i) => {
    fusedScore.set(r.id, (fusedScore.get(r.id) ?? 0) + 1 / (RRF_K + i + 1));
    vectorRank.set(r.id, i + 1);
    chunkById.set(r.id, { text: r.text, source: r.source });
  });
  keywordResults.forEach((r, i) => {
    fusedScore.set(r.id, (fusedScore.get(r.id) ?? 0) + 1 / (RRF_K + i + 1));
    keywordRank.set(r.id, i + 1);
    if (!chunkById.has(r.id)) chunkById.set(r.id, { text: r.text, source: r.source });
  });

  return [...fusedScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({
      id,
      ...chunkById.get(id)!,
      score: score / MAX_RRF_SCORE,
      vectorRank: vectorRank.get(id),
      keywordRank: keywordRank.get(id),
    }));
}
