# Deploying Canopy to Render

Canopy is fully packaged with Docker (`Dockerfile`) and an Infrastructure-as-Code Blueprint (`render.yaml`).

## Automatic Deployment via Blueprint (3-Click Steps)

If deploying manually via the Render Web Dashboard:

1. **Click 1: New Blueprint Instance**
   - Navigate to [dashboard.render.com](https://dashboard.render.com) and click **"New +"** in the top navigation bar, then select **"Blueprint"**.

2. **Click 2: Connect GitHub Repository**
   - Choose or enter the public repository: `https://github.com/SayemR0018/canopy.git`.
   - Render automatically detects `render.yaml` and configures the Docker Web Service, free tier, `/healthz` check, and auto-deploy triggers.

3. **Click 3: Apply Blueprint**
   - Provide your `CANOPY_LLM_API_KEY` in the environment secrets prompt, and click **"Apply"**.
   - Render builds the Docker image, initializes the synthetic bare repository in ~1.5s on first boot, and promotes the service to active live traffic.

## Service Specification

- **Runtime**: Docker (Node 20 Slim + Git)
- **Health Check**: `/healthz`
- **Port**: 10000 (Render `$PORT`)
- **Memory**: ~65MB (Lightweight Hono + SQLite WAL)
- **Live URL**: `https://canopy-lazy-git.onrender.com` (or generated Render slug)

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Listening HTTP port | `10000` |
| `NODE_ENV` | Environment mode | `production` |
| `DATA_DIR` | Location for synthetic repo & SQLite cache | `./data` |
| `PUBLIC_READONLY` | Read-only public mode | `true` |
| `RATE_LIMIT_PER_MIN`| Maximum requests per minute per IP | `60` |
| `DAILY_TOKEN_CAP` | Maximum daily LLM tokens before heuristic fallback | `200000` |
| `CANOPY_LLM_BASE_URL` | OpenAI-compatible LLM endpoint | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `CANOPY_LLM_MODEL` | Gemma model identifier | `models/gemma-4-26b-a4b-it` |
| `CANOPY_LLM_API_KEY` | Google AI Studio or OpenAI API key | *Secret* |
