export interface CitationCheck {
  citedSources: string[];
  invalidMarkers: number[];
}

/**
 * Scans the generated answer for `[n]` markers and resolves them against the
 * actual retrieved chunks, rather than trusting whatever source names the
 * model writes in prose (seen this session to be inconsistent -- sometimes a
 * filename, sometimes just "[2]", sometimes wrong). `[n]` maps to the n-th
 * chunk in the context the model was given (1-indexed, matching how the
 * context block itself is numbered in ask.ts). A marker outside that range
 * is a sign the model invented a citation rather than pointing at real
 * context -- surfaced separately so it isn't silently swallowed.
 */
export function checkCitations(answer: string, contextChunks: { source: string }[]): CitationCheck {
  const markers = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const citedSources: string[] = [];
  const invalidMarkers: number[] = [];

  for (const n of new Set(markers)) {
    const chunk = contextChunks[n - 1];
    if (chunk) {
      if (!citedSources.includes(chunk.source)) citedSources.push(chunk.source);
    } else {
      invalidMarkers.push(n);
    }
  }

  return { citedSources, invalidMarkers };
}
