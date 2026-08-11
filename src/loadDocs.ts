import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chunkText, type Chunk } from "./chunk";

export async function loadCorpus(dir: string): Promise<Chunk[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const chunks: Chunk[] = [];

  for (const file of files) {
    const text = await readFile(path.join(dir, file), "utf-8");
    chunks.push(...chunkText(text, file));
  }

  return chunks;
}
