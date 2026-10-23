# Gemma Model Bakeoff Results

Measured across 5 cold-start runs per model against Google AI Studio's OpenAI-compatible completions endpoint on synthetic git commit diffs.

## Comparison Matrix

| Model | p50 Latency | p95 Latency | First-Try Schema-Valid Rate | Total Retries | Degraded Count | Selection |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `models/gemma-4-26b-a4b-it` | 13705 ms | 14788.6 ms | 100% | 0 | 0 | **Selected (Winner)** |
| `models/gemma-4-31b-it` | 24200 ms | 99952.4 ms | 80% | 2 | 1 | Alternative |

## Decision Rationale

- **Selected**: `models/gemma-4-26b-a4b-it`
- **Evaluation**: `models/gemma-4-26b-a4b-it` achieved 100% first-try schema validity with a p50 latency of 13705 ms and 0 degraded fallbacks across 5 runs.
- **Why not alternative**: Evaluated against models/gemma-4-26b-a4b-it, models/gemma-4-31b-it. models/gemma-4-26b-a4b-it provides optimal balance between inference speed and zero-shot structured JSON compliance without hitting free-tier token quota exhaustion.

## Raw 5-Run Telemetry

### `models/gemma-4-26b-a4b-it`

| Run | Latency | Schema Valid | Retries | Degraded | Tokens In | Tokens Out |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 13775 ms | ✅ Yes | 0 | No | 1149 | 89 |
| 2 | 13705 ms | ✅ Yes | 0 | No | 1380 | 93 |
| 3 | 15042 ms | ✅ Yes | 0 | No | 1387 | 108 |
| 4 | 13254 ms | ✅ Yes | 0 | No | 1242 | 88 |
| 5 | 12147 ms | ✅ Yes | 0 | No | 1240 | 98 |

### `models/gemma-4-31b-it`

| Run | Latency | Schema Valid | Retries | Degraded | Tokens In | Tokens Out |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 24200 ms | ✅ Yes | 0 | No | 1149 | 114 |
| 2 | 19485 ms | ❌ No | 2 | ⚠️ Yes | 0 | 0 |
| 3 | 116148 ms | ✅ Yes | 0 | No | 1387 | 98 |
| 4 | 18107 ms | ✅ Yes | 0 | No | 1242 | 108 |
| 5 | 35170 ms | ✅ Yes | 0 | No | 1240 | 74 |

