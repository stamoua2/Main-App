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

export class DbNotProvisionedError extends Error {}

let dbPromise: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  const url =
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL;
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
  } else if (
    process.env.NETLIFY ||
    process.env.NETLIFY_LOCAL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  ) {
    // En production Netlify sans base : erreur explicite plutôt qu'un 500 opaque.
    throw new DbNotProvisionedError(
      "Netlify DB non provisionnée : ouvrez l'extension Neon du site (Extensions → Neon → Add database) " +
        "ou exécutez « npx netlify db init », puis redéployez.",
    );
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
  // Amorçage automatique : au premier démarrage (aucun utilisateur), insère
  // les données de départ — compte d'Alex (SEED_ALEX_PASSWORD), forfaits du
  // site, catalogue de services, client de démonstration.
  const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM users");
  if (Number(rows[0].n) === 0) {
    const { seedAll } = await import("./seed.js");
    await seedAll(db);
  } else {
    // Base déjà peuplée (production existante) : insère quand même les défauts
    // du calculateur de prix des forfaits s'ils manquent (idempotent).
    const { seedPackagePricingDefaults } = await import("./seed.js");
    await seedPackagePricingDefaults(db);
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = createDb();
    // Ne pas mettre en cache un échec : réessaie à la prochaine requête
    // (utile quand la base vient tout juste d'être provisionnée).
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Réinitialise la connexion (tests : nouvelle base en mémoire). */
export function resetDbForTests(): void {
  dbPromise = null;
}
