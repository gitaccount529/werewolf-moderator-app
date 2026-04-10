import { createClient, type Client, type InArgs, type InValue, type ResultSet, type Transaction } from '@libsql/client';

// ─── Connection ──────────────────────────────────────────────
// Turso (libSQL) replaces better-sqlite3. The client speaks the same SQL
// dialect as SQLite, so our schema in db/migrate.ts and all existing queries
// work unchanged — only the driver and async boundary differ.

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error(
    'TURSO_DATABASE_URL is not set. Add it to .env.local (see the deployment plan).',
  );
}

export const client: Client = createClient({
  url,
  authToken,
});

// ─── Helpers ─────────────────────────────────────────────────
// All helpers are async — every call site in game-logic.ts and the API
// routes must `await` them.

/**
 * Run a SELECT that returns zero or more rows.
 * Rows are returned as plain objects keyed by column name.
 */
export async function queryAll<T>(sql: string, ...params: InValue[]): Promise<T[]> {
  const result = await client.execute({ sql, args: params as InArgs });
  return result.rows as unknown as T[];
}

/**
 * Run a SELECT that returns at most one row.
 * Returns `undefined` if the query produces no rows — matching the
 * old better-sqlite3 semantics so call sites don't need to change their
 * null-checking logic.
 */
export async function queryOne<T>(sql: string, ...params: InValue[]): Promise<T | undefined> {
  const result = await client.execute({ sql, args: params as InArgs });
  return (result.rows[0] as unknown as T) ?? undefined;
}

/**
 * Run an INSERT/UPDATE/DELETE. Returns the ResultSet so callers can read
 * `lastInsertRowid` or `rowsAffected` when needed.
 */
export async function run(sql: string, ...params: InValue[]): Promise<ResultSet> {
  return client.execute({ sql, args: params as InArgs });
}

// ─── Transactions ────────────────────────────────────────────
/**
 * Run a set of queries atomically. The callback receives a `tx` handle
 * that exposes its own `.execute({ sql, args })` method — use it instead
 * of the top-level `run()` helper for statements that must be part of the
 * transaction. If the callback throws, the transaction is rolled back and
 * the error is re-thrown for the caller to handle.
 *
 * Usage:
 *   await transaction(async (tx) => {
 *     await tx.execute({ sql: 'INSERT INTO players (...) VALUES (?, ?)', args: [name, gameId] });
 *     await tx.execute({ sql: 'UPDATE games SET ... WHERE id = ?', args: [gameId] });
 *   });
 *
 * The 'write' mode is required for transactions containing any
 * INSERT/UPDATE/DELETE. Use client.transaction('read') directly if you ever
 * need a read-only transaction (none of the current call sites do).
 */
export async function transaction<T>(
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await client.transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
