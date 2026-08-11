export interface EvalCase {
  question: string;
  // Source files that must survive the mode's cutoff and end up cited.
  // Empty array = a "not in corpus" question -- the correct behavior is for
  // no chunk to survive the cutoff at all (see eval.ts's grading logic).
  expectedSources: string[];
  // Modes (mode label strings, matching AskEvent's `mode` field) already
  // known, from manual testing logged in earlier stages, to fail this case.
  // Lets the report distinguish "expected, already-understood limitation"
  // from "new regression" instead of just flagging every failure the same way.
  knownFailureModes?: string[];
  note?: string;
}

export const EVAL_SET: EvalCase[] = [
  {
    question: "How many days of PTO do I get and can I carry it over?",
    expectedSources: ["pto-policy.md"],
    note: "Easy case, single doc, high-overlap vocabulary.",
  },
  {
    question: "When do I meet my skip-level manager?",
    expectedSources: ["onboarding-checklist.md"],
    note: "Easy case -- vector and BM25 already agreed on this one (Stage 3).",
  },
  {
    question: "Do I need 2FA on my accounts?",
    expectedSources: ["security-guidelines.md"],
    note: "Acronym never spelled out verbatim in the corpus.",
  },
  {
    question: "Do I get reimbursed for a coworking space?",
    expectedSources: ["remote-work-policy.md"],
    knownFailureModes: ["vector only"],
    note: "Stage 3 blind spot: vector search ranks this 5th at 0.21, missing top-3 entirely. Hybrid and rerank both recover it (Stage 3/4).",
  },
  {
    question: "How fast will I get my money back after a trip?",
    expectedSources: ["expense-reimbursement.md"],
    knownFailureModes: ["vector only -> reranked (cross-encoder)", "hybrid: vector+BM25 via RRF -> reranked (cross-encoder)"],
    note: "Stage 4 blind spot: heavy paraphrase, no lexical overlap with 'reimburse' -- cross-encoder scores the correct chunk ~0.002, below RERANK_MIN_SCORE, in both rerank and hybrid+rerank.",
  },
  {
    question: "How quickly do I need to report a security incident, and how much advance notice do I need for PTO?",
    expectedSources: ["security-guidelines.md", "pto-policy.md"],
    note: "Compound cross-doc question (Stage 2 test).",
  },
  {
    question: "Can I expense a gym membership?",
    expectedSources: [],
    note: "Stage 2's concrete hallucination case (top score 0.384, model invented an outside-knowledge justification) -- now guarded by MIN_SCORE.",
  },
  {
    question: "What is the company's dress code policy?",
    expectedSources: [],
    note: "Not in corpus, no topical adjacency -- the clean negative case.",
  },
  {
    question: "What is the parental leave policy?",
    expectedSources: [],
    note: "Not in corpus (Stage 2 test).",
  },
];
