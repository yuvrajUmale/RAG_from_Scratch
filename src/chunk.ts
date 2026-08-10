export interface Chunk {
  id: string;
  text: string;
  source: string;
}

/**
 * Naive paragraph-based chunking: split on blank lines. Good enough for our
 * short sample docs — real corpora need size-bounded chunking with overlap
 * (that's a Stage 2/3 concern, not a Stage 1 one).
 */
export function chunkText(text: string, source: string): Chunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("#")); // drop the title heading

  return paragraphs.map((text, i) => ({
    id: `${source}#${i}`,
    text,
    source,
  }));
}
