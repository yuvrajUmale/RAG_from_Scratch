import { answerQuestion } from "./answer";

function parseArgs(
  argv: string[],
): { question: string; source?: string; topK: number; hybrid: boolean; rerank: boolean; stream: boolean } {
  let source: string | undefined;
  let topK = 3;
  let hybrid = false;
  let rerank = false;
  let stream = false;
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
    } else if (arg.startsWith("--k=")) {
      topK = Number(arg.slice("--k=".length));
    } else if (arg === "--hybrid") {
      hybrid = true;
    } else if (arg === "--rerank") {
      rerank = true;
    } else if (arg === "--stream") {
      stream = true;
    } else {
      rest.push(arg);
    }
  }
  return { question: rest.join(" ").trim(), source, topK, hybrid, rerank, stream };
}

async function main() {
  const { question, source, topK, hybrid, rerank, stream } = parseArgs(process.argv.slice(2));
  if (!question) {
    console.error(
      'Usage: npm run ask -- "your question" [--source=filename.md] [--k=N] [--hybrid] [--rerank] [--stream]',
    );
    console.error('(Run `npm run index` first if you haven\'t built the index yet.)');
    process.exit(1);
  }

  let answerPrinted = false;
  for await (const event of answerQuestion(question, { source, topK, hybrid, rerank, stream })) {
    switch (event.type) {
      case "retrieved": {
        console.log(
          `Retrieved chunks${event.source ? ` (filtered to source="${event.source}")` : ""} (top-${event.topK}, ${event.mode}):`,
        );
        for (const r of event.chunks) {
          const ranks =
            r.vectorRank !== undefined || r.keywordRank !== undefined
              ? ` (vecRank=${r.vectorRank ?? "-"}, kwRank=${r.keywordRank ?? "-"})`
              : "";
          const orig = r.origScore !== undefined ? ` (pre-rerank score: ${r.origScore.toFixed(4)})` : "";
          const belowCutoff = r.belowCutoff ? " (below cutoff, excluded)" : "";
          console.log(
            `  [${r.score.toFixed(4)}] ${r.source} — "${r.text.slice(0, 60)}..."${ranks}${orig}${belowCutoff}`,
          );
        }
        console.log();
        break;
      }
      case "no-context": {
        console.log("Answer:");
        console.log(
          `No retrieved chunk scored above the relevance cutoff (${event.cutoff}) -- ` +
            "skipping generation rather than risk an answer built on weak context.",
        );
        break;
      }
      case "token": {
        if (!answerPrinted) {
          console.log("Answer:");
          answerPrinted = true;
        }
        process.stdout.write(event.text);
        break;
      }
      case "answer": {
        if (!stream) {
          console.log("Answer:");
          console.log(event.text);
        } else {
          console.log();
        }
        break;
      }
      case "citations": {
        console.log();
        console.log(
          event.citedSources.length > 0
            ? `Sources: ${event.citedSources.join(", ")}`
            : "Sources: none cited -- answer may not be grounded in the retrieved context.",
        );
        if (event.invalidMarkers.length > 0) {
          console.log(
            `Warning: answer cited [${event.invalidMarkers.join(", ")}] which ${event.invalidMarkers.length === 1 ? "doesn't" : "don't"} correspond to any retrieved chunk -- possible fabricated citation.`,
          );
        }
        break;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
