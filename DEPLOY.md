# Deploying Canopy to Render

Canopy is fully packaged for Render using Docker (`Dockerfile`), an Infrastructure-as-Code Blueprint (`render.yaml`), and an automated REST API deployment orchestrator (`scripts/deploy-render.ts`).

---

## 1. Automated Deployment via Render REST API (Milestone 7)

Canopy includes an automated deployment orchestration script (`scripts/deploy-render.ts`) that interfaces directly with the Render REST API (v1).

### Execution

```bash
# Set credentials in .env (never committed)
# RENDER_API_KEY=rnd_...
# SENTRY_DSN=https://...
# CANOPY_LLM_API_KEY=AIza...

npx tsx scripts/deploy-render.ts
```

### What `deploy-render.ts` Orchestrates:
1. **Account Authentication**: Resolves account owner workspace ID via `GET https://api.render.com/v1/owners`.
2. **Service Discovery**: Queries existing services via `GET https://api.render.com/v1/services`. If absent, automatically provisions a new Docker Web Service (`canopy-lazy-git`).
3. **Environment Variable Synchronization**: Programmatically synchronizes all 12 configuration keys via `PUT https://api.render.com/v1/services/{serviceId}/env-vars` (including `SENTRY_DSN`, `CANOPY_LLM_API_KEY`, `CANOPY_LLM_BASE_URL`, `CANOPY_LLM_MODEL`, `PORT`, `HOST`, `NODE_ENV`, `NODE_OPTIONS`, `DATA_DIR`, `PUBLIC_READONLY`, `RATE_LIMIT_PER_MIN`, `DAILY_TOKEN_CAP`).
4. **Deploy & Health Verification**: Verifies deployment state via `GET https://api.render.com/v1/services/{serviceId}/deploys` and probes live HTTP health at `/healthz`.

---

## 2. Live Deployment Settings & Variables

Target Production URL: **`https://canopy-lazy-git.onrender.com`**

### **General / Build & Deploy Settings**
| Setting Field | Exact Value |
| :--- | :--- |
| **Name** | `canopy-lazy-git` |
| **Repository** | `https://github.com/SayemR0018/canopy` |
| **Branch** | `main` |
| **Root Directory** | *(leave blank)* |
| **Runtime / Environment** | `Docker` |
| **Plan** | `Free` |
| **Region** | `Oregon (US West)` |
| **Dockerfile Path** | `./Dockerfile` |
| **Docker Context** | `.` |
| **Health Check Path** | `/healthz` |
| **Port** | `10000` *(Render sets $PORT automatically)* |

### **Environment Variables**
| Key | Value | Notes |
| :--- | :--- | :--- |
| `PORT` | `10000` | Render HTTP listener port |
| `HOST` | `0.0.0.0` | Binds to all network interfaces |
| `NODE_ENV` | `production` | Production mode |
| `NODE_OPTIONS` | `--experimental-sqlite` | Enables native SQLite in Node 22 |
| `DATA_DIR` | `/app/data` | Container persistent/runtime repo & cache path |
| `PUBLIC_READONLY` | `true` | Public read-only demo mode |
| `RATE_LIMIT_PER_MIN` | `60` | Per-IP rate limiting |
| `DAILY_TOKEN_CAP` | `200000` | LLM token daily budget |
| `CANOPY_LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | Google AI Studio OpenAI endpoint |
| `CANOPY_LLM_MODEL` | `models/gemma-4-26b-a4b-it` | Google Gemma 4 model |
| `CANOPY_LLM_API_KEY` | *(Secret: Google AI Studio API Key)* | Required for live LLM completions |
| `SENTRY_DSN` | *(Secret: Sentry Project DSN)* | Active error monitoring & alerting |

---

## 3. Sentry Integration & Monitoring

When `SENTRY_DSN` is set:
- **Server Boot & Lifecycle**: `src/server/index.ts` logs `- Sentry: active` on startup and sends an initial info message to Sentry confirming server initialization. It wires top-level process handlers (`uncaughtException`, `unhandledRejection`, and startup failure interception) to ensure unhandled process crashes are immediately captured and dispatched.
- **Global Error Handling**: `app.onError` in `src/server/app.ts` captures unhandled HTTP route exceptions with request path and method context, dispatching Sentry envelope payloads to Sentry's ingest endpoint (`/api/{projectId}/envelope/`).
- **Route Error Handling**: Endpoints catch errors and forward them via `sentry.captureException(err, { endpoint })`.
- **Zero-Dependency Envelope Protocol**: Implements native Sentry Envelope protocol over built-in Node fetch with `X-Sentry-Auth` and `application/x-sentry-envelope`, avoiding external runtime dependencies.
- **Zero-Overhead Fallback**: When `SENTRY_DSN` is not provided, the Sentry client acts as a silent, zero-overhead no-op.

---

## 4. Alternative: Automatic Deployment via Blueprint (3 Clicks)

1. **Click 1: New Blueprint Instance**
   - In Render Dashboard, click **"New +"** -> **"Blueprint"**.
2. **Click 2: Connect GitHub Repository**
   - Select `https://github.com/SayemR0018/canopy.git`.
   - Render automatically parses `render.yaml`.
3. **Click 3: Apply Blueprint**
   - Fill in `CANOPY_LLM_API_KEY` and `SENTRY_DSN` secrets when prompted, then click **"Apply"**.

---

## 5. Live Production Verification Suite

Verify live deployment health, lazy tree/blob fetching, LLM cache speedup, and rate limiting:

```bash
npm run verify:live
```

Target URL defaults to `https://canopy-lazy-git.onrender.com`. All 4 production verification gates pass with real HTTP assertions.
