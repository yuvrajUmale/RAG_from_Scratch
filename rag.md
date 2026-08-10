# RAG Learning Project

> This note is the persistent context/log for this project. Open the `rag/` folder as an Obsidian vault to browse it. Claude updates this file as we progress so a new chat can pick up with full context by reading this note first.

## Status
**Stage:** 2 (Real vector store) — ✅ COMPLETE. Swapped the in-memory array for **LanceDB** (embedded, file-based, no server), and split the pipeline into two steps: `npm run index` (embed corpus once, persist to `.lancedb/`) and `npm run ask` (just embeds the question, queries the persisted table — no corpus re-embedding per question anymore). Verified identical retrieval scores to Stage 1 on the same test queries, confirming the swap changed the architecture, not the correctness.
**Last updated:** 2026-08-10

Stage 1 recap: ✅ complete, fully free/local, verified with several test queries covering all 5 docs, a compound cross-doc question, and a hallucination-guard check — all correct. Code walked through in detail with the user (every file's logic explained).

## GitHub
**Repo:** https://github.com/yuvrajUmale/rag-learning (public)
Pushed via `gh` CLI (installed via winget, browser device-code login). `.env` (unused in Stage 1, kept for future) is gitignored — no secrets in the repo. Obsidian's local UI-state files (`workspace.json`, `graph.json`) are also gitignored to avoid commit noise. Commit each stage as it's completed going forward.

## Use Case (decided)
**"Chat with your own docs"** — ingest a folder of Markdown/text files, chunk them, embed them, retrieve relevant chunks for a question, and generate a grounded answer with citations.

Why this one: no external API/scraping dependency for data, small dataset = fast iteration, still touches every core RAG concept.

Corpus: building from scratch — we'll write a small set of our own sample Markdown notes as the test corpus (not reusing existing project READMEs). Everything else (chunking, embedding, retrieval, LLM calls) is also built from scratch, no starter templates.

## Learning Progression (basic → advanced)

| Stage                | What we build                                                                                                     | Concepts                                             | Status        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| 1. Naive RAG         | Load .md files → chunk → embed → in-memory JSON store → cosine similarity search → stuff into prompt → LLM answer | chunking, embeddings, retrieval, prompt construction | ✅ Done — tested end-to-end |
| 2. Real vector store | Swap in-memory for a proper vector DB (Chroma/LanceDB, or hosted)                                                 | indexing, persistence, ANN search                    | ✅ Done — LanceDB, tested end-to-end |
| 3. Better retrieval  | Metadata filtering, top-k tuning, hybrid search (keyword + vector)                                                | recall/precision tradeoffs                           | ⬜ Not started |
| 4. Quality           | Re-ranking, source citations, streaming answers                                                                   | grounding, hallucination reduction                   | ⬜ Not started |
| 5. Interface         | Wrap in a simple Next.js chat UI (CLI first)                                                                      | end-to-end product                                   | ⬜ Not started |
| 6. Evaluation        | Small eval set — does retrieval find the right chunk? does the answer stay grounded?                              | RAG evaluation                                       | ⬜ Not started |

## Stack (as built — through Stage 2, fully free/local)
- TypeScript throughout (consistent with `contentDashboard/`, `kaio/`, `chamberonly/`), CLI-first
- **Generation:** local via **Ollama** (`llama3.2:3b`, ~2GB), called over its local REST API (`http://localhost:11434/api/chat`) — no API key, no billing, runs offline. Switched from Claude Haiku 4.5 after hitting an empty-credits Anthropic account; user chose the free local path over adding billing or using another hosted provider.
- **Embeddings:** Anthropic has no embeddings API. Using **local, free embeddings via `@xenova/transformers`** (`Xenova/all-MiniLM-L6-v2`, runs directly in Node — no API key, no extra account). Voyage AI (Anthropic's recommended hosted embeddings partner) remains a possible future upgrade if we want higher-quality embeddings.
- **Vector store (Stage 2):** **LanceDB** (`@lancedb/lancedb`) — embedded, file-based (like SQLite for vectors), no server process, persists to `./.lancedb/` on disk. Chosen over ChromaDB (needs a running server) and hosted options (needs signup/API key) to keep the "no extra service" pattern established with Ollama. Cosine distance via `.vectorSearch(vec).distanceType("cosine")`; converted to similarity (`1 - distance`) to stay comparable with Stage 1's scores.
- **Corpus:** a handful of our own sample Markdown notes, written from scratch

## Project Layout
- `rag/rag.md` — this note (vault root)
- `rag/sample-docs/` — the sample corpus (from scratch, 5 files)
- `rag/src/chunk.ts` — paragraph-based chunking
- `rag/src/embed.ts` — local embedding model (cached pipeline across calls in one run)
- `rag/src/store.ts` — shared `EmbeddedChunk`/`ScoredChunk` type definitions only (the Stage 1 in-memory cosine-similarity search itself was removed once LanceDB took over that job)
- `rag/src/vectorstore.ts` — LanceDB wrapper: `buildTable()` (indexing) and `search()` (query time)
- `rag/src/loadDocs.ts` — corpus loader
- `rag/src/llm.ts` — generation call to local Ollama
- `rag/src/index.ts` — **indexing script** (`npm run index`): load → chunk → embed → persist to LanceDB. Run this once, or whenever `sample-docs/` changes.
- `rag/src/ask.ts` — **query script** (`npm run ask -- "..."`): embed the question → search the persisted table → prompt → generate → print (also prints retrieved chunks + similarity scores, for learning visibility). No longer re-embeds the corpus on every question.
- `rag/package.json`, `rag/tsconfig.json`
- `rag/.lancedb/` — generated index data (gitignored, rebuild anytime via `npm run index`)
- `rag/.env` / `.env.example` — currently unused (needs no keys so far); kept for a possible future Stage where we reintroduce a hosted model (e.g. Voyage embeddings or swapping generation back to Claude)

## Open Questions
- None currently blocking. Worth deciding later: keep Ollama as the permanent generation backend, or reintroduce Claude (would need Anthropic billing) for a quality comparison?

## Sample Corpus
`rag/sample-docs/` — a small fictional company handbook (5 files), chosen so each question has one clearly correct source doc, making it easy to verify retrieval is actually working (not hallucinating): `remote-work-policy.md`, `onboarding-checklist.md`, `expense-reimbursement.md`, `security-guidelines.md`, `pto-policy.md`.

## How to run (current, Stage 2)
1. Make sure Ollama is running (`ollama serve`, or it may already be running as a background service after install)
2. `npm install` (already done)
3. `npm run index` — builds the LanceDB index from `sample-docs/` (run once, or again after editing/adding docs)
4. `npm run ask -- "your question about the handbook"` — as many times as you want, no re-indexing

No `.env` / API key needed — everything runs locally.

## Verified test results
- **Stage 1 (2026-08-10):** `"How many days of PTO do I get and can I carry it over?"` → retrieved all top-3 chunks from `pto-policy.md` only (scores 0.79/0.60/0.52); answer correctly stated 15 days/year, 5 days carryover. `"What is the company's dress code policy?"` (not in corpus) → retrieval scores dropped to ~0.2-0.3 (vs ~0.5-0.8 on the hit above — a useful signal for a future min-score cutoff); model correctly answered "I couldn't find any information..." instead of hallucinating.
- **Stage 2 (2026-08-10):** Re-ran both of the above against the LanceDB-backed pipeline — identical scores and answers, confirming the vector-store swap preserved correctness. Also confirmed `npm run ask` no longer prints an "Indexing corpus..." step — it goes straight to retrieval against the persisted table.

## Session Log
- **2026-08-10:** Discussed use cases (e-commerce Q&A, Valorant strategy assistant, personal KB, other). User chose "simple, easy to build, easy to learn, basic → advanced" — landed on "chat with your own docs." User asked to persist all project context in Obsidian so new chats have full context; using this file (`rag/rag.md`) as the vault's main note, with `rag/` as the vault folder.
- **2026-08-10:** Confirmed CLI-first. Researched embeddings (Anthropic has no embeddings API) and chose local `@xenova/transformers` over Voyage AI for zero-setup learning; initially chose `claude-haiku-4-5` for generation. Scaffolded the project, wrote 5 sample corpus docs, built the full Stage 1 pipeline. `npm install` succeeded. First live test hit `400 — Your credit balance is too low` (Anthropic account has no billing set up), even though retrieval itself was proven correct.
- **2026-08-10:** User asked for a free way to build this. Presented options (local Ollama vs. free-tier hosted provider vs. add Anthropic credit); user chose **local Ollama**. Installed Ollama via `winget install Ollama.Ollama`, pulled `llama3.2:3b` (2GB). Rewrote `src/ask.ts` to call a new `src/llm.ts` (local Ollama REST API) instead of the Anthropic SDK; removed the now-unused `@anthropic-ai/sdk` and `dotenv` dependencies. Verified end-to-end with two test queries (see Verified test results above) — Stage 1 is now complete, fully free, and fully local.
- **2026-08-10:** Ran several more test questions (per-doc sanity checks, a compound cross-doc question, "not in corpus" checks) — all correct, including a subtle grounding-gap observation on the compound question (model inferred an answer instead of citing the exact retrieved constraint — a preview of what Stage 4 fixes). Walked the user through every file's code and logic in detail (chunk.ts, loadDocs.ts, embed.ts, store.ts, llm.ts, ask.ts). User asked to push to GitHub before starting Stage 2: installed `gh` CLI via winget, authenticated via browser device-code flow, configured git identity, initialized the repo, and pushed to a new **public** repo at https://github.com/yuvrajUmale/rag-learning. Added `.obsidian/workspace.json` and `.obsidian/graph.json` to `.gitignore` (local UI state, not shared config) in a follow-up commit. Left a few empty stray Obsidian files (an empty daily note, two empty canvases) untouched and untracked — user's own files, not part of the project.
- **2026-08-10:** Started Stage 2. Discussed vector DB options (LanceDB vs ChromaDB vs hosted); user chose **LanceDB** to keep the local/no-extra-service pattern. Explored the `@lancedb/lancedb` TS types directly (no cached docs for this package) to get the real API shape rather than guessing. Built `src/vectorstore.ts` (buildTable/search) and `src/index.ts` (new separate indexing script), removed the now-redundant in-memory search from `store.ts` (kept only its type definitions, now shared with vectorstore.ts), rewired `ask.ts` to query the persisted table instead of rebuilding the index every run, added an `npm run index` script, and gitignored the generated `.lancedb/` directory. Fixed a few TS errors along the way (LanceDB expects `Record<string, unknown>[]` not a typed interface for `createTable`; `.search()` returns a union type so `.vectorSearch()` is needed for a properly-typed chainable query; the returned vector column is a `Float32Array`, not `number[]`). Verified end-to-end: `npm run index` built the table, then `npm run ask` reproduced Stage 1's exact scores/answers on both test queries with no corpus re-embedding — confirming the architecture change didn't affect correctness.
