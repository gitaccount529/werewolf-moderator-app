import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'game.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance and safety pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Query Helpers ───────────────────────────────────────────

export function queryAll<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): Database.RunResult {
  return db.prepare(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export { db };
export default db;
