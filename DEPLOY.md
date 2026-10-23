# Deploying Canopy to Render

Canopy is fully packaged for Render using Docker (`Dockerfile`) and an Infrastructure-as-Code Blueprint (`render.yaml`).

---

## 1. Exact Settings for Existing Render Web Service (`canopy`)

If you created your Web Service directly in Render (e.g. `https://canopy-lazy-git.onrender.com`):

### **General / Build & Deploy Settings**
| Setting Field | Exact Value |
| :--- | :--- |
| **Name** | `canopy` |
| **Repository** | `https://github.com/SayemR0018/canopy` |
| **Branch** | `main` |
| **Root Directory** | *(leave blank)* |
| **Runtime / Environment** | `Docker` |
| **Plan** | `Free` |
| **Region** | `Oregon (US West)` |
| **Dockerfile Path** | `./Dockerfile` |
| **Docker Context** | `.` |
| **Docker Command** | *(leave blank / default to CMD)* |

### **Health Check & Networking**
| Setting Field | Exact Value |
| :--- | :--- |
| **Health Check Path** | `/healthz` |
| **Port** | `10000` *(Render sets $PORT automatically)* |

### **Environment Variables**
In **Environment** tab:
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
| `CANOPY_LLM_API_KEY` | *(Your Google AI Studio API Key)* | Required for live LLM completions |

---

## 2. Alternative: Native Node Web Service (Without Docker)

If you configure the Web Service with **Node** runtime instead of Docker:

| Setting Field | Value |
| :--- | :--- |
| **Environment / Runtime** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/healthz` |
| **Environment Variables** | Same table as above |

---

## 3. Automatic Deployment via Blueprint (3 Clicks)

1. **Click 1: New Blueprint Instance**
   - In Render Dashboard, click **"New +"** -> **"Blueprint"**.
2. **Click 2: Connect GitHub Repository**
   - Select `https://github.com/SayemR0018/canopy.git`.
   - Render automatically parses `render.yaml`.
3. **Click 3: Apply Blueprint**
   - Fill in `CANOPY_LLM_API_KEY` secret when prompted, then click **"Apply"**.
