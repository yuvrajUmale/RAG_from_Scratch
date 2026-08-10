import * as lancedb from "@lancedb/lancedb";
import type { EmbeddedChunk, ScoredChunk } from "./store.js";

const DB_PATH = "./.lancedb";
const TABLE_NAME = "chunks";

interface SearchResultRow {
  id: string;
  text: string;
  source: string;
  vector: Float32Array;
  _distance: number;
}

/**
 * (Re)builds the on-disk table from scratch. Called by the indexing step
 * only — the ask step just opens what's already there.
 */
export async function buildTable(chunks: EmbeddedChunk[]): Promise<void> {
  const db = await lancedb.connect(DB_PATH);
  const rows: Record<string, unknown>[] = chunks.map((c) => ({
    id: c.id,
    text: c.text,
    source: c.source,
    vector: c.embedding,
  }));
  await db.createTable(TABLE_NAME, rows, { mode: "overwrite" });
}

export async function search(queryEmbedding: number[], topK: number): Promise<ScoredChunk[]> {
  const db = await lancedb.connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  const rows = await table
    .vectorSearch(queryEmbedding)
    .distanceType("cosine")
    .limit(topK)
    .toArray();

  // LanceDB returns cosine *distance* (0 = identical); Stage 1 used cosine
  // *similarity* (1 = identical) — convert so scores stay comparable.
  return rows.map((row: SearchResultRow) => ({
    id: row.id,
    text: row.text,
    source: row.source,
    embedding: Array.from(row.vector),
    score: 1 - row._distance,
  }));
}
