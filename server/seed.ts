// Insertion des données de départ (idempotent).

import type { Db } from "./db.js";
import { hashPassword } from "./auth.js";
import { SEED_ALEX, SEED_TEST_CLIENTS, SITE_PACKAGES, SITE_SERVICES } from "./seed-data.js";
import { OJ_CATALOG } from "./oj-catalog.js";

/**
 * Importe (ou met à jour) le catalogue OJ Compagnie. Idempotent : la clé
 * d'identification est le SKU lorsqu'il existe, sinon le couple nom + format.
 * Les quantités en stock ne sont jamais écrasées.
 */
export async function importOjCatalog(db: Db): Promise<{ inserted: number; updated: number; total: number }> {
  let inserted = 0;
  let updated = 0;
  for (const product of OJ_CATALOG) {
    const { rows: existing } = await db.query<{ id: number }>(
      product.sku
        ? "SELECT id FROM inventory_items WHERE source = 'oj' AND sku = $1"
        : "SELECT id FROM inventory_items WHERE source = 'oj' AND name = $1 AND format = $2",
      product.sku ? [product.sku] : [product.name, product.format],
    );
    if (existing.length) {
      await db.query(
        `UPDATE inventory_items SET name = $1, category = $2, format = $3, cost_cents = $4, active = true
         WHERE id = $5`,
        [product.name, product.category, product.format, product.priceCents, existing[0].id],
      );
      updated++;
    } else {
      await db.query(
        `INSERT INTO inventory_items (sku, name, source, category, format, unit, quantity, cost_cents)
         VALUES ($1, $2, 'oj', $3, $4, 'unité', 0, $5)`,
        [product.sku ?? null, product.name, product.category, product.format, product.priceCents],
      );
      inserted++;
    }
  }
  return { inserted, updated, total: OJ_CATALOG.length };
}

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
      "INSERT INTO users (username, email, name, password_hash, role) VALUES ('alex', $1, $2, $3, 'admin')",
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

  // Catalogue OJ Compagnie
  await importOjCatalog(db);

  // Clients test avec adresses réelles de la région
  for (const client of SEED_TEST_CLIENTS) {
    const { rows: existingClient } = await db.query(
      "SELECT id FROM clients WHERE email = $1",
      [client.email],
    );
    if (existingClient.length === 0) {
      const { rows: pkgRows } = await db.query<{ id: number }>(
        "SELECT id FROM packages WHERE slug = $1",
        [client.package_slug],
      );
      await db.query(
        `INSERT INTO clients (first_name, last_name, email, phone, address_line, city, province, postal_code, status, notes, package_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          client.first_name,
          client.last_name,
          client.email,
          client.phone,
          client.address_line,
          client.city,
          client.province,
          client.postal_code,
          client.status,
          client.notes,
          pkgRows[0]?.id ?? null,
        ],
      );
    }
  }
}
