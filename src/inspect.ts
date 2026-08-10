import * as lancedb from "@lancedb/lancedb";

const DB_PATH = "./.lancedb";
const TABLE_NAME = "chunks";

interface Row {
  id: string;
  text: string;
  source: string;
  vector: Float32Array;
}

/**
 * Reads the LanceDB table directly (no embedding, no search) to verify
 * indexing wrote what we expect -- separate from ask.ts, which only ever
 * exercises the query path.
 */
async function main() {
  const db = await lancedb.connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  const rowCount = await table.countRows();
  console.log(`Total rows in table: ${rowCount}`);

  const rows = (await table.query().toArray()) as Row[];

  const bySource = new Map<string, number>();
  for (const row of rows) {
    bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
  }
  console.log("\nChunks per source file:");
  for (const [source, count] of [...bySource.entries()].sort()) {
    console.log(`  ${source}: ${count}`);
  }

  const vectorLengths = new Set(rows.map((r) => r.vector.length));
  console.log(`\nVector dimensions seen: ${[...vectorLengths].join(", ")}`);

  const sample = rows[0];
  console.log("\nSample row:");
  console.log(`  id: ${sample.id}`);
  console.log(`  source: ${sample.source}`);
  console.log(`  text: "${sample.text.slice(0, 60)}..."`);
  console.log(`  vector: [${Array.from(sample.vector.slice(0, 5)).map((n) => n.toFixed(4))}, ...] (${sample.vector.length} dims)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
