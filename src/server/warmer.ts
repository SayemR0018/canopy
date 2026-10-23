import type { GitService } from './git.js';
import type { DerivedService } from './derived.js';

export interface WarmingItem {
  name: string;
  latencyMs: number;
  status: string;
}

export interface WarmingProgress {
  status: 'idle' | 'warming' | 'ready';
  currentStep: string;
  warmedCount: number;
  totalToWarm: number;
  items: WarmingItem[];
}

export const warmingState: WarmingProgress = {
  status: 'idle',
  currentStep: 'Idle',
  warmedCount: 0,
  totalToWarm: 5,
  items: [],
};

export async function warmCacheInBackground(gitService: GitService, derivedService: DerivedService): Promise<void> {
  // Respect daily token cap
  if (derivedService.isDailyCapExceeded()) {
    console.log('⚡ Daily token cap exceeded; skipping background cache warming.');
    warmingState.status = 'ready';
    warmingState.currentStep = 'Skipped (daily token cap reached)';
    return;
  }

  warmingState.status = 'warming';
  console.log('🔥 Starting background demo cache warming on boot (5 items)...');

  const demoWhyFiles = [
    'apps/web/src/module_001.tsx',
    'packages/ui/components/module_002.ts',
    'services/billing/stripe/module_001.ts',
  ];

  try {
    // 1. Warm English Digest for HEAD~5
    warmingState.currentStep = 'Warming demo digest (en)...';
    const startDigestEn = Date.now();
    const diffEn = await gitService.getDiff('HEAD~5', 'HEAD');
    await derivedService.getDigest(diffEn, 'HEAD~5', 'en');
    const elapsedDigestEn = Date.now() - startDigestEn;
    warmingState.warmedCount++;
    warmingState.items.push({ name: 'Digest (en, HEAD~5)', latencyMs: elapsedDigestEn, status: 'ready' });
    console.log(`  - [1/5] Demo digest (en) warmed in ${elapsedDigestEn} ms`);

    // 2. Warm Bengali Digest for HEAD~5
    if (!derivedService.isDailyCapExceeded()) {
      warmingState.currentStep = 'Warming demo digest (bn)...';
      const startDigestBn = Date.now();
      const diffBn = await gitService.getDiff('HEAD~5', 'HEAD');
      await derivedService.getDigest(diffBn, 'HEAD~5', 'bn');
      const elapsedDigestBn = Date.now() - startDigestBn;
      warmingState.warmedCount++;
      warmingState.items.push({ name: 'Digest (bn, HEAD~5)', latencyMs: elapsedDigestBn, status: 'ready' });
      console.log(`  - [2/5] Demo digest (bn) warmed in ${elapsedDigestBn} ms`);
    }

    // 3..5 Warm 3 demo Why files
    let idx = 3;
    for (const filePath of demoWhyFiles) {
      if (derivedService.isDailyCapExceeded()) {
        console.log(`  - Daily cap reached; skipping remaining why warming for ${filePath}`);
        break;
      }
      warmingState.currentStep = `Warming demo why: ${filePath}...`;
      const startWhy = Date.now();
      const commits = await gitService.getLog('HEAD', 15, filePath);
      const blame = await gitService.getBlame(filePath, 'HEAD');

      const authorMap = new Map<string, number>();
      for (const line of blame.lines) {
        authorMap.set(line.author, (authorMap.get(line.author) || 0) + 1);
      }
      const topAuthors = Array.from(authorMap.entries())
        .map(([author, count]) => `${author}: ${count} lines`)
        .join(', ');

      const historyContext = commits
        .map((c) => `[${c.hash.slice(0, 8)}] ${c.date.slice(0, 10)} (${c.author}): ${c.message}`)
        .join('\n');
      const blameSummary = `Total lines: ${blame.lines.length}. Authors: ${topAuthors}`;

      await derivedService.getWhy(filePath, historyContext, blameSummary);
      const elapsedWhy = Date.now() - startWhy;
      warmingState.warmedCount++;
      warmingState.items.push({ name: `Why: ${filePath}`, latencyMs: elapsedWhy, status: 'ready' });
      console.log(`  - [${idx}/5] Demo why (${filePath}) warmed in ${elapsedWhy} ms`);
      idx++;
    }

    warmingState.status = 'ready';
    warmingState.currentStep = 'Demo cache fully warmed and ready';
    console.log(`✅ Background cache warming complete (${warmingState.warmedCount}/${warmingState.totalToWarm} items pre-cached).\n`);
  } catch (err: any) {
    console.error('⚠️ Background cache warming encountered error (non-fatal):', err.message);
    warmingState.status = 'ready';
    warmingState.currentStep = `Completed with partial cache (${err.message})`;
  }
}
