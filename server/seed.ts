// Insertion des données de départ (idempotent).

import type { Db } from "./db.js";
import { hashPassword } from "./auth.js";
import { SEED_ALEX, SEED_TEST_CLIENT, SITE_PACKAGES, SITE_SERVICES } from "./seed-data.js";

export async function seedAll(db: Db, options: { alexPassword?: string } = {}): Promise<void> {
  // Compte d'Alex
  const alexPassword =
    options.alexPassword || process.env.SEED_ALEX_PASSWORD || "StAmourVert2026!";
  const { rows: existingAlex } = await db.query(
    "SELECT id FROM users WHERE lower(email) = lower($1)",
    [SEED_ALEX.email],
  );
  if (existingAlex.length === 0) {
    await db.query(
      "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin')",
      [SEED_ALEX.email, SEED_ALEX.name, hashPassword(alexPassword)],
    );
  }

  // Forfaits du site (remplacés à chaque seed pour rester conformes au site)
  for (let i = 0; i < SITE_PACKAGES.length; i++) {
    const pkg = SITE_PACKAGES[i];
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO packages (slug, name, visits, tagline, popular, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, visits = EXCLUDED.visits,
         tagline = EXCLUDED.tagline, popular = EXCLUDED.popular,
         position = EXCLUDED.position, active = true
       RETURNING id`,
      [pkg.slug, pkg.name, pkg.visits, pkg.tagline, pkg.popular, i],
    );
    const packageId = rows[0].id;
    await db.query("DELETE FROM package_items WHERE package_id = $1", [packageId]);
    for (let j = 0; j < pkg.items.length; j++) {
      await db.query(
        "INSERT INTO package_items (package_id, position, label) VALUES ($1, $2, $3)",
        [packageId, j, pkg.items[j]],
      );
    }
  }

  // Catalogue de services du site
  for (let i = 0; i < SITE_SERVICES.length; i++) {
    const svc = SITE_SERVICES[i];
    await db.query(
      `INSERT INTO services (name, description, position) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, position = EXCLUDED.position`,
      [svc.name, svc.description, i],
    );
  }

  // Client test avec adresse réelle de la région
  const { rows: existingClient } = await db.query(
    "SELECT id FROM clients WHERE email = $1",
    [SEED_TEST_CLIENT.email],
  );
  if (existingClient.length === 0) {
    const { rows: pkgRows } = await db.query<{ id: number }>(
      "SELECT id FROM packages WHERE slug = 'essentiel'",
    );
    await db.query(
      `INSERT INTO clients (first_name, last_name, email, phone, address_line, city, province, postal_code, status, notes, package_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        SEED_TEST_CLIENT.first_name,
        SEED_TEST_CLIENT.last_name,
        SEED_TEST_CLIENT.email,
        SEED_TEST_CLIENT.phone,
        SEED_TEST_CLIENT.address_line,
        SEED_TEST_CLIENT.city,
        SEED_TEST_CLIENT.province,
        SEED_TEST_CLIENT.postal_code,
        SEED_TEST_CLIENT.status,
        SEED_TEST_CLIENT.notes,
        pkgRows[0]?.id ?? null,
      ],
    );
  }
}
