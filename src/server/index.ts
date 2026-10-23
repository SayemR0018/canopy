import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { GitService } from './git.js';
import { openDatabase } from '../db/index.js';
import { seedRepository } from '../seed.js';
import { createSentry } from './sentry.js';
import { DerivedService } from './derived.js';
import { warmCacheInBackground } from './warmer.js';

dotenv.config();

const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || './data';
const PUBLIC_READONLY = process.env.PUBLIC_READONLY === 'true';
const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10);
const DAILY_TOKEN_CAP = parseInt(process.env.DAILY_TOKEN_CAP || '200000', 10);

async function startServer(overridePort?: number, overrideHost?: string) {
  const PORT = overridePort ?? DEFAULT_PORT;
  const HOST = overrideHost ?? DEFAULT_HOST;
  const repoPath = path.resolve(DATA_DIR, 'repo.git');

  // Auto-seed if bare repo is missing (critical for Render cold boot in <60s)
  if (!fs.existsSync(repoPath) || !fs.existsSync(path.join(repoPath, 'HEAD'))) {
    console.log(`Repository missing at ${repoPath}. Running synthetic seed...`);
    await seedRepository(DATA_DIR);
  }

  const gitService = new GitService(repoPath);
  const dbPath = path.resolve(DATA_DIR, 'cache.db');
  const db = openDatabase(dbPath);

  // Initialize SQLite schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS derived (
      blob_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      lang TEXT NOT NULL,
      output TEXT NOT NULL,
      tokens_in INTEGER NOT NULL,
      tokens_out INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      is_degraded INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (blob_hash, kind, model, prompt_version, lang)
    );
    CREATE INDEX IF NOT EXISTS idx_derived_lookup ON derived(blob_hash, kind);
    CREATE INDEX IF NOT EXISTS idx_derived_created ON derived(created_at);

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_str TEXT NOT NULL,
      tokens_in INTEGER NOT NULL,
      tokens_out INTEGER NOT NULL,
      model TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date_str);
  `);

  const sentry = createSentry(process.env.SENTRY_DSN);

  const derivedService = new DerivedService(db, undefined, DAILY_TOKEN_CAP);

  const app = createApp({
    gitService,
    db,
    derivedService,
    publicReadonly: PUBLIC_READONLY,
    rateLimitPerMin: RATE_LIMIT_PER_MIN,
    dailyTokenCap: DAILY_TOKEN_CAP,
    sentryDsn: process.env.SENTRY_DSN,
  });

  const server = await new Promise<any>((resolve) => {
    const s = serve(
      {
        fetch: app.fetch,
        port: PORT,
        hostname: HOST,
      },
      (info) => {
        console.log(`🌲 Canopy Server running on http://${HOST}:${info.port}`);
        console.log(`- Data Directory: ${DATA_DIR}`);
        console.log(`- Bare Repo: ${repoPath}`);
        console.log(`- Public Readonly: ${PUBLIC_READONLY}`);
        console.log(`- Sentry: ${process.env.SENTRY_DSN ? 'active' : 'disabled'}`);
        if (process.env.SENTRY_DSN) {
          sentry.captureMessage(`Canopy Server running on port ${info.port}`, 'info');
        }

        // Trigger background demo cache warming in production if API key is set
        if (process.env.CANOPY_LLM_API_KEY && process.env.NODE_ENV !== 'test') {
          warmCacheInBackground(gitService, derivedService).catch((err) => {
            console.error('Background warming failed:', err);
          });
        }

        resolve(s);
      }
    );
  });

  return { app, server, gitService, db, sentry, derivedService };
}

const isServerMain = () => {
  if (!process.argv[1]) return false;
  const p = path.resolve(process.argv[1]);
  return (
    p === path.resolve('src/server/index.ts') ||
    p === path.resolve('dist/server/index.js') ||
    p.endsWith(path.join('server', 'index.js')) ||
    p.endsWith(path.join('server', 'index.ts'))
  );
};

if (isServerMain()) {
  const sentry = createSentry(process.env.SENTRY_DSN);

  process.on('uncaughtException', (err) => {
    sentry.captureException(err, { source: 'process.uncaughtException' });
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    sentry.captureException(reason, { source: 'process.unhandledRejection' });
    console.error('Unhandled Rejection:', reason);
  });

  startServer().catch((err) => {
    sentry.captureException(err, { source: 'startServer' });
    console.error('Failed to start Canopy server:', err);
    process.exit(1);
  });
}

export { startServer };
