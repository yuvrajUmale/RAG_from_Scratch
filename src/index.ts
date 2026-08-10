import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus } from "./loadDocs.js";
import { embedBatch } from "./embed.js";
import { buildTable } from "./vectorstore.js";
import type { EmbeddedChunk } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, "..", "sample-docs");

async function main() {
  console.log("Loading and chunking corpus...");
  const chunks = await loadCorpus(CORPUS_DIR);
  console.log(`${chunks.length} chunks from ${new Set(chunks.map((c) => c.source)).size} files.`);

  console.log("Embedding chunks (one-time cost per doc change)...");
  const embeddings = await embedBatch(chunks.map((c) => c.text));
  const embedded: EmbeddedChunk[] = chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] }));

  console.log("Writing to LanceDB (./.lancedb)...");
  await buildTable(embedded);

  console.log("Done. Run `npm run ask -- \"your question\"` any time without re-indexing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
