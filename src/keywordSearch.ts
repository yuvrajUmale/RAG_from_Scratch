export interface KeywordDoc {
  id: string;
  text: string;
  source: string;
}

export interface KeywordScore extends KeywordDoc {
  score: number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

// Standard BM25 tuning constants (k1 controls term-frequency saturation, b
// controls how much document length is penalized).
const K1 = 1.5;
const B = 0.75;

/**
 * BM25 keyword search: ranks docs by lexical term overlap with the query,
 * weighting rare terms higher (IDF) and penalizing longer docs. Built from
 * scratch, no library, since that's the whole point of this project.
 * Complements vector search -- catches exact terms/numbers embeddings can
 * blur together, but has zero notion of synonyms or paraphrase.
 */
export function bm25Search(query: string, docs: KeywordDoc[], topK: number): KeywordScore[] {
  if (docs.length === 0) return [];

  const queryTerms = tokenize(query);
  const tokenizedDocs = docs.map((d) => tokenize(d.text));
  const docLengths = tokenizedDocs.map((t) => t.length);
  const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;
  const N = docs.length;

  const docFreq = new Map<string, number>();
  for (const term of new Set(queryTerms)) {
    docFreq.set(term, tokenizedDocs.filter((doc) => doc.includes(term)).length);
  }

  const scored = docs.map((doc, i) => {
    const termFreq = new Map<string, number>();
    for (const t of tokenizedDocs[i]) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const tf = termFreq.get(term) ?? 0;
      if (tf === 0) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      const denom = tf + K1 * (1 - B + B * (docLengths[i] / avgDocLength));
      score += idf * ((tf * (K1 + 1)) / denom);
    }
    return { id: doc.id, text: doc.text, source: doc.source, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
