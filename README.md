# Canopy 🌲

> A lazy, AI-assisted layer over git that treats repositories as server-authoritative knowledge graphs, fetching files on demand and caching derived LLM insights.

Built for the **dev.to Hacktoberfest Open-Source AI Challenge Week 3: "Slow and Steady"** (rewarding laziness in developer workflows).

---

## The Concept: Lazy Repositories for Lazy Developers & Agents

Modern monorepos and sprawling codebases waste gigabytes of bandwidth and minutes of developer time during full clones, even when an engineer or AI agent only needs to read 5 files and understand the latest changes.

Canopy is inspired by the architecture described in Anthropic's post, *"Redesigning source control at Anthropic"* (Scion), along with ideas from Meta's Sapling and Mononoke:
- **Server-Authoritative Tree**: Clients do not clone full git commit graphs or download historical packfiles upfront.
- **Lazy Hydration**: The client mounts a lightweight tree manifest. Blobs are fetched only when read (`canopy cat` or UI file view) and cached locally by content hash.
- **Compute-Once Derived Intelligence**: Expensive computations (code summaries, risk flags, commit explanations) are generated once by an open Gemma model, validated, and stored in a shared derived cache. Subsequent reads make 0 LLM calls.

> **Disclaimer**: Canopy is an independent open-source educational project inspired by these published concepts. Canopy is **not** a Scion clone, makes no claim of feature parity, and contains no proprietary code. Full attribution and credit go to Anthropic's engineering post, Sapling, and Mononoke.

---

## Architecture

```mermaid
flowchart TD
    subgraph Client["Canopy Client / CLI / Web UI"]
        CLI["CLI: canopy (mount, cat, digest, why)"]
        UI["Web UI (Lazy Tree + Metrics + Trace)"]
        LocalCache[".canopy/cache (Content-Addressed Blobs)"]
    end

    subgraph Server["Canopy Server (Hono)"]
        API["Hono REST API (/api/tree, /api/file, /api/digest, /api/why)"]
        BareRepo["Bare Git Repository (data/repo.git)"]
        CacheDB["Derived Cache (SQLite: derived table)"]
        Limiter["Rate Limiter & Daily Token Cap"]
    end

    subgraph LLM["OpenAI-Compatible LLM Layer"]
        GemmaHosted["Google AI Studio (Gemma 4 26B)"]
        GemmaLocal["Ollama (http://localhost:11434/v1) [Unverified]"]
    end

    CLI -->|1. Mount manifest| API
    CLI -->|2. Lazy read blob| API
    CLI <-->|3. Check/Store blob| LocalCache
    UI -->|Browse slice| API
    API -->|Read tree/blobs| BareRepo
    API <-->|Cached summaries| CacheDB
    API -->|Cache miss| Limiter --> GemmaHosted
    Limiter -.-> GemmaLocal
```

---

## Benchmark Highlights (Synthetic Monorepo)

*Generated against a deterministic synthetic monorepo (~3,000 files, 40 directories, 200 commits):*

| Metric | Traditional `git clone` | Canopy Lazy Client | Payoff / Reduction |
| :--- | :--- | :--- | :--- |
| **Initial Network Transfer** | ~12.4 MB | **~84 KB** (manifest) | **> 99% savings** |
| **Time to First File Access** | ~2,800 ms | **~18 ms** | **150x faster** |
| **5 Files Read (cold)** | ~12.4 MB | **~112 KB** | **99.1% bandwidth saved** |
| **Subsequent Digest Call** | N/A | **0 LLM calls** (cache hit) | **100% token savings** |

*(Complete reproducible benchmark data in [docs/POST_FACTS.md](docs/POST_FACTS.md))*

---

## Quickstart

### Prerequisites
- Node.js 20+
- Git CLI

### 1. Installation
```bash
git clone https://github.com/SayemR0018/canopy.git
cd canopy
npm install --omit=optional
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your CANOPY_LLM_API_KEY (Google AI Studio)
```

### 3. Seed Synthetic Monorepo & Start Server
```bash
npm run seed
npm run server
```

The Web UI and API will be live at `http://localhost:3000`.

### 4. Use the Lazy CLI
```bash
# Mount a repo lazily (fetches only directory manifest)
npm run cli -- mount http://localhost:3000

# Inspect files on demand (downloads blob on first read)
npm run cli -- cat src/core/auth.ts

# Get 2-line AI digest with risk flags
npm run cli -- digest

# Explain file history and why it looks this way
npm run cli -- why src/core/auth.ts

# Inspect lazy savings
npm run cli -- stats
```

---

## Running Offline with Ollama

Canopy uses a single OpenAI-compatible LLM client without provider lock-in. To run offline with Ollama:
```env
CANOPY_LLM_BASE_URL=http://localhost:11434/v1
CANOPY_LLM_MODEL=gemma2:2b
CANOPY_LLM_API_KEY=ollama
```

> **Note on Local Ollama Path**: The Ollama integration uses standard OpenAI completions endpoints. On the build environment machine, Ollama was not locally installed/running, so the local Ollama path is marked **unverified** in this build log. Hosted Google AI Studio was fully verified live.

---

## Verification & Testing
```bash
npm run verify
```

---

## Credits & Acknowledgments
- Inspired by Anthropic's public article *"Redesigning source control at Anthropic"* by the Anthropic tooling team.
- Concepts influenced by [Sapling](https://sapling-scm.com/) and [Mononoke](https://github.com/facebook/sapling).
- Powered by Google Gemma open models.

## License
[MIT](LICENSE) © 2026 Sayem Rahman
