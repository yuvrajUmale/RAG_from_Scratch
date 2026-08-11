import { AutoTokenizer, AutoModelForSequenceClassification } from "@xenova/transformers";

// A cross-encoder scores (query, chunk) jointly through one model, rather
// than comparing two separately-computed embeddings (a bi-encoder, what
// vector search does) -- more accurate because the model can attend across
// both texts at once, but too slow to run over a whole corpus, so it's used
// as a second pass over a small candidate pool a cheaper method already
// narrowed down.
const MODEL_ID = "Xenova/ms-marco-MiniLM-L-6-v2";

let tokenizerPromise: ReturnType<typeof AutoTokenizer.from_pretrained> | null = null;
let modelPromise: ReturnType<typeof AutoModelForSequenceClassification.from_pretrained> | null = null;

function getTokenizer() {
  if (!tokenizerPromise) tokenizerPromise = AutoTokenizer.from_pretrained(MODEL_ID);
  return tokenizerPromise;
}
function getModel() {
  if (!modelPromise) modelPromise = AutoModelForSequenceClassification.from_pretrained(MODEL_ID);
  return modelPromise;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface Reranked<T> {
  item: T;
  rerankScore: number;
}

/**
 * Re-scores each candidate against the query with a cross-encoder and
 * returns the top-k by that score. The model outputs one raw relevance
 * logit per pair (unbounded, roughly -11 to +11 on this corpus) -- squashed
 * through a sigmoid so scores land in (0, 1) and are comparable to the
 * cutoffs used elsewhere in ask.ts.
 */
export async function rerank<T extends { text: string }>(
  query: string,
  candidates: T[],
  topK: number,
): Promise<Reranked<T>[]> {
  const tokenizer = await getTokenizer();
  const model = await getModel();

  const scored: Reranked<T>[] = [];
  for (const item of candidates) {
    const inputs = await tokenizer(query, { text_pair: item.text, padding: true, truncation: true });
    const { logits } = await model(inputs);
    scored.push({ item, rerankScore: sigmoid(logits.data[0]) });
  }

  return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
}
