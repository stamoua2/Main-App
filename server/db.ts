// Adaptateur de base de données.
// - Production (Netlify) : Netlify DB / Neon PostgreSQL via NETLIFY_DATABASE_URL.
// - Développement local et tests : PGlite (PostgreSQL WASM), persisté dans
//   .data/pglite ou en mémoire (PGLITE_MEMORY=1).

import { DDL } from "./schema.js";

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

export interface Db {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

let dbPromise: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  let db: Db;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    db = {
      async query<T>(text: string, params: unknown[] = []) {
        const rows = (await sql(text, params as never[])) as unknown;
        return { rows: (Array.isArray(rows) ? rows : (rows as { rows: T[] }).rows) as T[] };
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    let pg;
    if (process.env.PGLITE_MEMORY) {
      pg = new PGlite();
    } else {
      const dir = process.env.PGLITE_DIR || ".data/pglite";
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true });
      pg = new PGlite(dir);
    }
    db = {
      async query<T>(text: string, params: unknown[] = []) {
        const res = await pg.query<T>(text, params as never[]);
        return { rows: res.rows };
      },
    };
  }
  for (const statement of DDL) {
    await db.query(statement);
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}

/** Réinitialise la connexion (tests : nouvelle base en mémoire). */
export function resetDbForTests(): void {
  dbPromise = null;
}
