import { answerQuestion, type AskOptions, type RetrievedChunk } from "./answer";
import { EVAL_SET, type EvalCase } from "./evalSet";

interface ModeConfig {
  label: string;
  options: AskOptions;
}

// The four modes wired up through Stage 4's CLI flags. Not testing --source=
// or --k= here since those are user-controlled narrowing, not something an
// eval set of fixed questions meaningfully grades.
const MODES: ModeConfig[] = [
  { label: "vector", options: { hybrid: false, rerank: false } },
  { label: "hybrid", options: { hybrid: true, rerank: false } },
  { label: "rerank", options: { hybrid: false, rerank: true } },
  { label: "hybrid+rerank", options: { hybrid: true, rerank: true } },
];

interface RunResult {
  mode: string;
  askMode: string; // the `mode` string answerQuestion() actually reports, for matching knownFailureModes
  chunks: RetrievedChunk[];
  relevant: RetrievedChunk[];
  noContext: boolean;
  citedSources: string[];
  invalidMarkers: number[];
}

async function runOne(question: string, options: AskOptions): Promise<RunResult> {
  const result: RunResult = {
    mode: "",
    askMode: "",
    chunks: [],
    relevant: [],
    noContext: false,
    citedSources: [],
    invalidMarkers: [],
  };
  for await (const event of answerQuestion(question, options)) {
    if (event.type === "retrieved") {
      result.askMode = event.mode;
      result.chunks = event.chunks;
      result.relevant = event.chunks.filter((c) => !c.belowCutoff);
    } else if (event.type === "no-context") {
      result.noContext = true;
    } else if (event.type === "citations") {
      result.citedSources = event.citedSources;
      result.invalidMarkers = event.invalidMarkers;
    }
  }
  return result;
}

type Verdict = "PASS" | "FAIL" | "FAIL (known)";

function grade(evalCase: EvalCase, run: RunResult): { retrieval: Verdict; grounded: Verdict } {
  const isKnownFailure = evalCase.knownFailureModes?.includes(run.askMode) ?? false;
  const failVerdict: Verdict = isKnownFailure ? "FAIL (known)" : "FAIL";

  if (evalCase.expectedSources.length === 0) {
    // Negative case: correct behavior is that nothing survives the cutoff,
    // so generation never runs -- structurally impossible to hallucinate,
    // not just "the model happened not to."
    const pass = run.noContext;
    const verdict = pass ? "PASS" : failVerdict;
    return { retrieval: verdict, grounded: verdict };
  }

  const retrievalPass = evalCase.expectedSources.every((s) => run.relevant.some((c) => c.source === s));
  const groundedPass =
    !run.noContext &&
    evalCase.expectedSources.every((s) => run.citedSources.includes(s)) &&
    run.invalidMarkers.length === 0;

  return {
    retrieval: retrievalPass ? "PASS" : failVerdict,
    grounded: groundedPass ? "PASS" : failVerdict,
  };
}

async function main() {
  const summary = new Map<string, { retrieval: number; grounded: number; total: number }>();
  for (const m of MODES) summary.set(m.label, { retrieval: 0, grounded: 0, total: 0 });

  for (const evalCase of EVAL_SET) {
    console.log(`\n=== "${evalCase.question}" ===`);
    console.log(
      `Expected: ${evalCase.expectedSources.length > 0 ? evalCase.expectedSources.join(", ") : "(not in corpus)"}`,
    );
    if (evalCase.note) console.log(`Note: ${evalCase.note}`);

    for (const m of MODES) {
      const run = await runOne(evalCase.question, m.options);
      const { retrieval, grounded } = grade(evalCase, run);

      const s = summary.get(m.label)!;
      s.total++;
      if (retrieval === "PASS") s.retrieval++;
      if (grounded === "PASS") s.grounded++;

      const scoresStr = run.chunks.map((c) => `${c.source}:${c.score.toFixed(3)}${c.belowCutoff ? "x" : ""}`).join(" | ");
      console.log(
        `  [${m.label.padEnd(13)}] retrieval=${retrieval.padEnd(12)} grounded=${grounded.padEnd(12)} cited=[${run.citedSources.join(",")}]  ${scoresStr}`,
      );
    }
  }

  console.log("\n=== Summary (pass / total) ===");
  console.log(`${"mode".padEnd(15)} retrieval   grounded`);
  for (const m of MODES) {
    const s = summary.get(m.label)!;
    console.log(`${m.label.padEnd(15)} ${`${s.retrieval}/${s.total}`.padEnd(11)} ${s.grounded}/${s.total}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
