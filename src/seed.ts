import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Seeded PRNG (Mulberry32) for 100% deterministic generation
function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createPRNG(1337);

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

const DIRS = [
  'apps/web/src',
  'apps/web/public',
  'apps/api/src/controllers',
  'apps/api/src/services',
  'apps/api/src/models',
  'apps/api/src/routes',
  'apps/admin/src',
  'packages/ui/components',
  'packages/ui/styles',
  'packages/utils/strings',
  'packages/utils/dates',
  'packages/utils/math',
  'packages/auth/providers',
  'packages/auth/jwt',
  'packages/db/migrations',
  'packages/db/schema',
  'packages/config/env',
  'packages/config/defaults',
  'services/billing/stripe',
  'services/billing/invoices',
  'services/notifications/email',
  'services/notifications/sms',
  'services/notifications/push',
  'services/analytics/collectors',
  'services/analytics/aggregators',
  'services/search/indexing',
  'services/search/query',
  'services/storage/s3',
  'services/storage/local',
  'services/workers/tasks',
  'libs/crypto/hash',
  'libs/logger/formatters',
  'libs/validator/rules',
  'libs/router/middleware',
  'libs/cache/redis',
  'libs/queue/bull',
  'libs/metrics/prometheus',
  'libs/tracing/otel',
  'tools/scripts',
  'docs/guides',
];

const EXTENSIONS = ['.ts', '.tsx', '.json', '.md', '.sql', '.css'];

const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'perf', 'docs', 'chore', 'test'];
const SCOPES = ['auth', 'billing', 'api', 'ui', 'cache', 'db', 'search', 'logger', 'worker'];

function generateFileContent(filePath: string, version: number): string {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  if (ext === '.ts' || ext === '.tsx') {
    return `/**
 * @file ${filePath}
 * Synthetic file generated for Canopy monorepo testing
 * Version: ${version}
 */

export interface ${base.replace(/[^a-zA-Z0-9]/g, '_')}Config {
  id: string;
  enabled: boolean;
  version: number;
  retries: number;
}

export class ${base.replace(/[^a-zA-Z0-9]/g, '_')}Handler {
  private config: ${base.replace(/[^a-zA-Z0-9]/g, '_')}Config;

  constructor(config: Partial<${base.replace(/[^a-zA-Z0-9]/g, '_')}Config> = {}) {
    this.config = {
      id: '${base}-' + Math.random().toString(36).slice(2, 7),
      enabled: config.enabled ?? true,
      version: ${version},
      retries: config.retries ?? ${randInt(1, 5)},
    };
  }

  public async execute(payload: Record<string, unknown>): Promise<{ status: string; v: number }> {
    if (!this.config.enabled) {
      throw new Error('${base} is currently disabled');
    }
    // Business logic simulation for synthetic benchmark
    return {
      status: 'processed',
      v: this.config.version,
    };
  }
}
`;
  }

  if (ext === '.json') {
    return JSON.stringify(
      {
        name: base,
        version: `1.${version}.0`,
        synthetic: true,
        flags: {
          experimental: rng() > 0.5,
          debug: rng() > 0.8,
        },
        thresholds: {
          timeoutMs: randInt(100, 5000),
          maxBatchSize: randInt(10, 500),
        },
      },
      null,
      2
    );
  }

  if (ext === '.sql') {
    return `-- Synthetic schema migration for ${base}
CREATE TABLE IF NOT EXISTS synthetic_${base} (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version INT DEFAULT ${version},
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_synthetic_${base}_name ON synthetic_${base}(name);
`;
  }

  if (ext === '.css') {
    return `/* Synthetic styles for ${base} */
.${base}-container {
  display: flex;
  flex-direction: column;
  padding: ${randInt(8, 24)}px;
  background-color: var(--canopy-bg, #ffffff);
}
.${base}-title {
  font-size: ${randInt(14, 28)}px;
  color: var(--canopy-text, #111827);
}
`;
  }

  return `# ${base}

This is synthetic documentation for \`${filePath}\` (Revision ${version}).

## Overview
Part of the Canopy synthetic monorepo suite.
Deterministic file created to benchmark lazy hydration and AI summaries.

- Directory: \`${path.dirname(filePath)}\`
- Revision: ${version}
- Synthetic: true
`;
}

export async function seedRepository(dataDir: string = './data'): Promise<{
  repoPath: string;
  totalFiles: number;
  totalDirs: number;
  totalCommits: number;
}> {
  const repoPath = path.resolve(dataDir, 'repo.git');

  // Clean existing repo if needed
  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
  fs.mkdirSync(repoPath, { recursive: true });

  // 1. Initialize bare repo
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('git', ['init', '--bare', repoPath]);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git init --bare failed with code ${code}`));
    });
  });

  // Set default branch to main
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('git', ['--git-dir=' + repoPath, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git symbolic-ref failed with code ${code}`));
    });
  });

  // 2. Generate file pool: ~3000 files across 40 directories
  // 40 directories * 75 files each = 3,000 files
  const FILES: string[] = [];
  for (const dir of DIRS) {
    for (let i = 1; i <= 75; i++) {
      const ext = EXTENSIONS[(i + dir.length) % EXTENSIONS.length];
      const fileName = `module_${i.toString().padStart(3, '0')}${ext}`;
      FILES.push(`${dir}/${fileName}`);
    }
  }

  const TOTAL_COMMITS = 200;
  console.log(`Generating fast-import stream for ${FILES.length} files across ${DIRS.length} dirs and ${TOTAL_COMMITS} commits...`);

  const initialFileCount = 1500;
  const initialFiles = FILES.slice(0, initialFileCount);
  const remainingFiles = FILES.slice(initialFileCount);

  const fastImport = spawn('git', ['--git-dir=' + repoPath, 'fast-import', '--quiet']);

  let markCounter = 1;
  let baseTimestamp = 1700000000;

  async function writeCommit(
    mark: number,
    parentMark: number | null,
    msg: string,
    fileChanges: { path: string; content: string }[],
    timestamp: number
  ) {
    let chunk = `commit refs/heads/main\nmark :${mark}\n`;
    chunk += `author Canopy Synthetic Generator <bot@canopy.local> ${timestamp} +0000\n`;
    chunk += `committer Canopy Synthetic Generator <bot@canopy.local> ${timestamp} +0000\n`;
    const msgBuffer = Buffer.from(msg, 'utf8');
    chunk += `data ${msgBuffer.length}\n${msg}\n`;

    if (parentMark !== null) {
      chunk += `from :${parentMark}\n`;
    }

    for (const fc of fileChanges) {
      const contentBuffer = Buffer.from(fc.content, 'utf8');
      chunk += `M 644 inline ${fc.path}\n`;
      chunk += `data ${contentBuffer.length}\n${fc.content}\n`;
    }

    const canWrite = fastImport.stdin.write(chunk);
    if (!canWrite) {
      await new Promise<void>((r) => fastImport.stdin.once('drain', r));
    }
  }

  console.log('Writing commit 1 (initial 1,500 files)...');
  const commit1Changes = initialFiles.map((p) => ({
    path: p,
    content: generateFileContent(p, 1),
  }));
  await writeCommit(1, null, 'feat(core): initial monorepo scaffold and baseline modules', commit1Changes, baseTimestamp);

  let remainingIndex = 0;
  const activeFiles = [...initialFiles];

  for (let c = 2; c <= TOTAL_COMMITS; c++) {
    markCounter = c;
    baseTimestamp += 3600;

    const commitType = pick(COMMIT_TYPES);
    const scope = pick(SCOPES);
    const msg = `${commitType}(${scope}): update synthetic business logic iteration ${c}`;

    const changes: { path: string; content: string }[] = [];

    const filesToAdd = c === TOTAL_COMMITS ? remainingFiles.length - remainingIndex : Math.min(8, remainingFiles.length - remainingIndex);
    for (let k = 0; k < filesToAdd; k++) {
      const newFile = remainingFiles[remainingIndex++];
      if (newFile) {
        changes.push({ path: newFile, content: generateFileContent(newFile, 1) });
        activeFiles.push(newFile);
      }
    }

    const modsCount = randInt(2, 4);
    for (let m = 0; m < modsCount; m++) {
      const target = pick(activeFiles);
      changes.push({ path: target, content: generateFileContent(target, c) });
    }

    await writeCommit(c, c - 1, msg, changes, baseTimestamp);

    if (c % 50 === 0 || c === TOTAL_COMMITS) {
      console.log(`Written ${c}/${TOTAL_COMMITS} commits...`);
    }
  }

  fastImport.stdin.end();

  await new Promise<void>((resolve, reject) => {
    fastImport.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git fast-import exited with code ${code}`));
    });
  });

  console.log(`Synthetic bare repo seeded at: ${repoPath}`);
  return {
    repoPath,
    totalFiles: FILES.length,
    totalDirs: DIRS.length,
    totalCommits: TOTAL_COMMITS,
  };
}
