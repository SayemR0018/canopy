# GitHub Copilot Developer Instructions for Canopy

Canopy is a lightweight, lazy-clone Git client and semantic caching layer designed for monorepos and resource-constrained developer workflows.

## 1. Architecture Overview
- **Client (`src/cli/client.ts`, `bin/canopy.js`)**:
  - `canopy mount <remote-url>`: Fetches only the root directory manifest slice (767 bytes) instead of downloading the entire repository tree or objects.
  - `canopy cat <path>`: Lazily downloads sub-tree slices on demand and retrieves file blobs by SHA-1 hash into `.canopy/objects/`. Repeated reads hit local disk cache with 0 network bytes.
  - `canopy stats`: Reports local cache hits, misses, and bandwidth saved vs traditional git clone.
  - Agent commands (`canopy digest`, `canopy commit`, `canopy why`).
- **Server (`src/server/app.ts`, `src/server/index.ts`)**:
  - Hono-based HTTP server serving both the REST API and the light/dark single-page Web UI (`src/server/ui.ts`).
  - `GitService (`src/server/git.js`)`: Direct low-level read-only operations against a bare git repository (`./data/repo.git`).
  - `DerivedService (`src/server/derived.js`)`: Manages LLM-derived artifacts (summaries, digests, architectural explanations) stored in SQLite table `derived`.
  - `warmer.ts`: Asynchronously warms demo digests and architectural summaries on boot to ensure sub-5ms latency for first-time visitors.

## 2. Core Engineering Invariants
- **Dual SQLite Database Adapter (`src/db/index.ts`)**:
  - Supports both `node:sqlite` (`DatabaseSync`, built into Node 22.5+) and `better-sqlite3`.
  - Always write standard SQL supported across both engines. Always enable WAL mode (`PRAGMA journal_mode = WAL`) and `busy_timeout = 5000`.
- **Security & Input Validation**:
  - Path traversal: Reject any path with `..`, leading `/`, or Windows-style backslashes (`\`). Use `validateSafePath()`.
  - Git arguments: Reject any revision string starting with a hyphen `-` to prevent git flag injection. Use `validateSafeRev()`.
  - Object verification: Ensure requested paths are `blob` objects before reading file contents.
- **LLM Output Handling**:
  - Google Gemini / Gemma models output reasoning thought tokens wrapped in `<thought>...</thought>` or `<think>...</think>`.
  - Always strip reasoning thoughts before parsing JSON.
  - All LLM outputs must be parsed through Zod schemas. If 2 retries fail, fall back to deterministic heuristic parsing flagged `is_degraded = 1`.
  - Never allow LLM downtime or rate limits to return HTTP 500.

## 3. Testing & Verification Gates
- **Unit Tests**: Run with `npm test` (Vitest). All 46+ tests across 6 suites must pass.
- **Automated Verification**: Run with `npm run verify` (`scripts/verify.ts`). This runs 7 automated gates:
  1. Vitest suite
  2. Local Mock LLM server boot
  3. Synthetic monorepo seed (3000 files, 40 dirs, 200 commits)
  4. Canopy server boot with SQLite
  5. End-to-end lazy fetch bandwidth benchmark (asserting >= 98% savings)
  6. Zero-call cache hit & bad model 2-retry heuristic degradation
  7. Numerical claim audit (`scripts/check-claims.ts`) ensuring all metrics in `README.md` and `docs/POST_FACTS.md` match `docs/benchmark-results.json` exactly.

## 4. Coding Conventions
- TypeScript ES Modules (`"type": "module"`). Always use `.js` extension in import paths (e.g., `import { GitService } from './git.js'`).
- Node target: Node >= 22.5.0.
- Never hardcode or commit secrets or API keys. Always retrieve from environment variables (`CANOPY_LLM_API_KEY`, `RENDER_API_KEY`, `SENTRY_DSN`).
- Keep diffs focused and minimal. Avoid adding heavy client-side frameworks; UI is pure TypeScript template rendering.
