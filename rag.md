# RAG Learning Project

> This note is the persistent context/log for this project. Open the `rag/` folder as an Obsidian vault to browse it. Claude updates this file as we progress so a new chat can pick up with full context by reading this note first.

## Status
**Stage:** 1 (Naive RAG) — ✅ COMPLETE, fully working end-to-end, 100% free/local (no API key needed at all). Verified with two test queries: a grounded answer ("How many PTO days...") that correctly cited only `pto-policy.md`, and a hallucination-guard check ("dress code policy" — not in the corpus) that correctly answered "I couldn't find any information..." instead of making something up.
**Last updated:** 2026-08-10

## Use Case (decided)
**"Chat with your own docs"** — ingest a folder of Markdown/text files, chunk them, embed them, retrieve relevant chunks for a question, and generate a grounded answer with citations.

Why this one: no external API/scraping dependency for data, small dataset = fast iteration, still touches every core RAG concept.

Corpus: building from scratch — we'll write a small set of our own sample Markdown notes as the test corpus (not reusing existing project READMEs). Everything else (chunking, embedding, retrieval, LLM calls) is also built from scratch, no starter templates.

## Learning Progression (basic → advanced)

| Stage                | What we build                                                                                                     | Concepts                                             | Status        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| 1. Naive RAG         | Load .md files → chunk → embed → in-memory JSON store → cosine similarity search → stuff into prompt → LLM answer | chunking, embeddings, retrieval, prompt construction | ✅ Done — tested end-to-end |
| 2. Real vector store | Swap in-memory for a proper vector DB (Chroma/LanceDB, or hosted)                                                 | indexing, persistence, ANN search                    | ⬜ Not started |
| 3. Better retrieval  | Metadata filtering, top-k tuning, hybrid search (keyword + vector)                                                | recall/precision tradeoffs                           | ⬜ Not started |
| 4. Quality           | Re-ranking, source citations, streaming answers                                                                   | grounding, hallucination reduction                   | ⬜ Not started |
| 5. Interface         | Wrap in a simple Next.js chat UI (CLI first)                                                                      | end-to-end product                                   | ⬜ Not started |
| 6. Evaluation        | Small eval set — does retrieval find the right chunk? does the answer stay grounded?                              | RAG evaluation                                       | ⬜ Not started |

## Stack (as built — Stage 1, fully free/local)
- TypeScript throughout (consistent with `contentDashboard/`, `kaio/`, `chamberonly/`), CLI-first
- **Generation:** local via **Ollama** (`llama3.2:3b`, ~2GB), called over its local REST API (`http://localhost:11434/api/chat`) — no API key, no billing, runs offline. Switched from Claude Haiku 4.5 after hitting an empty-credits Anthropic account; user chose the free local path over adding billing or using another hosted provider.
- **Embeddings:** Anthropic has no embeddings API. Using **local, free embeddings via `@xenova/transformers`** (`Xenova/all-MiniLM-L6-v2`, runs directly in Node — no API key, no extra account). Voyage AI (Anthropic's recommended hosted embeddings partner) remains the planned Stage 2 upgrade if we later want higher-quality embeddings.
- **Vector store (Stage 1):** plain in-memory array + cosine similarity, no DB, rebuilt on every CLI run (no persistence yet — that's Stage 2)
- **Corpus:** a handful of our own sample Markdown notes, written from scratch

## Project Layout
- `rag/rag.md` — this note (vault root)
- `rag/sample-docs/` — the sample corpus (from scratch, 5 files)
- `rag/src/chunk.ts` — paragraph-based chunking
- `rag/src/embed.ts` — local embedding model (cached pipeline across calls in one run)
- `rag/src/store.ts` — in-memory cosine-similarity search
- `rag/src/loadDocs.ts` — corpus loader
- `rag/src/llm.ts` — generation call to local Ollama
- `rag/src/ask.ts` — CLI entrypoint: index → retrieve → prompt → generate → print (also prints retrieved chunks + similarity scores, for learning visibility)
- `rag/package.json`, `rag/tsconfig.json`
- `rag/.env` / `.env.example` — currently unused (Stage 1 needs no keys); kept for a possible future Stage where we reintroduce a hosted model (e.g. Voyage embeddings or swapping generation back to Claude)

## Open Questions
- None currently blocking. Worth deciding when we get to Stage 2/3: keep Ollama as the permanent generation backend, or reintroduce Claude (would need Anthropic billing) for a quality comparison?

## Sample Corpus
`rag/sample-docs/` — a small fictional company handbook (5 files), chosen so each question has one clearly correct source doc, making it easy to verify retrieval is actually working (not hallucinating): `remote-work-policy.md`, `onboarding-checklist.md`, `expense-reimbursement.md`, `security-guidelines.md`, `pto-policy.md`.

## How to run Stage 1
1. Make sure Ollama is running (`ollama serve`, or it may already be running as a background service after install)
2. `npm install` (already done)
3. `npm run ask -- "your question about the handbook"`

No `.env` / API key needed — everything runs locally.

## Verified test results (2026-08-10)
- `"How many days of PTO do I get and can I carry it over?"` → retrieved all top-3 chunks from `pto-policy.md` only (scores 0.79/0.60/0.52); answer correctly stated 15 days/year, 5 days carryover.
- `"What is the company's dress code policy?"` (not in corpus) → retrieval scores dropped to ~0.2-0.3 (vs ~0.5-0.8 on the hit above — a useful signal for a future min-score cutoff); model correctly answered "I couldn't find any information..." instead of hallucinating.

## Session Log
- **2026-08-10:** Discussed use cases (e-commerce Q&A, Valorant strategy assistant, personal KB, other). User chose "simple, easy to build, easy to learn, basic → advanced" — landed on "chat with your own docs." User asked to persist all project context in Obsidian so new chats have full context; using this file (`rag/rag.md`) as the vault's main note, with `rag/` as the vault folder.
- **2026-08-10:** Confirmed CLI-first. Researched embeddings (Anthropic has no embeddings API) and chose local `@xenova/transformers` over Voyage AI for zero-setup learning; initially chose `claude-haiku-4-5` for generation. Scaffolded the project, wrote 5 sample corpus docs, built the full Stage 1 pipeline. `npm install` succeeded. First live test hit `400 — Your credit balance is too low` (Anthropic account has no billing set up), even though retrieval itself was proven correct.
- **2026-08-10:** User asked for a free way to build this. Presented options (local Ollama vs. free-tier hosted provider vs. add Anthropic credit); user chose **local Ollama**. Installed Ollama via `winget install Ollama.Ollama`, pulled `llama3.2:3b` (2GB). Rewrote `src/ask.ts` to call a new `src/llm.ts` (local Ollama REST API) instead of the Anthropic SDK; removed the now-unused `@anthropic-ai/sdk` and `dotenv` dependencies. Verified end-to-end with two test queries (see Verified test results above) — Stage 1 is now complete, fully free, and fully local.
