---
title: "Canopy: A Lazy, AI-Assisted Layer Over Git for Slow & Steady Repositories"
published: false
tags: devchallenge, hf26challenge
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19)*

## What I Built

Modern repositories, especially monorepos, force developers into an unrewarding chore: waiting for `git clone` to transfer thousands of files, branches, and historical blobs before writing a single line of code. Anthropic's Scion made git lazy for agents; Canopy makes a repo lazy for humans, run by a model you control.

Canopy is an open-source, lazy-fetching, AI-assisted layer over git. Instead of cloning megabytes of untouched code, Canopy mounts a repository instantly by downloading only its tree manifest. Files are materialized on-demand the first time you read them and cached locally using content-addressed hashes.

On top of this lazy filesystem layer, Canopy introduces a derived AI cache. When you inspect a file, request a changeset digest, or ask why a component exists, Canopy derives the summary once using Google Gemma, validates the structure using strict schemas, and caches the result forever in SQLite. If the model output fails schema validation, Canopy retries twice before gracefully falling back to a deterministic offline heuristic flagged `degraded`.

## Demo

The demo demonstrates Canopy's lazy file tree explorer, live semantic summaries, changeset digest with Bengali language support, architectural history analysis, and the real-time agent trace dashboard.

- **Demo Video**: [docs/demo.webm](https://github.com/SayemR0018/canopy/blob/main/docs/demo.webm) (WebM, 1280x720, 86s, 5.4 MB)
- **Demo GIF**: [docs/demo.gif](https://github.com/SayemR0018/canopy/blob/main/docs/demo.gif) (GIF, 540x304, 0.91 MB)
- **Live Deployment**: [https://canopy-lazy-git.onrender.com](https://canopy-lazy-git.onrender.com) (Render Docker Web Service)

## Code

Canopy is completely open source under the MIT License:

- **GitHub Repository**: [https://github.com/SayemR0018/canopy](https://github.com/SayemR0018/canopy)
- **Tech Stack**: Node 20, TypeScript, Hono, better-sqlite3 (with WAL mode), Vitest, Playwright, Docker, Render.

## How I Built It

I structured Canopy around four modular pillars:

1. **Synthetic Monorepo Seed (`scripts/seed.ts`)**: To measure lazy operations with precision without relying on arbitrary network dependencies, I built a deterministic generator using Mulberry32 PRNG (seed 1337). It constructs a bare git repository with 3,000 files across 40 directories and 200 commits in 1.48 seconds.
2. **Server-Authoritative Git API (`src/server/`)**: Built on Hono, the server exposes strict path-traversal-protected endpoints for directory trees, blob retrieval, commit logs, and line-level blame.
3. **Lazy Client CLI (`src/cli/`)**: The `canopy` CLI provides `mount`, `cat` (with local content-addressed disk caching), `stats`, `digest`, `commit`, and `why`.
4. **Resilient AI Derived Cache (`src/server/derived.ts`)**: Every AI operation runs through a single OpenAI-compatible client. All outputs are validated against Zod schemas. If the model produces invalid JSON or deviates from schema constraints, Canopy retries twice and then falls back to an offline deterministic parser so the server never crashes or hangs.

## Why Does Open Innovation Matter?

Open-source AI matters because code is private, infrastructure is expensive, and developers need reliable software that functions even without an active internet connection.

With Canopy, code never leaves your local perimeter if you point the OpenAI-compatible client to a local Ollama instance (`http://localhost:11434/v1`). You can swap between an open-weights model running on your laptop and a hosted endpoint by changing a single environment variable (`CANOPY_LLM_BASE_URL`), without rewriting code or paying per-token API bills.

In my testing, the open approach provided unmatched privacy, predictable deterministic behavior, and zero latency on cached entries. The trade-off is that smaller open models require stricter prompt boundaries and schema guards to consistently produce machine-parsable JSON compared to monolithic closed APIs.

## My Agent Session

This project was built end-to-end with Devin (Argon model). The complete chronological record of decisions and milestones is available in the repository:

- [PROGRESS.md](https://github.com/SayemR0018/canopy/blob/main/PROGRESS.md): Step-by-step milestone execution record from scaffold to production.
- [DECISIONS.md](https://github.com/SayemR0018/canopy/blob/main/DECISIONS.md): Architectural decisions log covering SQLite adapters, model selection, and payload limits.
- [docs/POST_FACTS.md](https://github.com/SayemR0018/canopy/blob/main/docs/POST_FACTS.md): Verified benchmark figures and reproduction commands.

During the build, I was surprised by how much bandwidth a standard `git clone` wastes: across our 3,000-file repository, downloading the full history consumed 2.77 MB, whereas mounting the tree and opening 5 representative files required only 540.5 KB—an immediate 81.0% reduction in transferred bytes.

A real limitation of this architecture is context window truncation. Large diffs exceeding 64 KB are blocked, and blob payloads sent to the LLM are clipped at 8 KB to prevent context exhaustion, requiring an explicit truncation notice in the output.

## The Lazy Payoff

Here are the real measured benchmark numbers comparing a traditional git clone against Canopy on the 3,000-file synthetic monorepo:

| Metric | Traditional Git Clone | Canopy Lazy Layer | Difference / Savings |
| :--- | :--- | :--- | :--- |
| **Initial Mount / Clone Time** | 1,775 ms | 184 ms | **9.6x faster setup** |
| **Initial Download Size** | 2.77 MB (2,908,949 bytes) | 538.0 KB (550,887 bytes) | **81.1% bandwidth saved** |
| **5 Files Selective Read** | 1,486,369 bytes (on disk) | 2,623 bytes (on-demand) | Fetches only required slices |
| **Warm Cache Read (5 files)** | Filesystem read | 64.5 ms | **0 network bytes** |
| **Total Transfer (Mount + 5 files)** | 2.77 MB | 540.5 KB | **81.0% total reduction** |
| **End-to-End Latency** | 1,775 ms | 955 ms | **1.9x faster** |

## Prize Categories

- **Best Use of Gemma**: Canopy uses Gemma (`models/gemma-4-26b-a4b-it`) via Google AI Studio's OpenAI-compatible endpoint to compute structured file summaries, bilingual git digests (English and Bengali), and architectural why explanations with strict Zod validation and a resilient 2-retry fallback.
- **Best Use of Render**: Canopy is packaged with a custom Dockerfile and deployed on Render as an auto-seeding Web Service with automated `/healthz` monitoring, per-IP rate limiting, and blueprint configuration via `render.yaml`.
