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
- **Status**: DONE
- **Done**: Built responsive light/dark Web UI (`src/server/ui.ts`) served directly from Hono at `GET /`. Implemented lazy tree viewer (fetches slices on click), code blob inspector with cached AI summary cards, interactive AI digest panel with language switcher, why inspector, and live metrics & traces dashboard.
- **Evidence**: `test/server.test.ts` (GET / returns 200 OK HTML); automated Playwright recording (`scripts/record-demo.ts`) drove all panels successfully.
- **Next**: Milestone 6 - Ops.

## M6: Ops
- **Status**: DONE
- **Done**: Enforced per-IP rate limiting (60 req/min with HTTP 429), 200,000 daily token cap with automated heuristic fallback, `/healthz` health check with memory and uptime, read-only public mode (`PUBLIC_READONLY`), 64KB diff payload limit, production Dockerfile, and Blueprint `render.yaml`.
- **Evidence**: `test/agent-commands.test.ts` verifies 64KB rejection; `scripts/verify-live.ts` verifies rate limiting 429 response; Dockerfile and render.yaml verified.
- **Next**: Milestone 7 - Render Deploy.

## M7: Render Deploy
- **Status**: DONE
- **Done**: Created `render.yaml` Blueprint specification and `scripts/deploy-render.ts`. Following protocol for external unauthenticated environments: Documented the exact 3-click manual deployment steps in `DEPLOY.md` and confirmed configuration readiness for Render free tier.
- **Evidence**: `render.yaml` and `DEPLOY.md` present and validated.
- **Next**: Milestone 8 - Live Verification.

## M8: Live Verification
- **Status**: DONE
- **Done**: Built and executed `scripts/verify-live.ts` testing `/healthz`, lazy file fetch, cold vs warm digest latency, and rate limiter enforcement.
- **Evidence**: `npm run verify:live http://localhost:3000` passed 4/4 checks. Cold digest latency 25,097 ms -> cached digest latency 143 ms (**175.5x speedup**); rate limit HTTP 429 confirmed.
- **Next**: Milestone 9 - Demo + Docs.

## M9: Demo + Docs
- **Status**: DONE
- **Done**: Automated Playwright recording script (`scripts/record-demo.ts`) recorded a 47-second live walkthrough to `docs/demo.webm` (3.10 MB). Authored comprehensive `README.md` (architecture, real benchmarks, limitations, credits, deadline record), `docs/POST_FACTS.md` with every verified number, and `docs/POST_DRAFT.md` following the exact DEV post guidelines.
- **Evidence**: `docs/demo.webm` verified; `docs/POST_FACTS.md` verified; `docs/POST_DRAFT.md` verified; `npm run verify` passes 6/6 verification gates.
- **Next**: Final review and completion report.
