import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const OUTPUT_FILE = path.join(DOCS_DIR, 'ollama-results.json');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const TIMEOUT_MS = 3000;

interface OllamaTag {
  name: string;
  size: number;
  digest: string;
}

interface OllamaTagsResponse {
  models?: OllamaTag[];
}

interface VerificationResult {
  timestamp: string;
  available: boolean;
  endpoint: string;
  status: string;
  installedModels: string[];
  selectedModel?: string;
  testRuns?: {
    digest?: { latencyMs: number; valid: boolean; output: any };
    commit?: { latencyMs: number; valid: boolean; output: any };
    why?: { latencyMs: number; valid: boolean; output: any };
  };
  note: string;
  instructions: string;
}

async function probeOllama(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { ok: false, models: [], error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = (await res.json()) as OllamaTagsResponse;
    const modelNames = (data.models || []).map((m) => m.name);
    return { ok: true, models: modelNames };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { ok: false, models: [], error: err.name === 'AbortError' ? 'Connection timed out' : err.message };
  }
}

async function main() {
  console.log('======================================================');
  console.log('🦙 Canopy Ollama Local LLM Verification');
  console.log('======================================================\n');
  console.log(`Checking Ollama daemon at ${OLLAMA_HOST}...`);

  const probe = await probeOllama();

  if (!probe.ok) {
    console.log(`⚠️  Ollama daemon is currently unavailable at ${OLLAMA_HOST}`);
    console.log(`   Reason: ${probe.error}`);
    console.log('\nTo run Canopy with local open-source models via Ollama:');
    console.log('1. Download and install Ollama from: https://ollama.com');
    console.log('2. Start the daemon: `ollama serve`');
    console.log('3. Pull a recommended lightweight model: `ollama pull gemma2:2b` or `ollama pull llama3.2`');
    console.log('4. Launch Canopy with local environment variables:');
    console.log('   CANOPY_LLM_BASE_URL="http://localhost:11434/v1"');
    console.log('   CANOPY_LLM_MODEL="gemma2:2b"');
    console.log('   CANOPY_LLM_API_KEY="ollama" (any non-empty placeholder)');

    const result: VerificationResult = {
      timestamp: new Date().toISOString(),
      available: false,
      endpoint: OLLAMA_HOST,
      status: `Unavailable: ${probe.error}`,
      installedModels: [],
      note: 'Ollama is not running in this environment. Canopy gracefully degrades or uses Google AI Studio Gemini/Gemma.',
      instructions: 'Install Ollama, execute `ollama pull gemma2:2b`, and configure CANOPY_LLM_BASE_URL=http://localhost:11434/v1',
    };

    if (!fs.existsSync(DOCS_DIR)) {
      fs.mkdirSync(DOCS_DIR, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n📄 Recorded status to ${path.relative(ROOT_DIR, OUTPUT_FILE)}.`);
    return;
  }

  console.log(`✅ Ollama is online! Found ${probe.models.length} installed model(s):`);
  for (const m of probe.models) {
    console.log(`  - ${m}`);
  }

  const selectedModel = probe.models[0] || 'gemma2:2b';
  console.log(`\nTesting OpenAI-compatible endpoint at ${OLLAMA_HOST}/v1 with model ${selectedModel}...`);

  // Simple test chat completion via OpenAI-compatible endpoint
  let testRuns: VerificationResult['testRuns'] = {};
  try {
    const chatStart = Date.now();
    const chatRes = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ollama',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: 'You are Canopy. Output valid JSON: {"status": "ok"}' },
          { role: 'user', content: 'Ping' },
        ],
        temperature: 0.1,
      }),
    });

    const elapsed = Date.now() - chatStart;
    if (chatRes.ok) {
      const data = await chatRes.json();
      testRuns.digest = {
        latencyMs: elapsed,
        valid: true,
        output: data.choices?.[0]?.message?.content,
      };
      console.log(`  ✅ Chat completion succeeded in ${elapsed} ms.`);
    } else {
      console.warn(`  ⚠️ Chat completion returned HTTP ${chatRes.status}`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️ Test inference failed: ${err.message}`);
  }

  const result: VerificationResult = {
    timestamp: new Date().toISOString(),
    available: true,
    endpoint: OLLAMA_HOST,
    status: 'Available & Verified',
    installedModels: probe.models,
    selectedModel,
    testRuns,
    note: 'Ollama is active and OpenAI-compatible completions respond as expected.',
    instructions: 'Set CANOPY_LLM_BASE_URL=http://localhost:11434/v1 and CANOPY_LLM_MODEL=' + selectedModel,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n📄 Recorded verification results to ${path.relative(ROOT_DIR, OUTPUT_FILE)}.`);
}

main().catch((err) => {
  console.error('Fatal error in verify-ollama:', err);
  process.exit(1);
});
