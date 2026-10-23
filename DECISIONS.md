# Architecture and Engineering Decisions

- D001: Selected Hono over Express/Fastify for server routing because of lightweight TypeScript-first ergonomics and native web standards support.
- D002: Selected better-sqlite3 with WAL mode for local derived cache because of synchronous speed, zero-network latency, and embedded simplicity.
- D003: Picked `models/gemma-4-26b-a4b-it` via Google AI Studio's OpenAI-compatible endpoint as the capable chat model after querying live `/models` endpoint (evaluated 26b vs 31b; 26b avoids free-tier rate spikes while having excellent instruction following).
- D004: Standardized single LLM client on OpenAI-compatible API without vendor-specific SDKs to allow seamless swapping between Google AI Studio and Ollama.
- D005: Designed synthetic monorepo seed script to be fully deterministic with PRNG seed (1337) generating 3,000 files across 40 directories and 200 commits in a bare git repo.
- D006: Clipped maximum blob diff and file size sent to LLM at 8KB with explicit truncation header to avoid context limit overflow and high token cost.
- D007: Added dual SQLite engine adapter supporting better-sqlite3 (production/Docker) and Node built-in node:sqlite (Windows/Node 24 development) with zero API divergence.
- D008: Validated LLM outputs using strict Zod schemas with 2 retries, falling back to deterministic heuristic parsing flagged is_degraded=1 to guarantee zero downtime.
- D009: Implemented `canopy digest` enforcing exactly two lines + risk flags, and added bilingual support (English and Bengali via --lang bn).
- D010: Added 64KB diff input limit and 8KB context window truncation with user notice to prevent LLM context exhaustion.
