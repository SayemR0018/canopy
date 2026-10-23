import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement<T = any> {
  run(...params: any[]): RunResult;
  get(...params: any[]): T | undefined;
  all(...params: any[]): T[];
}

export interface DatabaseAdapter {
  exec(sql: string): void;
  prepare<T = any>(sql: string): Statement<T>;
  close(): void;
  readonly inTransaction: boolean;
}

export function openDatabase(dbPath: string): DatabaseAdapter {
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Try better-sqlite3 first if available
  try {
    const BetterSqlite3 = req('better-sqlite3');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    return db;
  } catch {
    // Fall back to built-in node:sqlite
    const { DatabaseSync } = req('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');

    return {
      exec(sql: string): void {
        db.exec(sql);
      },
      prepare<T = any>(sql: string): Statement<T> {
        const stmt = db.prepare(sql);
        return {
          run(...params: any[]): RunResult {
            const res = stmt.run(...params);
            return {
              changes: Number(res.changes || 0),
              lastInsertRowid: res.lastInsertRowid ?? 0,
            };
          },
          get(...params: any[]): T | undefined {
            return stmt.get(...params) as T | undefined;
          },
          all(...params: any[]): T[] {
            return stmt.all(...params) as T[];
          },
        };
      },
      close(): void {
        db.close();
      },
      get inTransaction(): boolean {
        return false;
      },
    };
  }
}
