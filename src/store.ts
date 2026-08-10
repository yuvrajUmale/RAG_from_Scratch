import type { Chunk } from "./chunk.js";

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface ScoredChunk extends EmbeddedChunk {
  score: number;
}
