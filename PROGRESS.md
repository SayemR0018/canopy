# Canopy Progress

## M0: Scaffold
- **Status**: DONE
- **Done**: Initialized repository, Git remote linked to public GitHub repo, .gitignore and .env.example created, [DEVRELAY_STATUS.md](DEVRELAY_STATUS.md) documented with [DevRelay](https://devrelay.com), DECISIONS log created, TypeScript/tsx/vitest set up, database adapter implemented.
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
- **Done**: Implemented and executed automated deployment orchestration via the Render REST API (`scripts/deploy-render.ts`). Authenticated account owner workspace (`tea-da3hpou1egvs73ckn8u0`), discovered Web Services, synchronized all 12 environment variables via `PUT /v1/services/{serviceId}/env-vars` (including `SENTRY_DSN`, `CANOPY_LLM_API_KEY`, `CANOPY_LLM_BASE_URL`, `CANOPY_LLM_MODEL`, `PORT`, `HOST`, `NODE_ENV`, `NODE_OPTIONS`, `DATA_DIR`, `PUBLIC_READONLY`, `RATE_LIMIT_PER_MIN`, `DAILY_TOKEN_CAP`), and verified live deployment status and health with deploy polling. Wired Sentry error monitoring across both `src/server/sentry.ts` and `src/server/index.ts` (lifecycle startup alerts, `uncaughtException`, `unhandledRejection`, `startServer.catch`, `app.onError`, and route catch blocks with lightweight envelope dispatching). Added `render.yaml` Blueprint specification and updated `DEPLOY.md`.
- **Evidence**: `npx tsx scripts/deploy-render.ts` executed with HTTP 200 responses across all steps; 12 environment variables verified configured; `test/sentry.test.ts` (6 unit tests) passing; `DEPLOY.md` and `render.yaml` updated and verified.
- **Next**: Milestone 8 - Live Verification.

## M8: Live Verification
- **Status**: DONE
- **Done**: Built and executed `scripts/verify-live.ts` testing `/healthz`, lazy file fetch, cold vs warm digest latency, and rate limiter enforcement against both local server and production Render deployment.
- **Evidence**:
  - Local verification: `npm run verify:live http://localhost:3000` passed 4/4 checks. Cold digest latency 25,097 ms -> cached digest latency 143 ms (**175.5x speedup**); rate limit HTTP 429 confirmed.
  - Live Render deployment verification: `npm run verify:live https://canopy-lazy-git.onrender.com` passed 4/4 checks. Verified live service health (`/healthz` 200 OK with `publicReadonly: true`), lazy manifest retrieval & on-demand blob fetching (`apps/web/src/module_001.tsx`, 880 bytes, blob 7258591e), live LLM digest cold vs cached latency (cold digest 46,505 ms -> cached digest 177 ms, **262.7x speedup**, 0 additional LLM calls on cached read), and rate limit enforcement (HTTP 429 Too Many Requests verified).
- **Next**: Milestone 9 - Demo + Docs.

## M9: Demo + Docs
- **Status**: DONE
- **Done**: Automated Playwright recording script (`scripts/record-demo.ts`) recorded a 86.2-second live walkthrough to `docs/demo.webm` (5.40 MB) and converted it to `docs/demo.gif` (0.91 MB) using system ffmpeg, fulfilling the 60-90s duration and <10MB GIF requirements. Authored comprehensive `README.md` (architecture, real benchmarks, limitations, credits, deadline record), `docs/POST_FACTS.md` with every verified number, and `docs/POST_DRAFT.md` following the exact DEV post guidelines with updated live Render URL `https://canopy-lazy-git.onrender.com`.
- **Evidence**: `docs/demo.webm` (86.2s, 5.40 MB) verified; `docs/demo.gif` (0.91 MB) verified; `docs/POST_FACTS.md` verified; `docs/POST_DRAFT.md` verified; `npm run verify` passes 6/6 verification gates (38 unit tests).

## Review & Hardening
- **Status**: DONE
- **Done**: Skeptical peer review identified and resolved 10 critical issues: fixed broken CLI entrypoint in `bin/canopy.js`, fixed compiled server entrypoint in `dist/server/index.js`, enforced `PUBLIC_READONLY` mode (HTTP 403 Forbidden on write routes), plugged git option injection vulnerability in `validateSafeRev`, guarded `getFile` against directory/tree paths with HTTP 400, strictly asserted rate limit 429 response in `scripts/verify-live.ts`, added SQLite WAL busy_timeout guard, enhanced binary diff parsing, hardened rate limiting middleware in `app.ts` to prioritize `cf-connecting-ip`, strip downstream proxy IPs, and trim ephemeral client ports behind Cloudflare / Render, and switched `scripts/verify-live.ts` to batched concurrent bursting to prevent WAN latency stretching across the 60-second rate limiter window.
- **Evidence**: 44 unit tests pass across 6 test suites; `npm run verify` passes 6/6 gates; live deployment `https://canopy-lazy-git.onrender.com` passed 4/4 checks (healthcheck, lazy tree fetch, cold 67.5s vs 166ms cached digest speedup, and HTTP 429 rate limiting verified); `node bin/canopy.js --help` outputs full CLI documentation; clean secrets scan; zero production vulnerabilities in `npm audit --omit=dev`.

## P0: DevRelay Re-Check
- **Status**: DONE
- **Done**: Executed read-only get_challenges via MCP; verified response returned challenge ID 81 (Hacktoberfest Week 3, ends 2026-10-25T06:59:00Z). Updated DEVRELAY_STATUS.md to ACTIVE.
- **Evidence**: `devrelay-gateway/get_challenges` returned 34.4 KB JSON payload containing challenge 81.
- **Next**: P1 - Claims Audit and Fixes.
