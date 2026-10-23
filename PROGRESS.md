# Canopy Progress

## M0: Scaffold
- **Status**: DONE
- **Done**: Initialized repository, Git remote linked to public GitHub repo, .gitignore and .env.example created, DEVRELAY_STATUS documented, DECISIONS log created, TypeScript/tsx/vitest set up, database adapter implemented.
- **Evidence**: `npx vitest --version` (2.1.9) passes; SQLite dual adapter verified; repo initialized on branch main.
- **Next**: Milestone 1 - Seed + Server (deterministic synthetic monorepo, Hono API for tree, file, log, blame).

## M1: Seed + Server
- **Status**: PENDING
- **Next**: scripts/seed.ts for deterministic synthetic monorepo (~3000 files, ~40 dirs, ~200 commits in bare repo), Hono API routes for tree, file, log, blame with traversal protection.

## M2: Lazy Client
- **Status**: PENDING
- **Next**: `canopy` CLI (mount, cat/open with local cache, stats), scripts/benchmark.ts.

## M3: Derived Cache
- **Status**: PENDING
- **Next**: SQLite derived cache table, Zod validation, retry logic, deterministic heuristic fallback.

## M4: Agent Commands
- **Status**: PENDING
- **Next**: `canopy digest`, `canopy commit`, `canopy why`.

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
