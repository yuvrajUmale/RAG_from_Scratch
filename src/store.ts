import type { Chunk } from "./chunk";

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface ScoredChunk extends EmbeddedChunk {
  score: number;
}
