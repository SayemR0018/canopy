# Canopy Progress

## M0: Scaffold
- **Status**: DONE
- **Done**: Initialized repository, Git remote linked to public GitHub repo, .gitignore and .env.example created, DEVRELAY_STATUS documented, DECISIONS log created, TypeScript/tsx/vitest set up, database adapter implemented.
- **Evidence**: `npx vitest --version` (2.1.9) passes; SQLite dual adapter verified; repo initialized on branch main.
- **Next**: Milestone 1 - Seed + Server (deterministic synthetic monorepo, Hono API for tree, file, log, blame).

## M1: Seed + Server
- **Status**: DONE
- **Done**: scripts/seed.ts generates deterministic synthetic monorepo (Mulberry32 PRNG seed 1337, 3000 files, 40 dirs, 200 commits in ./data/repo.git). Hono API server implements /healthz, /api/tree, /api/file, /api/log, /api/blame, /api/stats with strict path traversal validation.
- **Evidence**: Vitest unit/integration tests pass (7 git tests + 8 server tests); path traversal attempts blocked with 400.
- **Next**: Milestone 2 - Lazy Client (`canopy` CLI: mount, cat/open with local cache, stats; benchmark script).

## M2: Lazy Client
- **Status**: DONE
- **Done**: `src/cli/client.ts` implements CanopyClient with `mount` (manifest-only indexing), `cat` (fetch on first read + content-addressed local caching), `stats` (bandwidth saved vs full clone, cache hit rate). `scripts/benchmark.ts` automated and measured real performance comparisons.
- **Evidence**: `test/client.test.ts` passed (3 tests); `npm run benchmark` executed with real measurements (traditional clone: 2.91 MB / 1,648 ms; Canopy mount: 538 KB / 144 ms; 5 files: 81.0% bandwidth reduction saved in `docs/benchmark-results.json`).
- **Next**: Milestone 3 - Derived Cache (SQLite derived table, single OpenAI-compatible LLM client, Zod schema validation, retry logic, deterministic fallback).

## M3: Derived Cache
- **Status**: DONE
- **Done**: SQLite `derived` table created (blob_hash, kind, model, prompt_version, lang, output, tokens_in, tokens_out, latency_ms, is_degraded). Implemented `DerivedService` with strict Zod validation (SummarySchema, DigestSchema, CommitMsgSchema, WhySchema), 2 retries, deterministic fallback flagged `degraded`, and payload truncation.
- **Evidence**: `test/derived.test.ts` (5 tests passing: SQLite caching, 0 LLM calls on second read, 2 retries + fallback, Bengali translation, and truncation).
- **Next**: Milestone 4 - Agent Commands.

## M4: Agent Commands
- **Status**: DONE
- **Done**: Implemented `canopy digest [--since] [--lang en|bn]` (enforced exactly two lines + risk flags list), `canopy commit` (message from diff on stdin), `canopy why <path>` (history + blame + cached summary), and API routes in `app.ts`. Added 64KB diff size guard.
- **Evidence**: `test/agent-commands.test.ts` (7 tests passing: 2-line digest validation, Bengali output, cache zero-call hit, commit generation, 64KB size rejection, why analysis, trace stats).
- **Next**: Milestone 5 - Web UI (responsive light/dark UI, lazy file tree, digest panel, why panel, metrics trace view).

## M5: Web UI
- **Status**: PENDING
- **Next**: Vanilla TS + HTML/CSS responsive UI with lazy tree, digest panel, why panel, metrics trace view.

## M6: Ops
- **Status**: PENDING
- **Next**: Rate limiting, token cap, /healthz, read-only mode, Dockerfile, render.yaml.

## M7: Render Deploy
- **Status**: PENDING
- **Next**: Deploy config / Render API orchestration, DEPLOY.md.

## M8: Live Verification
- **Status**: PENDING
- **Next**: verify:live script.

## M9: Demo + Docs
- **Status**: PENDING
- **Next**: Playwright recording, README, POST_FACTS.md, POST_DRAFT.md.
