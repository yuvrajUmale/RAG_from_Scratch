import type { Chunk } from "./chunk.js";

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface ScoredChunk extends EmbeddedChunk {
  score: number;
}

// Embeddings are normalized (see embed.ts), so cosine similarity reduces to
// a plain dot product.
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function search(
  queryEmbedding: number[],
  chunks: EmbeddedChunk[],
  topK: number
): ScoredChunk[] {
  return chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
