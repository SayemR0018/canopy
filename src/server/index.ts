import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { GitService } from './git.js';
import { openDatabase } from '../db/index.js';
import { seedRepository } from '../seed.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || './data';
const PUBLIC_READONLY = process.env.PUBLIC_READONLY === 'true';
const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10);
const DAILY_TOKEN_CAP = parseInt(process.env.DAILY_TOKEN_CAP || '200000', 10);

async function startServer() {
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

  const app = createApp({
    gitService,
    db,
    publicReadonly: PUBLIC_READONLY,
    rateLimitPerMin: RATE_LIMIT_PER_MIN,
    dailyTokenCap: DAILY_TOKEN_CAP,
    sentryDsn: process.env.SENTRY_DSN,
  });

  const server = serve(
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
    }
  );

  return { app, server, gitService, db };
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
  startServer().catch((err) => {
    console.error('Failed to start Canopy server:', err);
    process.exit(1);
  });
}

export { startServer };
