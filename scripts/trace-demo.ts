import 'dotenv/config';
import { createSentry, type GenAiTraceData } from '../src/server/sentry.js';
import crypto from 'node:crypto';

interface TraceScenario {
  agentName: GenAiTraceData['agentName'];
  kind: string;
  model: string;
  lang?: string;
  cacheHit: boolean;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  retries: number;
  isDegraded: boolean;
  note: string;
}

const scenarios: TraceScenario[] = [
  // CanopyDigestAgent (7 scenarios)
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 342,
    tokensOut: 68,
    latencyMs: 13705,
    retries: 0,
    isDegraded: false,
    note: 'English digest cold execution (HEAD~5)',
  },
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 2,
    retries: 0,
    isDegraded: false,
    note: 'English digest instant cache hit (0 LLM calls)',
  },
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'bn',
    cacheHit: false,
    tokensIn: 388,
    tokensOut: 94,
    latencyMs: 14210,
    retries: 0,
    isDegraded: false,
    note: 'Bengali digest cold execution (HEAD~5)',
  },
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'bn',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 3,
    retries: 0,
    isDegraded: false,
    note: 'Bengali digest instant cache hit (0 LLM calls)',
  },
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 710,
    tokensOut: 112,
    latencyMs: 16450,
    retries: 1,
    isDegraded: false,
    note: 'Digest transient JSON format retry recovery (attempt 2)',
  },
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 890,
    tokensOut: 140,
    latencyMs: 21300,
    retries: 2,
    isDegraded: true,
    note: 'Digest 2 retries exhausted -> deterministic heuristic fallback',
  },
  {
    agentName: 'CanopyDigestAgent',
    kind: 'digest',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 1,
    retries: 0,
    isDegraded: true,
    note: 'Digest cached degraded fallback record read',
  },

  // CanopyWhyAgent (5 scenarios)
  {
    agentName: 'CanopyWhyAgent',
    kind: 'why',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 480,
    tokensOut: 85,
    latencyMs: 12940,
    retries: 0,
    isDegraded: false,
    note: 'Why inspection: apps/web/src/module_001.tsx cold read',
  },
  {
    agentName: 'CanopyWhyAgent',
    kind: 'why',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 4,
    retries: 0,
    isDegraded: false,
    note: 'Why inspection: apps/web/src/module_001.tsx cache hit',
  },
  {
    agentName: 'CanopyWhyAgent',
    kind: 'why',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 520,
    tokensOut: 90,
    latencyMs: 13420,
    retries: 0,
    isDegraded: false,
    note: 'Why inspection: services/billing/stripe/module_001.ts cold read',
  },
  {
    agentName: 'CanopyWhyAgent',
    kind: 'why',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 2,
    retries: 0,
    isDegraded: false,
    note: 'Why inspection: services/billing/stripe/module_001.ts cache hit',
  },
  {
    agentName: 'CanopyWhyAgent',
    kind: 'why',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 950,
    tokensOut: 160,
    latencyMs: 19800,
    retries: 2,
    isDegraded: true,
    note: 'Why inspection degraded fallback under rate throttling',
  },

  // CanopyCommitAgent (4 scenarios)
  {
    agentName: 'CanopyCommitAgent',
    kind: 'commit',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 210,
    tokensOut: 32,
    latencyMs: 8400,
    retries: 0,
    isDegraded: false,
    note: 'Commit msg generation cold run for auth router diff',
  },
  {
    agentName: 'CanopyCommitAgent',
    kind: 'commit',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 2,
    retries: 0,
    isDegraded: false,
    note: 'Commit msg generation exact diff cache hit',
  },
  {
    agentName: 'CanopyCommitAgent',
    kind: 'commit',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 440,
    tokensOut: 45,
    latencyMs: 11200,
    retries: 1,
    isDegraded: false,
    note: 'Commit msg length constraint retry recovery',
  },
  {
    agentName: 'CanopyCommitAgent',
    kind: 'commit',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 620,
    tokensOut: 50,
    latencyMs: 15100,
    retries: 2,
    isDegraded: true,
    note: 'Commit msg heuristic fallback from diff stats',
  },

  // CanopySummaryAgent (4 scenarios)
  {
    agentName: 'CanopySummaryAgent',
    kind: 'summary',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 290,
    tokensOut: 55,
    latencyMs: 9100,
    retries: 0,
    isDegraded: false,
    note: 'File summary cold read: packages/ui/components/module_002.ts',
  },
  {
    agentName: 'CanopySummaryAgent',
    kind: 'summary',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: true,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 2,
    retries: 0,
    isDegraded: false,
    note: 'File summary cache hit: packages/ui/components/module_002.ts',
  },
  {
    agentName: 'CanopySummaryAgent',
    kind: 'summary',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'bn',
    cacheHit: false,
    tokensIn: 340,
    tokensOut: 70,
    latencyMs: 10400,
    retries: 0,
    isDegraded: false,
    note: 'File summary Bengali translation cold read',
  },
  {
    agentName: 'CanopySummaryAgent',
    kind: 'summary',
    model: 'models/gemma-4-26b-a4b-it',
    lang: 'en',
    cacheHit: false,
    tokensIn: 680,
    tokensOut: 85,
    latencyMs: 14500,
    retries: 2,
    isDegraded: true,
    note: 'File summary degraded fallback when daily cap exceeded',
  },
];

async function runTraceDemo() {
  const dsn = process.env.SENTRY_DSN;
  console.log('🌲 Running Sentry GenAI Trace Demo (20 scenarios)...');
  console.log(`- Sentry DSN configured: ${dsn ? 'YES (' + dsn.slice(0, 15) + '...)' : 'NO (simulated)'}`);

  const sentry = createSentry(dsn || 'https://dummykey123@o12345.ingest.sentry.io/67890');

  let sentCount = 0;
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const blobHash = crypto.createHash('sha1').update(`trace-seed-${i}-${s.note}`).digest('hex');

    sentry.recordGenAiSpan({
      agentName: s.agentName,
      kind: s.kind,
      model: s.model,
      system: 'gemma',
      blobHash,
      lang: s.lang,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      latencyMs: s.latencyMs,
      cacheHit: s.cacheHit,
      retries: s.retries,
      isDegraded: s.isDegraded,
    });

    sentCount++;
    // Brief sleep to space timestamps
    await new Promise((r) => setTimeout(r, 60));
  }

  console.log(`\n✅ Generated and recorded ${sentCount}/${scenarios.length} GenAI traces into Sentry!`);
  console.log('Scenarios covered:');
  console.log('- Agents: CanopyDigestAgent, CanopyWhyAgent, CanopyCommitAgent, CanopySummaryAgent');
  console.log('- Cache status: cold misses, instant cache hits (0 LLM tokens, <5ms latency)');
  console.log('- Retries: 1 retry recovery, 2 retries fallback');
  console.log('- Degradation: deterministic heuristic fallbacks');
  console.log('- Languages: English (en) and Bengali (bn)');
  console.log('- Privacy: Request diffs and client IP addresses scrubbed completely.');
}

runTraceDemo().catch((err) => {
  console.error('Trace demo error:', err);
  process.exit(1);
});
