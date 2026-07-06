// Routeur API — toutes les routes /api/*. Utilisé par la fonction Netlify
// (netlify/functions/api.ts), le serveur de développement local et les tests.

import { z } from "zod";
import { DbNotProvisionedError, getDb } from "./db.js";
import {
  authenticate,
  clearSessionCookie,
  createSessionCookie,
  getSessionUser,
  hashPassword,
  type SessionUser,
} from "./auth.js";
import { computeTotals, lineAmountCents } from "../shared/taxes.js";
import { generateDocumentPdf, type PdfDocumentData } from "./pdf.js";
import {
  SquareError,
  handleSquareWebhook,
  pushDocumentToSquare,
  syncDocumentFromSquare,
  verifySquareSignature,
} from "./square.js";
import { MapsError, geocodeAddress, optimizeRoute, type GeoPoint } from "./routesapi.js";
import { GeminiError, generateAdImage, generateAdText } from "./gemini.js";
import { applySquarePayment, listSquarePayments } from "./square.js";
import { coutForfait, prixDepuisMarge, type ProduitApplique } from "../shared/pricing.js";
import { M2_TO_FT2 } from "../shared/area.js";

type Params = Record<string, string>;
type Handler = (req: Request, params: Params, user: SessionUser) => Promise<Response>;

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function error(message: string, status: number): Response {
  return json({ erreur: message }, status);
}

async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ---------- Schémas de validation ----------

// Connexion par nom d'utilisateur; le champ `email` reste accepté pour
// rétrocompatibilité (les deux identifient le compte).
const loginSchema = z
  .object({
    identifiant: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1, "Mot de passe requis"),
  })
  .refine((d) => d.identifiant || d.email, { message: "Nom d'utilisateur requis" });

const usernameSchema = z
  .string()
  .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
  .max(30, "Nom d'utilisateur trop long (30 max)")
  .regex(/^[a-z0-9._-]+$/i, "Nom d'utilisateur : lettres, chiffres, . _ - seulement")
  .transform((v) => v.toLowerCase());

const userSchema = z.object({
  username: usernameSchema,
  email: z.string().email("Courriel invalide").or(z.literal("")).default(""),
  name: z.string().min(1, "Nom requis"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

const userUpdateSchema = z.object({
  username: usernameSchema.optional(),
  email: z.string().email("Courriel invalide").or(z.literal("")).optional(),
  name: z.string().min(1, "Nom requis").optional(),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").optional(),
});

const clientSchema = z.object({
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  email: z.string().email("Courriel invalide").or(z.literal("")).default(""),
  phone: z.string().default(""),
  addressLine: z.string().min(1, "Adresse requise"),
  city: z.string().min(1, "Ville requise"),
  province: z.string().default("QC"),
  postalCode: z.string().default(""),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  lotAreaM2: z.number().positive().nullable().optional(),
  packageId: z.number().int().nullable().optional(),
  status: z.enum(["prospect", "actif", "inactif"]).default("actif"),
  notes: z.string().default(""),
});

const documentLineSchema = z.object({
  description: z.string().min(1, "Description requise"),
  quantity: z.number().positive("Quantité invalide"),
  unitPriceCents: z.number().int(),
});

const documentSchema = z.object({
  kind: z.enum(["estimation", "contrat", "facture"]).default("estimation"),
  clientId: z.number().int(),
  packageId: z.number().int().nullable().optional(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxesEnabled: z.boolean().optional(),
  // Omis → acompte automatique (deposit_pct des paramètres, 50 % par défaut).
  depositCents: z.number().int().min(0).optional(),
  notes: z.string().default(""),
  status: z.string().optional(),
  lines: z.array(documentLineSchema).min(1, "Au moins une ligne est requise"),
});

const settingsSchema = z.object({
  companyName: z.string().min(1).optional(),
  companyAddress: z.string().optional(),
  companyEmail: z.string().optional(),
  companyPhone: z.string().optional(),
  companyWebsite: z.string().optional(),
  taxesEnabled: z.boolean().optional(),
  tpsRate: z.number().min(0).max(1).optional(),
  tvqRate: z.number().min(0).max(1).optional(),
  tpsNumber: z.string().optional(),
  tvqNumber: z.string().optional(),
  estimateValidityDays: z.number().int().min(1).optional(),
  depositPct: z.number().min(0).max(100).optional(),
});

// ---------- Aides ----------

interface ClientRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  lot_area_m2: number | null;
  package_id: number | null;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  package_name?: string | null;
}

function clientToJson(row: ClientRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    lotAreaM2: row.lot_area_m2,
    packageId: row.package_id,
    packageName: row.package_name ?? null,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSettings() {
  const db = await getDb();
  const { rows } = await db.query<{
    company_name: string;
    company_address: string;
    company_email: string;
    company_phone: string;
    company_website: string;
    taxes_enabled: boolean;
    tps_rate: string;
    tvq_rate: string;
    tps_number: string;
    tvq_number: string;
    estimate_validity_days: number;
    deposit_pct: string | number;
  }>("SELECT * FROM settings WHERE id = 1");
  const s = rows[0];
  return {
    companyName: s.company_name,
    companyAddress: s.company_address,
    companyEmail: s.company_email,
    companyPhone: s.company_phone,
    companyWebsite: s.company_website,
    taxesEnabled: s.taxes_enabled,
    tpsRate: Number(s.tps_rate),
    tvqRate: Number(s.tvq_rate),
    tpsNumber: s.tps_number,
    tvqNumber: s.tvq_number,
    estimateValidityDays: s.estimate_validity_days,
    depositPct: Number(s.deposit_pct),
  };
}

async function nextDocumentNumber(kind: "estimation" | "contrat" | "facture"): Promise<string> {
  const db = await getDb();
  const prefix = kind === "estimation" ? "EST" : kind === "contrat" ? "CON" : "FAC";
  const year = new Date().getFullYear();
  const { rows } = await db.query<{ number: string }>(
    "SELECT number FROM documents WHERE number LIKE $1 ORDER BY number DESC LIMIT 1",
    [`${prefix}-${year}-%`],
  );
  const last = rows[0]?.number;
  const next = last ? Number(last.split("-")[2]) + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}

interface DocumentRow {
  id: number;
  kind: "estimation" | "contrat" | "facture";
  number: string;
  client_id: number;
  status: string;
  issued_on: string;
  taxes_enabled: boolean;
  tps_rate: string;
  tvq_rate: string;
  subtotal_cents: number;
  tps_cents: number;
  tvq_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  notes: string;
  converted_from_id: number | null;
  square_invoice_id: string | null;
  square_payment_status: string | null;
  square_public_url: string | null;
  created_at: string;
  client_name?: string;
}

// Les pilotes retournent les colonnes DATE tantôt en chaîne ISO, tantôt en
// objet Date (PGlite) : on normalise en « AAAA-MM-JJ ».
function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function documentToJson(row: DocumentRow, lines?: unknown[]) {
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    clientId: row.client_id,
    clientName: row.client_name ?? undefined,
    status: row.status,
    issuedOn: toIsoDate(row.issued_on),
    taxesEnabled: row.taxes_enabled,
    tpsRate: Number(row.tps_rate),
    tvqRate: Number(row.tvq_rate),
    subtotalCents: row.subtotal_cents,
    tpsCents: row.tps_cents,
    tvqCents: row.tvq_cents,
    totalCents: row.total_cents,
    depositCents: row.deposit_cents,
    balanceCents: row.balance_cents,
    notes: row.notes,
    convertedFromId: row.converted_from_id,
    packageId: (row as unknown as { package_id: number | null }).package_id ?? null,
    squareInvoiceId: row.square_invoice_id ?? null,
    squarePaymentStatus: row.square_payment_status ?? null,
    squarePublicUrl: row.square_public_url ?? null,
    createdAt: row.created_at,
    ...(lines ? { lines } : {}),
  };
}

async function loadDocument(id: number): Promise<{ row: DocumentRow; lines: { id: number; position: number; description: string; quantity: string; unit_price_cents: number; amount_cents: number }[] } | null> {
  const db = await getDb();
  const { rows } = await db.query<DocumentRow>(
    `SELECT d.*, (c.first_name || ' ' || c.last_name) AS client_name
     FROM documents d JOIN clients c ON c.id = d.client_id WHERE d.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: lines } = await db.query<{ id: number; position: number; description: string; quantity: string; unit_price_cents: number; amount_cents: number }>(
    "SELECT * FROM document_lines WHERE document_id = $1 ORDER BY position",
    [id],
  );
  return { row: rows[0], lines };
}

// ---------- Routes ----------

const routes: { method: string; pattern: RegExp; auth: boolean; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler, options: { auth?: boolean } = {}) {
  const pattern = new RegExp(
    "^" + path.replace(/:[a-zA-Z]+/g, (m) => `(?<${m.slice(1)}>[^/]+)`) + "$",
  );
  routes.push({ method, pattern, auth: options.auth ?? true, handler });
}

// --- Authentification ---

route(
  "POST",
  "/api/auth/login",
  async (req) => {
    const parsed = loginSchema.safeParse(await body(req));
    if (!parsed.success) return error(parsed.error.issues[0].message, 400);
    const identifier = parsed.data.identifiant ?? parsed.data.email ?? "";
    const user = await authenticate(identifier, parsed.data.password);
    if (!user) return error("Nom d'utilisateur ou mot de passe invalide.", 401);
    return json({ utilisateur: user }, 200, { "set-cookie": await createSessionCookie(user) });
  },
  { auth: false },
);

route(
  "POST",
  "/api/auth/logout",
  async () => json({ ok: true }, 200, { "set-cookie": clearSessionCookie() }),
  { auth: false },
);

route("GET", "/api/auth/me", async (_req, _params, user) => json({ utilisateur: user }));

// --- Diagnostic (aucune donnée sensible) ---

route(
  "GET",
  "/api/health",
  async () => {
    const dbUrlSource = process.env.DATABASE_URL
      ? "DATABASE_URL"
      : process.env.NETLIFY_DATABASE_URL
        ? "NETLIFY_DATABASE_URL"
        : process.env.NETLIFY_DB_URL
          ? "NETLIFY_DB_URL"
          : "aucune (PGlite locale)";
    const variables = {
      GOOGLE_MAPS_API_KEY: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      SQUARE_ACCESS_TOKEN: Boolean(process.env.SQUARE_ACCESS_TOKEN),
      SQUARE_WEBHOOK_SIGNATURE_KEY: Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    };
    try {
      const db = await getDb();
      const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM users");
      return json({ ok: true, base: dbUrlSource, variables, utilisateurs: Number(rows[0].n) });
    } catch (err) {
      return json(
        {
          ok: false,
          base: dbUrlSource,
          variables,
          erreur: err instanceof Error ? `${err.constructor.name}: ${err.message.slice(0, 300)}` : String(err),
        },
        500,
      );
    }
  },
  { auth: false },
);

// --- Configuration cliente (clé Google Maps servie aux utilisateurs connectés) ---

route("GET", "/api/config", async () =>
  json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" }),
);

// --- Utilisateurs ---

route("GET", "/api/users", async () => {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT id, username, email, name, role, created_at FROM users ORDER BY id",
  );
  return json({ utilisateurs: rows });
});

async function usernameTaken(username: string, excludeId?: number): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE lower(username) = lower($1)",
    [username],
  );
  return rows.some((r) => r.id !== excludeId);
}

route("POST", "/api/users", async (req) => {
  const parsed = userSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  if (await usernameTaken(d.username)) {
    return error("Ce nom d'utilisateur est déjà pris.", 409);
  }
  if (d.email) {
    const { rows: existing } = await db.query(
      "SELECT id FROM users WHERE email != '' AND lower(email) = lower($1)",
      [d.email],
    );
    if (existing.length) return error("Un utilisateur avec ce courriel existe déjà.", 409);
  }
  const { rows } = await db.query(
    `INSERT INTO users (username, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'admin')
     RETURNING id, username, email, name, role, created_at`,
    [d.username, d.email, d.name, hashPassword(d.password)],
  );
  return json({ utilisateur: rows[0] }, 201);
});

// Mise à jour d'un utilisateur (nom, nom d'utilisateur, courriel,
// et réinitialisation du mot de passe si fourni).
route("PUT", "/api/users/:id", async (req, params) => {
  const parsed = userUpdateSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const id = Number(params.id);
  const db = await getDb();
  const { rows: existing } = await db.query("SELECT id FROM users WHERE id = $1", [id]);
  if (!existing.length) return error("Utilisateur introuvable.", 404);
  if (d.username && (await usernameTaken(d.username, id))) {
    return error("Ce nom d'utilisateur est déjà pris.", 409);
  }
  const map: [string, unknown][] = [
    ["username", d.username],
    ["email", d.email],
    ["name", d.name],
    ["password_hash", d.password !== undefined ? hashPassword(d.password) : undefined],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [col, val] of map) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (!sets.length) return error("Aucun champ à modifier.", 400);
  values.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${values.length}
     RETURNING id, username, email, name, role, created_at`,
    values,
  );
  return json({ utilisateur: rows[0], motDePasseChange: d.password !== undefined });
});

route("DELETE", "/api/users/:id", async (_req, params, user) => {
  const id = Number(params.id);
  if (id === user.id) return error("Vous ne pouvez pas supprimer votre propre compte.", 400);
  const db = await getDb();
  const { rows: all } = await db.query<{ n: string }>("SELECT count(*) AS n FROM users");
  if (Number(all[0].n) <= 1) return error("Impossible de supprimer le dernier utilisateur.", 400);
  const { rows } = await db.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
  if (!rows.length) return error("Utilisateur introuvable.", 404);
  return json({ ok: true, supprime: id });
});

// --- Paramètres ---

route("GET", "/api/settings", async () => json({ parametres: await getSettings() }));

route("PUT", "/api/settings", async (req) => {
  const parsed = settingsSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const db = await getDb();
  const d = parsed.data;
  const sets: string[] = [];
  const params: unknown[] = [];
  const map: [string, unknown][] = [
    ["company_name", d.companyName],
    ["company_address", d.companyAddress],
    ["company_email", d.companyEmail],
    ["company_phone", d.companyPhone],
    ["company_website", d.companyWebsite],
    ["taxes_enabled", d.taxesEnabled],
    ["tps_rate", d.tpsRate],
    ["tvq_rate", d.tvqRate],
    ["tps_number", d.tpsNumber],
    ["tvq_number", d.tvqNumber],
    ["estimate_validity_days", d.estimateValidityDays],
    ["deposit_pct", d.depositPct],
  ];
  for (const [col, val] of map) {
    if (val !== undefined) {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length) {
    await db.query(`UPDATE settings SET ${sets.join(", ")}, updated_at = now() WHERE id = 1`, params);
  }
  return json({ parametres: await getSettings() });
});

// --- Forfaits ---

interface PackageRow {
  id: number; slug: string; name: string; visits: string; tagline: string;
  popular: boolean; position: number; price_cents: number | null;
  visit_count: number; visit_cost_cents: number; margin_pct: string | number;
}

route("GET", "/api/packages", async () => {
  const db = await getDb();
  const { rows: packages } = await db.query<PackageRow>(
    "SELECT * FROM packages WHERE active ORDER BY position",
  );
  const { rows: items } = await db.query<{ package_id: number; position: number; label: string }>(
    "SELECT package_id, position, label FROM package_items ORDER BY package_id, position",
  );
  return json({
    forfaits: packages.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      visits: p.visits,
      tagline: p.tagline,
      popular: p.popular,
      priceCents: p.price_cents,
      visitCount: p.visit_count,
      visitCostCents: p.visit_cost_cents,
      marginPct: Number(p.margin_pct),
      items: items.filter((i) => i.package_id === p.id).map((i) => i.label),
    })),
  });
});

// --- Calculateur de prix des forfaits ---

const packagePricingSchema = z.object({
  marginPct: z.number().min(0).max(95).optional(),
  visitCostCents: z.number().int().min(0).optional(),
  visitCount: z.number().int().min(0).max(30).optional(),
});

const packageProductSchema = z.object({
  itemId: z.number().int().nullable().optional(),
  label: z.string().min(1, "Nom du produit requis"),
  dosePer100m2: z.number().min(0),
  doseUnit: z.string().max(20).default("kg"),
  formatQuantity: z.number().positive("Contenance du format requise"),
  applications: z.number().int().min(1).max(30).default(1),
  unitCostCents: z.number().int().min(0).nullable().optional(),
});

// Paramètres de prix d'un forfait : marge, coût et nombre de visites.
route("PUT", "/api/packages/:id", async (req, params) => {
  const parsed = packagePricingSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  const map: [string, unknown][] = [
    ["margin_pct", d.marginPct],
    ["visit_cost_cents", d.visitCostCents],
    ["visit_count", d.visitCount],
  ];
  for (const [col, val] of map) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (!sets.length) return error("Aucun champ à modifier.", 400);
  values.push(Number(params.id));
  const { rows } = await db.query<PackageRow>(
    `UPDATE packages SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return error("Forfait introuvable.", 404);
  const p = rows[0];
  return json({
    forfait: {
      id: p.id, slug: p.slug, name: p.name,
      visitCount: p.visit_count, visitCostCents: p.visit_cost_cents, marginPct: Number(p.margin_pct),
    },
  });
});

interface PackageProductRow {
  id: number;
  package_id: number;
  item_id: number | null;
  label: string;
  dose_per_100m2: string | number;
  dose_unit: string;
  format_quantity: string | number;
  applications: number;
  unit_cost_cents: number | null;
  position: number;
  item_name: string | null;
  item_format: string | null;
  item_cost_cents: number | null;
}

const PACKAGE_PRODUCT_SELECT = `SELECT pp.*, i.name AS item_name, i.format AS item_format,
    i.cost_cents AS item_cost_cents
  FROM package_products pp LEFT JOIN inventory_items i ON i.id = pp.item_id`;

function packageProductToJson(row: PackageProductRow) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemFormat: row.item_format,
    label: row.label,
    dosePer100m2: Number(row.dose_per_100m2),
    doseUnit: row.dose_unit,
    formatQuantity: Number(row.format_quantity),
    applications: row.applications,
    unitCostCents: row.unit_cost_cents,
    // Coût effectif d'un format : produit d'inventaire lié, sinon coût manuel.
    formatCostCents: row.item_cost_cents ?? row.unit_cost_cents ?? 0,
  };
}

route("GET", "/api/packages/:id/products", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query<PackageProductRow>(
    `${PACKAGE_PRODUCT_SELECT} WHERE pp.package_id = $1 ORDER BY pp.position, pp.id`,
    [Number(params.id)],
  );
  return json({ produits: rows.map(packageProductToJson) });
});

// Remplace la liste complète des produits appliqués d'un forfait.
route("PUT", "/api/packages/:id/products", async (req, params) => {
  const parsed = z
    .object({ produits: z.array(packageProductSchema) })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const packageId = Number(params.id);
  const db = await getDb();
  const { rows: pkg } = await db.query("SELECT id FROM packages WHERE id = $1", [packageId]);
  if (!pkg.length) return error("Forfait introuvable.", 404);
  await db.query("DELETE FROM package_products WHERE package_id = $1", [packageId]);
  for (let i = 0; i < parsed.data.produits.length; i++) {
    const p = parsed.data.produits[i];
    await db.query(
      `INSERT INTO package_products (package_id, item_id, label, dose_per_100m2, dose_unit,
         format_quantity, applications, unit_cost_cents, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [packageId, p.itemId ?? null, p.label, p.dosePer100m2, p.doseUnit, p.formatQuantity,
       p.applications, p.unitCostCents ?? null, i],
    );
  }
  const { rows } = await db.query<PackageProductRow>(
    `${PACKAGE_PRODUCT_SELECT} WHERE pp.package_id = $1 ORDER BY pp.position, pp.id`,
    [packageId],
  );
  return json({ produits: rows.map(packageProductToJson) });
});

// Cotation rapide : coût + prix suggéré des 3 forfaits pour une superficie.
// Superficie fournie en m² (areaM2), en pi² (areaFt2) ou tirée d'un client.
route("GET", "/api/pricing/quote", async (req) => {
  const url = new URL(req.url);
  const db = await getDb();
  let areaM2 = Number(url.searchParams.get("areaM2")) || 0;
  if (!areaM2) {
    const ft2 = Number(url.searchParams.get("areaFt2")) || 0;
    if (ft2 > 0) areaM2 = ft2 / M2_TO_FT2;
  }
  const clientId = Number(url.searchParams.get("clientId")) || 0;
  if (!areaM2 && clientId) {
    const { rows } = await db.query<{ lot_area_m2: number | null }>(
      "SELECT lot_area_m2 FROM clients WHERE id = $1",
      [clientId],
    );
    if (!rows.length) return error("Client introuvable.", 404);
    areaM2 = Number(rows[0].lot_area_m2) || 0;
  }
  if (!(areaM2 > 0)) {
    return error("Superficie requise (areaM2, areaFt2 ou clientId avec superficie mesurée).", 400);
  }

  const { rows: packages } = await db.query<PackageRow>(
    "SELECT * FROM packages WHERE active ORDER BY position",
  );
  const { rows: productRows } = await db.query<PackageProductRow>(
    `${PACKAGE_PRODUCT_SELECT} ORDER BY pp.package_id, pp.position, pp.id`,
  );

  const forfaits = packages.map((p) => {
    const produits: ProduitApplique[] = productRows
      .filter((r) => r.package_id === p.id)
      .map((r) => ({
        label: r.label,
        dosePer100m2: Number(r.dose_per_100m2),
        doseUnit: r.dose_unit,
        formatQuantity: Number(r.format_quantity),
        formatCostCents: r.item_cost_cents ?? r.unit_cost_cents ?? 0,
        applications: r.applications,
      }));
    const marginPct = Number(p.margin_pct);
    const couts = coutForfait(produits, areaM2, p.visit_count, p.visit_cost_cents);
    const prixCents = prixDepuisMarge(couts.totalCents, marginPct);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      visits: p.visits,
      popular: p.popular,
      visitCount: p.visit_count,
      visitCostCents: p.visit_cost_cents,
      marginPct,
      couts: {
        produitsCents: couts.produitsCents,
        visitesCents: couts.visitesCents,
        totalCents: couts.totalCents,
      },
      prixCents,
      prixParVisiteCents: p.visit_count > 0 ? Math.round(prixCents / p.visit_count) : prixCents,
      produits: couts.details.map((d) => ({
        label: d.label,
        applications: d.applications,
        dosePer100m2: d.dosePer100m2,
        doseUnit: d.doseUnit,
        quantiteTotale: d.quantiteTotale,
        formats: d.formats,
        coutCents: d.coutCents,
      })),
    };
  });

  return json({
    superficie: { m2: areaM2, ft2: areaM2 * M2_TO_FT2 },
    forfaits,
  });
});

// --- Services (catalogue du site) ---

route("GET", "/api/services", async () => {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT id, name, description, position FROM services WHERE active ORDER BY position",
  );
  return json({ services: rows });
});

// --- Clients ---

const CLIENT_SELECT = `SELECT c.*, p.name AS package_name
  FROM clients c LEFT JOIN packages p ON p.id = c.package_id`;

route("GET", "/api/clients", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const search = url.searchParams.get("q");
  if (search) {
    const { rows } = await db.query<ClientRow>(
      `${CLIENT_SELECT} WHERE lower(c.first_name || ' ' || c.last_name) LIKE lower($1)
         OR lower(c.city) LIKE lower($1) OR lower(c.email) LIKE lower($1)
       ORDER BY c.last_name, c.first_name`,
      [`%${search}%`],
    );
    return json({ clients: rows.map(clientToJson) });
  }
  const { rows } = await db.query<ClientRow>(`${CLIENT_SELECT} ORDER BY c.last_name, c.first_name`);
  return json({ clients: rows.map(clientToJson) });
});

route("GET", "/api/clients/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query<ClientRow>(`${CLIENT_SELECT} WHERE c.id = $1`, [Number(params.id)]);
  if (!rows[0]) return error("Client introuvable.", 404);
  return json({ client: clientToJson(rows[0]) });
});

route("POST", "/api/clients", async (req) => {
  const parsed = clientSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO clients (first_name, last_name, email, phone, address_line, city, province,
       postal_code, latitude, longitude, lot_area_m2, package_id, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      d.firstName, d.lastName, d.email, d.phone, d.addressLine, d.city, d.province,
      d.postalCode, d.latitude ?? null, d.longitude ?? null, d.lotAreaM2 ?? null,
      d.packageId ?? null, d.status, d.notes,
    ],
  );
  const { rows: created } = await db.query<ClientRow>(`${CLIENT_SELECT} WHERE c.id = $1`, [rows[0].id]);
  return json({ client: clientToJson(created[0]) }, 201);
});

route("PUT", "/api/clients/:id", async (req, params) => {
  const parsed = clientSchema.partial().safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const id = Number(params.id);
  const db = await getDb();
  const { rows: existing } = await db.query("SELECT id FROM clients WHERE id = $1", [id]);
  if (!existing.length) return error("Client introuvable.", 404);
  const d = parsed.data;
  const map: [string, unknown][] = [
    ["first_name", d.firstName], ["last_name", d.lastName], ["email", d.email],
    ["phone", d.phone], ["address_line", d.addressLine], ["city", d.city],
    ["province", d.province], ["postal_code", d.postalCode],
    ["latitude", d.latitude], ["longitude", d.longitude],
    ["lot_area_m2", d.lotAreaM2], ["package_id", d.packageId],
    ["status", d.status], ["notes", d.notes],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [col, val] of map) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (sets.length) {
    values.push(id);
    await db.query(
      `UPDATE clients SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`,
      values,
    );
  }
  const { rows } = await db.query<ClientRow>(`${CLIENT_SELECT} WHERE c.id = $1`, [id]);
  return json({ client: clientToJson(rows[0]) });
});

route("DELETE", "/api/clients/:id", async (_req, params) => {
  const db = await getDb();
  const id = Number(params.id);
  const { rows: docs } = await db.query("SELECT id FROM documents WHERE client_id = $1 LIMIT 1", [id]);
  if (docs.length) {
    return error("Ce client a des estimations ou factures : archivez-le plutôt (statut « inactif »).", 409);
  }
  const { rows } = await db.query("DELETE FROM clients WHERE id = $1 RETURNING id", [id]);
  if (!rows.length) return error("Client introuvable.", 404);
  return json({ ok: true, supprime: id });
});

// --- Estimations / Factures ---

route("GET", "/api/documents", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const kind = url.searchParams.get("type");
  const where = kind ? "WHERE d.kind = $1" : "";
  const { rows } = await db.query<DocumentRow>(
    `SELECT d.*, (c.first_name || ' ' || c.last_name) AS client_name
     FROM documents d JOIN clients c ON c.id = d.client_id ${where}
     ORDER BY d.id DESC`,
    kind ? [kind] : [],
  );
  return json({ documents: rows.map((r) => documentToJson(r)) });
});

route("GET", "/api/documents/:id", async (_req, params) => {
  const loaded = await loadDocument(Number(params.id));
  if (!loaded) return error("Document introuvable.", 404);
  return json({
    document: documentToJson(
      loaded.row,
      loaded.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceCents: l.unit_price_cents,
        amountCents: l.amount_cents,
      })),
    ),
  });
});

async function insertDocument(
  data: z.infer<typeof documentSchema>,
): Promise<Response> {
  const db = await getDb();
  const { rows: clientRows } = await db.query("SELECT id FROM clients WHERE id = $1", [data.clientId]);
  if (!clientRows.length) return error("Client introuvable.", 404);

  const settings = await getSettings();
  const taxesEnabled = data.taxesEnabled ?? settings.taxesEnabled;
  // Acompte : montant fourni tel quel, sinon automatique (% des paramètres,
  // arrondi au dollar), toujours ajustable manuellement dans l'interface.
  const base = computeTotals(data.lines, {
    taxesEnabled,
    tpsRate: settings.tpsRate,
    tvqRate: settings.tvqRate,
  });
  const autoDeposit = Math.round((base.totalCents * settings.depositPct) / 100 / 100) * 100;
  const totals = computeTotals(data.lines, {
    taxesEnabled,
    tpsRate: settings.tpsRate,
    tvqRate: settings.tvqRate,
    depositCents: data.depositCents ?? autoDeposit,
  });
  const number = await nextDocumentNumber(data.kind);
  const status =
    data.status ??
    (data.kind === "estimation" ? "brouillon" : data.kind === "contrat" ? "brouillon" : "à payer");
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO documents (kind, number, client_id, package_id, status, issued_on, taxes_enabled,
       tps_rate, tvq_rate, subtotal_cents, tps_cents, tvq_cents, total_cents,
       deposit_cents, balance_cents, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [
      data.kind, number, data.clientId, data.packageId ?? null, status,
      data.issuedOn ?? new Date().toISOString().slice(0, 10),
      taxesEnabled, settings.tpsRate, settings.tvqRate,
      totals.subtotalCents, totals.tpsCents, totals.tvqCents, totals.totalCents,
      totals.depositCents, totals.balanceCents, data.notes,
    ],
  );
  const documentId = rows[0].id;
  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i];
    await db.query(
      `INSERT INTO document_lines (document_id, position, description, quantity, unit_price_cents, amount_cents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [documentId, i, line.description, line.quantity, line.unitPriceCents, lineAmountCents(line)],
    );
  }
  const loaded = await loadDocument(documentId);
  return json(
    {
      document: documentToJson(
        loaded!.row,
        loaded!.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceCents: l.unit_price_cents,
          amountCents: l.amount_cents,
        })),
      ),
    },
    201,
  );
}

route("POST", "/api/documents", async (req) => {
  const parsed = documentSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  return insertDocument(parsed.data);
});

route("DELETE", "/api/documents/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query("DELETE FROM documents WHERE id = $1 RETURNING id", [Number(params.id)]);
  if (!rows.length) return error("Document introuvable.", 404);
  return json({ ok: true, supprime: Number(params.id) });
});

// Duplication d'un document vers un autre type (copie des lignes/totaux).
async function duplicateDocument(
  sourceId: number,
  toKind: "contrat" | "facture",
  sourceStatusAfter: string,
): Promise<number | null> {
  const db = await getDb();
  const loaded = await loadDocument(sourceId);
  if (!loaded) return null;
  const number = await nextDocumentNumber(toKind);
  const initialStatus = toKind === "contrat" ? "brouillon" : "à payer";
  const { rows: clientPkg } = await db.query<{ package_id: number | null }>(
    "SELECT package_id FROM clients WHERE id = $1",
    [loaded.row.client_id],
  );
  const packageId =
    (loaded.row as unknown as { package_id: number | null }).package_id ??
    clientPkg[0]?.package_id ??
    null;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO documents (kind, number, client_id, package_id, status, issued_on, taxes_enabled,
       tps_rate, tvq_rate, subtotal_cents, tps_cents, tvq_cents, total_cents,
       deposit_cents, balance_cents, notes, converted_from_id)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      toKind, number, loaded.row.client_id, packageId, initialStatus,
      loaded.row.taxes_enabled, loaded.row.tps_rate, loaded.row.tvq_rate,
      loaded.row.subtotal_cents, loaded.row.tps_cents, loaded.row.tvq_cents,
      loaded.row.total_cents, loaded.row.deposit_cents, loaded.row.balance_cents,
      loaded.row.notes, loaded.row.id,
    ],
  );
  const newId = rows[0].id;
  for (const line of loaded.lines) {
    await db.query(
      `INSERT INTO document_lines (document_id, position, description, quantity, unit_price_cents, amount_cents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [newId, line.position, line.description, Number(line.quantity), line.unit_price_cents, line.amount_cents],
    );
  }
  await db.query("UPDATE documents SET status = $1, updated_at = now() WHERE id = $2", [
    sourceStatusAfter,
    sourceId,
  ]);
  return newId;
}

async function documentResponse(id: number, status = 200): Promise<Response> {
  const loaded = await loadDocument(id);
  if (!loaded) return error("Document introuvable.", 404);
  return json(
    {
      document: documentToJson(
        loaded.row,
        loaded.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceCents: l.unit_price_cents,
          amountCents: l.amount_cents,
        })),
      ),
    },
    status,
  );
}

// Saison d'entretien : les visites d'un contrat sont réparties du 1er mai au
// 15 octobre (ou à partir de la semaine prochaine si la saison est entamée).
export async function generateContractVisits(contractId: number): Promise<number> {
  const db = await getDb();
  const { rows: docs } = await db.query<{
    id: number; kind: string; client_id: number; package_id: number | null; number: string;
  }>("SELECT id, kind, client_id, package_id, number FROM documents WHERE id = $1", [contractId]);
  const doc = docs[0];
  if (!doc || doc.kind !== "contrat") return 0;
  const { rows: pkgRows } = await db.query<{ name: string; visit_count: number }>(
    `SELECT p.name, p.visit_count FROM packages p WHERE p.id = COALESCE(
       $1, (SELECT package_id FROM clients WHERE id = $2))`,
    [doc.package_id, doc.client_id],
  );
  const visitCount = pkgRows[0]?.visit_count || 4;
  const pkgName = pkgRows[0]?.name ?? "";

  const year = new Date().getFullYear();
  const seasonStart = new Date(Date.UTC(year, 4, 1, 13, 0, 0)); // 1er mai, 9 h (HAE)
  const seasonEnd = new Date(Date.UTC(year, 9, 15, 13, 0, 0)); // 15 octobre
  let start = seasonStart;
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  if (nextWeek > start) start = nextWeek;
  if (start >= seasonEnd) start = seasonStart; // saison passée : planifie l'an type

  const stepMs = visitCount > 1 ? (seasonEnd.getTime() - start.getTime()) / (visitCount - 1) : 0;
  for (let i = 0; i < visitCount; i++) {
    const when = new Date(start.getTime() + stepMs * i);
    when.setUTCHours(13, 0, 0, 0);
    await db.query(
      `INSERT INTO visits (client_id, scheduled_at, duration_minutes, services, status, notes, document_id)
       VALUES ($1,$2,$3,$4,'planifiee',$5,$6)`,
      [
        doc.client_id,
        when.toISOString(),
        45,
        pkgName ? `Forfait ${pkgName} — visite ${i + 1}/${visitCount}` : `Visite ${i + 1}/${visitCount}`,
        `Générée automatiquement par le contrat ${doc.number}. Ajustez la date au besoin.`,
        contractId,
      ],
    );
  }
  return visitCount;
}

// Conversion estimation → facture (directe, sans contrat)
route("POST", "/api/documents/:id/convert", async (_req, params) => {
  const loaded = await loadDocument(Number(params.id));
  if (!loaded) return error("Document introuvable.", 404);
  if (loaded.row.kind === "facture") {
    return error("Ce document est déjà une facture.", 400);
  }
  const newId = await duplicateDocument(Number(params.id), "facture", "acceptée");
  if (newId === null) return error("Document introuvable.", 404);
  return documentResponse(newId, 201);
});

// Estimation acceptée → CONTRAT (+ visites de la saison générées).
route("POST", "/api/documents/:id/contract", async (_req, params) => {
  const loaded = await loadDocument(Number(params.id));
  if (!loaded) return error("Document introuvable.", 404);
  if (loaded.row.kind !== "estimation") {
    return error("Seule une estimation peut devenir un contrat.", 400);
  }
  const newId = await duplicateDocument(Number(params.id), "contrat", "acceptée");
  if (newId === null) return error("Document introuvable.", 404);
  const visites = await generateContractVisits(newId);
  const res = await documentResponse(newId, 201);
  const payload = await res.json();
  return json({ ...payload, visitesGenerees: visites }, 201);
});

// PDF
route("GET", "/api/documents/:id/pdf", async (_req, params) => {
  const db = await getDb();
  const loaded = await loadDocument(Number(params.id));
  if (!loaded) return error("Document introuvable.", 404);
  const { rows: clientRows } = await db.query<ClientRow>(
    "SELECT * FROM clients WHERE id = $1",
    [loaded.row.client_id],
  );
  const client = clientRows[0];
  const settings = await getSettings();
  const data: PdfDocumentData = {
    kind: loaded.row.kind,
    number: loaded.row.number,
    issuedOn: toIsoDate(loaded.row.issued_on),
    status: loaded.row.status,
    taxesEnabled: loaded.row.taxes_enabled,
    tpsRate: Number(loaded.row.tps_rate),
    tvqRate: Number(loaded.row.tvq_rate),
    subtotalCents: loaded.row.subtotal_cents,
    tpsCents: loaded.row.tps_cents,
    tvqCents: loaded.row.tvq_cents,
    totalCents: loaded.row.total_cents,
    depositCents: loaded.row.deposit_cents,
    balanceCents: loaded.row.balance_cents,
    notes: loaded.row.notes,
    client: {
      name: `${client.first_name} ${client.last_name}`.trim(),
      addressLine: client.address_line,
      city: client.city,
      province: client.province,
      postalCode: client.postal_code,
      email: client.email,
      phone: client.phone,
    },
    lines: loaded.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceCents: l.unit_price_cents,
      amountCents: l.amount_cents,
    })),
    company: {
      name: settings.companyName,
      address: settings.companyAddress,
      email: settings.companyEmail,
      phone: settings.companyPhone,
      website: settings.companyWebsite,
      tpsNumber: settings.tpsNumber,
      tvqNumber: settings.tvqNumber,
      estimateValidityDays: settings.estimateValidityDays,
    },
  };
  const pdf = await generateDocumentPdf(data);
  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${loaded.row.number}.pdf"`,
    },
  });
});

// --- Tableau de bord ---

route("GET", "/api/dashboard", async () => {
  const db = await getDb();
  const count = async (sql: string) =>
    Number((await db.query<{ n: string }>(sql)).rows[0].n);
  const clientsActifs = await count("SELECT count(*) AS n FROM clients WHERE status = 'actif'");
  const prospects = await count("SELECT count(*) AS n FROM clients WHERE status = 'prospect'");
  const estimationsEnCours = await count(
    "SELECT count(*) AS n FROM documents WHERE kind = 'estimation' AND status IN ('brouillon', 'envoyée')",
  );
  const facturesImpayees = await count(
    "SELECT count(*) AS n FROM documents WHERE kind = 'facture' AND status != 'payée'",
  );
  const contratsActifs = await count(
    "SELECT count(*) AS n FROM documents WHERE kind = 'contrat' AND status IN ('envoyé', 'signé')",
  );
  const { rows: recents } = await db.query<DocumentRow>(
    `SELECT d.*, (c.first_name || ' ' || c.last_name) AS client_name
     FROM documents d JOIN clients c ON c.id = d.client_id ORDER BY d.id DESC LIMIT 6`,
  );
  const { rows: repartition } = await db.query(
    `SELECT p.name, count(c.id)::int AS clients FROM packages p
     LEFT JOIN clients c ON c.package_id = p.id GROUP BY p.id, p.name, p.position
     ORDER BY p.position`,
  );
  const { rows: leadRows } = await db.query<LeadRow>(
    "SELECT * FROM leads WHERE status = 'nouveau' ORDER BY id DESC LIMIT 5",
  );
  const { rows: unread } = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM notifications WHERE NOT read",
  );
  const { rows: todaysVisits } = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM visits WHERE scheduled_at::date = CURRENT_DATE AND status != 'annulee'",
  );
  // Marge du mois courant : revenus (factures payées + revenus manuels) − dépenses.
  const sumMonth = async (sql: string) =>
    Number((await db.query<{ s: string | null }>(sql)).rows[0].s ?? 0);
  const revenusMois =
    (await sumMonth(
      `SELECT COALESCE(SUM(total_cents),0) AS s FROM documents
       WHERE kind = 'facture' AND status = 'payée'
         AND date_trunc('month', issued_on) = date_trunc('month', CURRENT_DATE)`,
    )) +
    (await sumMonth(
      `SELECT COALESCE(SUM(amount_cents),0) AS s FROM revenues
       WHERE date_trunc('month', received_on) = date_trunc('month', CURRENT_DATE)`,
    ));
  const depensesMois = await sumMonth(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM expenses
     WHERE date_trunc('month', spent_on) = date_trunc('month', CURRENT_DATE)`,
  );
  return json({
    margeMoisCents: revenusMois - depensesMois,
    revenusMoisCents: revenusMois,
    depensesMoisCents: depensesMois,
    clientsActifs,
    prospects,
    estimationsEnCours,
    contratsActifs,
    facturesImpayees,
    visitesAujourdhui: Number(todaysVisits[0].n),
    notificationsNonLues: Number(unread[0].n),
    soumissionsNouvelles: leadRows.map(leadToJson),
    documentsRecents: recents.map((r) => documentToJson(r)),
    repartitionForfaits: repartition,
  });
});

// --- Passe 2 : soumissions web (endpoint public appelé par stamourduvert.com) ---

const soumissionSchema = z.object({
  fullName: z.string().min(2, "Nom complet requis").max(200),
  email: z.string().email("Courriel invalide").or(z.literal("")).default(""),
  phone: z.string().max(40).default(""),
  address: z.string().max(300).default(""),
  sector: z.string().max(100).default(""),
  message: z.string().max(4000).default(""),
  // Champ pot de miel : rempli uniquement par les robots.
  website: z.string().max(0, "Soumission rejetée.").optional(),
});

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

route(
  "POST",
  "/api/public/soumission",
  async (req) => {
    const parsed = soumissionSchema.safeParse(await body(req));
    if (!parsed.success) return error(parsed.error.issues[0].message, 400);
    const d = parsed.data;
    const db = await getDb();
    const { rows } = await db.query<{ id: number; created_at: string }>(
      `INSERT INTO leads (full_name, email, phone, address, sector, message)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [d.fullName, d.email, d.phone, d.address, d.sector, d.message],
    );
    await db.query(
      `INSERT INTO notifications (kind, title, body, link) VALUES ('soumission', $1, $2, $3)`,
      [
        `Nouvelle soumission web — ${d.fullName}`,
        [d.address, d.sector, d.message].filter(Boolean).join(" · ").slice(0, 500),
        "/soumissions",
      ],
    );
    return json({ ok: true, prospect: rows[0].id }, 201, CORS_HEADERS);
  },
  { auth: false },
);

// --- Prospects (soumissions reçues) ---

interface LeadRow {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  sector: string;
  message: string;
  status: string;
  client_id: number | null;
  created_at: string;
}

function leadToJson(row: LeadRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    sector: row.sector,
    message: row.message,
    status: row.status,
    clientId: row.client_id,
    createdAt: row.created_at,
  };
}

route("GET", "/api/leads", async () => {
  const db = await getDb();
  const { rows } = await db.query<LeadRow>("SELECT * FROM leads ORDER BY id DESC");
  return json({ prospects: rows.map(leadToJson) });
});

route("PUT", "/api/leads/:id", async (req, params) => {
  const parsed = z
    .object({ status: z.enum(["nouveau", "contacté", "converti", "fermé"]) })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const db = await getDb();
  const { rows } = await db.query<LeadRow>(
    "UPDATE leads SET status = $1 WHERE id = $2 RETURNING *",
    [parsed.data.status, Number(params.id)],
  );
  if (!rows[0]) return error("Prospect introuvable.", 404);
  return json({ prospect: leadToJson(rows[0]) });
});

// Conversion d'un prospect en client
route("POST", "/api/leads/:id/convert", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query<LeadRow>("SELECT * FROM leads WHERE id = $1", [Number(params.id)]);
  const lead = rows[0];
  if (!lead) return error("Prospect introuvable.", 404);
  if (lead.client_id) return error("Ce prospect a déjà été converti.", 409);
  const nameParts = lead.full_name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || firstName;
  const { rows: created } = await db.query<{ id: number }>(
    `INSERT INTO clients (first_name, last_name, email, phone, address_line, city, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,'prospect',$7) RETURNING id`,
    [
      firstName,
      lastName,
      lead.email,
      lead.phone,
      lead.address,
      lead.sector,
      `Issu de la soumission web du ${String(lead.created_at).slice(0, 10)}. ${lead.message}`.trim(),
    ],
  );
  await db.query("UPDATE leads SET status = 'converti', client_id = $1 WHERE id = $2", [
    created[0].id,
    lead.id,
  ]);
  const { rows: clientRows } = await db.query<ClientRow>(`${CLIENT_SELECT} WHERE c.id = $1`, [created[0].id]);
  return json({ client: clientToJson(clientRows[0]) }, 201);
});

// --- Notifications ---

route("GET", "/api/notifications", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const where = url.searchParams.get("nonLues") ? "WHERE NOT read" : "";
  const { rows } = await db.query(
    `SELECT id, kind, title, body, link, read, created_at FROM notifications ${where} ORDER BY id DESC LIMIT 50`,
  );
  const { rows: unread } = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM notifications WHERE NOT read",
  );
  return json({ notifications: rows, nonLues: Number(unread[0].n) });
});

route("POST", "/api/notifications/lues", async (req) => {
  const parsed = z.object({ ids: z.array(z.number().int()).optional() }).safeParse(await body(req));
  const db = await getDb();
  if (parsed.success && parsed.data.ids?.length) {
    await db.query("UPDATE notifications SET read = true WHERE id = ANY($1)", [parsed.data.ids]);
  } else {
    await db.query("UPDATE notifications SET read = true WHERE NOT read");
  }
  return json({ ok: true });
});

// --- Visites (calendrier) ---

const visitSchema = z.object({
  clientId: z.number().int(),
  scheduledAt: z.string().min(10, "Date/heure requise"),
  durationMinutes: z.number().int().min(5).max(600).default(45),
  services: z.string().default(""),
  status: z.enum(["planifiee", "faite", "annulee"]).default("planifiee"),
  notes: z.string().default(""),
  documentId: z.number().int().nullable().optional(),
});

interface VisitRow {
  id: number;
  client_id: number;
  scheduled_at: string;
  duration_minutes: number;
  services: string;
  status: string;
  route_position: number | null;
  notes: string;
  client_name?: string;
  address_line?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  document_id?: number | null;
  contract_number?: string | null;
}

function visitToJson(row: VisitRow) {
  const raw = row.scheduled_at as unknown;
  const iso = raw instanceof Date ? raw.toISOString() : String(raw);
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    addressLine: row.address_line,
    city: row.city,
    scheduledAt: iso,
    durationMinutes: row.duration_minutes,
    services: row.services,
    status: row.status,
    routePosition: row.route_position,
    notes: row.notes,
    documentId: row.document_id ?? null,
    contractNumber: row.contract_number ?? null,
  };
}

const VISIT_SELECT = `SELECT v.*, (c.first_name || ' ' || c.last_name) AS client_name,
    c.address_line, c.city, c.latitude, c.longitude, d.number AS contract_number
  FROM visits v JOIN clients c ON c.id = v.client_id
  LEFT JOIN documents d ON d.id = v.document_id`;

route("GET", "/api/visits", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const documentId = Number(url.searchParams.get("documentId")) || 0;
  const { rows } = date
    ? await db.query<VisitRow>(
        `${VISIT_SELECT} WHERE v.scheduled_at::date = $1::date ORDER BY v.scheduled_at`,
        [date],
      )
    : documentId
      ? await db.query<VisitRow>(
          `${VISIT_SELECT} WHERE v.document_id = $1 ORDER BY v.scheduled_at`,
          [documentId],
        )
      : await db.query<VisitRow>(`${VISIT_SELECT} ORDER BY v.scheduled_at DESC LIMIT 200`);
  return json({ visites: rows.map(visitToJson) });
});

route("POST", "/api/visits", async (req) => {
  const parsed = visitSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const { rows: clientRows } = await db.query("SELECT id FROM clients WHERE id = $1", [d.clientId]);
  if (!clientRows.length) return error("Client introuvable.", 404);
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO visits (client_id, scheduled_at, duration_minutes, services, status, notes, document_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [d.clientId, d.scheduledAt, d.durationMinutes, d.services, d.status, d.notes, d.documentId ?? null],
  );
  const { rows: created } = await db.query<VisitRow>(`${VISIT_SELECT} WHERE v.id = $1`, [rows[0].id]);
  return json({ visite: visitToJson(created[0]) }, 201);
});

route("PUT", "/api/visits/:id", async (req, params) => {
  const parsed = visitSchema.partial().safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const map: [string, unknown][] = [
    ["client_id", d.clientId],
    ["scheduled_at", d.scheduledAt],
    ["duration_minutes", d.durationMinutes],
    ["services", d.services],
    ["status", d.status],
    ["notes", d.notes],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [col, val] of map) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (!sets.length) return error("Aucun champ à modifier.", 400);
  values.push(Number(params.id));
  const { rows } = await db.query(
    `UPDATE visits SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING id`,
    values,
  );
  if (!rows.length) return error("Visite introuvable.", 404);
  const { rows: updated } = await db.query<VisitRow>(`${VISIT_SELECT} WHERE v.id = $1`, [Number(params.id)]);
  return json({ visite: visitToJson(updated[0]) });
});

route("DELETE", "/api/visits/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query("DELETE FROM visits WHERE id = $1 RETURNING id", [Number(params.id)]);
  if (!rows.length) return error("Visite introuvable.", 404);
  return json({ ok: true, supprime: Number(params.id) });
});

// --- Optimisation de route (Google Routes API) ---

route("POST", "/api/routes/optimize", async (req) => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await body(req));
  if (!parsed.success) return error("Date invalide (AAAA-MM-JJ attendu).", 400);
  const db = await getDb();
  const { rows: visits } = await db.query<VisitRow>(
    `${VISIT_SELECT} WHERE v.scheduled_at::date = $1::date AND v.status != 'annulee'
     ORDER BY v.scheduled_at`,
    [parsed.data.date],
  );
  if (visits.length < 2) {
    return error("Au moins 2 visites planifiées ce jour-là sont nécessaires.", 400);
  }

  try {
    // Géocode les clients sans coordonnées (persisté sur la fiche client).
    for (const v of visits) {
      if (v.latitude == null || v.longitude == null) {
        const geo = await geocodeAddress(`${v.address_line}, ${v.city}, QC, Canada`);
        await db.query(
          "UPDATE clients SET latitude = $1, longitude = $2, updated_at = now() WHERE id = $3",
          [geo.lat, geo.lng, v.client_id],
        );
        v.latitude = geo.lat;
        v.longitude = geo.lng;
      }
    }

    // Dépôt : adresse de base de l'entreprise (géocodée une seule fois).
    const { rows: settingsRows } = await db.query<{
      base_address: string;
      base_latitude: number | null;
      base_longitude: number | null;
    }>("SELECT base_address, base_latitude, base_longitude FROM settings WHERE id = 1");
    let depot: GeoPoint;
    const s = settingsRows[0];
    if (s.base_latitude != null && s.base_longitude != null) {
      depot = { lat: s.base_latitude, lng: s.base_longitude };
    } else {
      const geo = await geocodeAddress(s.base_address);
      depot = { lat: geo.lat, lng: geo.lng };
      await db.query(
        "UPDATE settings SET base_latitude = $1, base_longitude = $2, updated_at = now() WHERE id = 1",
        [geo.lat, geo.lng],
      );
    }

    const stops = visits.map((v) => ({ lat: v.latitude as number, lng: v.longitude as number }));
    const plan = await optimizeRoute(depot, stops);

    // Persiste l'ordre optimisé sur les visites.
    for (let position = 0; position < plan.optimized.order.length; position++) {
      const visitIndex = plan.optimized.order[position];
      await db.query("UPDATE visits SET route_position = $1 WHERE id = $2", [
        position + 1,
        visits[visitIndex].id,
      ]);
    }

    const describe = (order: number[]) =>
      order.map((i, position) => ({
        arret: position + 1,
        visiteId: visits[i].id,
        client: visits[i].client_name,
        adresse: `${visits[i].address_line}, ${visits[i].city}`,
      }));

    return json({
      date: parsed.data.date,
      depot: { adresse: s.base_address, ...depot },
      optimise: {
        ordre: describe(plan.optimized.order),
        distanceMetres: plan.optimized.distanceMeters,
        dureeSecondes: plan.optimized.durationSeconds,
        segments: plan.optimized.legs,
      },
      naif: {
        ordre: describe(plan.naive.order),
        distanceMetres: plan.naive.distanceMeters,
        dureeSecondes: plan.naive.durationSeconds,
      },
      gainMetres: plan.improvementMeters,
      gainSecondes: plan.improvementSeconds,
    });
  } catch (err) {
    if (err instanceof MapsError) return error(err.message, err.status);
    throw err;
  }
});

// Géocodage manuel d'un client
route("POST", "/api/clients/:id/geocode", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query<ClientRow>("SELECT * FROM clients WHERE id = $1", [Number(params.id)]);
  if (!rows[0]) return error("Client introuvable.", 404);
  try {
    const geo = await geocodeAddress(
      `${rows[0].address_line}, ${rows[0].city}, ${rows[0].province}, Canada`,
    );
    await db.query(
      "UPDATE clients SET latitude = $1, longitude = $2, updated_at = now() WHERE id = $3",
      [geo.lat, geo.lng, rows[0].id],
    );
    return json({ latitude: geo.lat, longitude: geo.lng, adresseFormatee: geo.formatted });
  } catch (err) {
    if (err instanceof MapsError) return error(err.message, err.status);
    throw err;
  }
});

// --- Square ---

route("POST", "/api/documents/:id/square", async (_req, params) => {
  try {
    const result = await pushDocumentToSquare(Number(params.id));
    return json({ square: result }, 201);
  } catch (err) {
    if (err instanceof SquareError) return error(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
    throw err;
  }
});

route("POST", "/api/documents/:id/square/sync", async (_req, params) => {
  try {
    const result = await syncDocumentFromSquare(Number(params.id));
    return json({ square: result });
  } catch (err) {
    if (err instanceof SquareError) return error(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
    throw err;
  }
});

// Webhook Square (public; signature HMAC obligatoire).
route(
  "POST",
  "/api/webhooks/square",
  async (req) => {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) {
      return error("SQUARE_WEBHOOK_SIGNATURE_KEY non configurée : webhook refusé.", 503);
    }
    const rawBody = await req.text();
    const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || req.url;
    const valid = verifySquareSignature(
      notificationUrl,
      rawBody,
      req.headers.get("x-square-hmacsha256-signature"),
      signatureKey,
    );
    if (!valid) return error("Signature Square invalide.", 401);
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return error("Corps JSON invalide.", 400);
    }
    const result = await handleSquareWebhook(event as Parameters<typeof handleSquareWebhook>[0]);
    return json(result);
  },
  { auth: false },
);

// --- Passe 3 : inventaire ---

const inventoryItemSchema = z.object({
  sku: z.string().max(60).default(""),
  name: z.string().min(1, "Nom du produit requis"),
  category: z.string().max(120).default(""),
  format: z.string().max(120).default(""),
  unit: z.string().max(40).default("unité"),
  quantity: z.number().min(0).default(0),
  costCents: z.number().int().min(0).default(0),
  notes: z.string().default(""),
});

interface InventoryRow {
  id: number;
  sku: string | null;
  name: string;
  source: string;
  category: string;
  format: string;
  unit: string;
  quantity: string;
  cost_cents: number;
  notes: string;
  active: boolean;
}

function itemToJson(row: InventoryRow) {
  return {
    id: row.id,
    sku: row.sku ?? "",
    name: row.name,
    source: row.source,
    category: row.category,
    format: row.format,
    unit: row.unit,
    quantity: Number(row.quantity),
    costCents: row.cost_cents,
    notes: row.notes,
    active: row.active,
  };
}

// --- Catégories de produits (liste gérable pour le menu déroulant) ---

route("GET", "/api/inventory/categories", async () => {
  const db = await getDb();
  const { rows } = await db.query<{ id: number; name: string }>(
    "SELECT id, name FROM product_categories ORDER BY name",
  );
  return json({ categories: rows });
});

route("POST", "/api/inventory/categories", async (req) => {
  const parsed = z.object({ name: z.string().trim().min(1, "Nom de catégorie requis").max(120) })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const db = await getDb();
  const { rows } = await db.query<{ id: number; name: string }>(
    `INSERT INTO product_categories (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`,
    [parsed.data.name],
  );
  return json({ categorie: rows[0] }, 201);
});

route("DELETE", "/api/inventory/categories/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query<{ name: string }>(
    "DELETE FROM product_categories WHERE id = $1 RETURNING name",
    [Number(params.id)],
  );
  if (!rows.length) return error("Catégorie introuvable.", 404);
  // Les produits qui portaient cette catégorie la conservent en texte;
  // elle disparaît seulement du menu déroulant.
  return json({ ok: true, supprimee: rows[0].name });
});

// Import (ou mise à jour) du catalogue OJ Compagnie embarqué.
route("POST", "/api/inventory/import-oj", async () => {
  const db = await getDb();
  const { importOjCatalog } = await import("./seed.js");
  const result = await importOjCatalog(db);
  return json({ importe: result });
});

route("GET", "/api/inventory", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const source = url.searchParams.get("source");
  const clauses: string[] = ["active"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(lower(name) LIKE lower($${params.length}) OR lower(coalesce(sku,'')) LIKE lower($${params.length}) OR lower(category) LIKE lower($${params.length}))`);
  }
  if (source) {
    params.push(source);
    clauses.push(`source = $${params.length}`);
  }
  const { rows } = await db.query<InventoryRow>(
    `SELECT * FROM inventory_items WHERE ${clauses.join(" AND ")} ORDER BY source, category, name LIMIT 500`,
    params,
  );
  const { rows: counts } = await db.query<{ source: string; n: string }>(
    "SELECT source, count(*) AS n FROM inventory_items WHERE active GROUP BY source",
  );
  return json({
    produits: rows.map(itemToJson),
    comptes: Object.fromEntries(counts.map((c) => [c.source, Number(c.n)])),
  });
});

route("POST", "/api/inventory", async (req) => {
  const parsed = inventoryItemSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const { rows } = await db.query<InventoryRow>(
    `INSERT INTO inventory_items (sku, name, source, category, format, unit, quantity, cost_cents, notes)
     VALUES ($1,$2,'manuel',$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.sku || null, d.name, d.category, d.format, d.unit, d.quantity, d.costCents, d.notes],
  );
  return json({ produit: itemToJson(rows[0]) }, 201);
});

route("PUT", "/api/inventory/:id", async (req, params) => {
  const parsed = inventoryItemSchema.partial().safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const map: [string, unknown][] = [
    ["sku", d.sku], ["name", d.name], ["category", d.category], ["format", d.format],
    ["unit", d.unit], ["cost_cents", d.costCents], ["notes", d.notes],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [col, val] of map) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (!sets.length) return error("Aucun champ à modifier.", 400);
  values.push(Number(params.id));
  const { rows } = await db.query<InventoryRow>(
    `UPDATE inventory_items SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return error("Produit introuvable.", 404);
  return json({ produit: itemToJson(rows[0]) });
});

route("DELETE", "/api/inventory/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query(
    "UPDATE inventory_items SET active = false WHERE id = $1 RETURNING id",
    [Number(params.id)],
  );
  if (!rows.length) return error("Produit introuvable.", 404);
  return json({ ok: true, desactive: Number(params.id) });
});

// Mouvement de stock : delta négatif = sortie, positif = entrée.
route("POST", "/api/inventory/:id/movement", async (req, params) => {
  const parsed = z
    .object({ delta: z.number().refine((v) => v !== 0, "Le delta ne peut pas être 0"), reason: z.string().default("") })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const db = await getDb();
  const id = Number(params.id);
  const { rows: items } = await db.query<InventoryRow>(
    "SELECT * FROM inventory_items WHERE id = $1 AND active",
    [id],
  );
  if (!items[0]) return error("Produit introuvable.", 404);
  const before = Number(items[0].quantity);
  const after = before + parsed.data.delta;
  if (after < 0) {
    return error(`Stock insuffisant : ${before} ${items[0].unit} en stock, sortie demandée de ${-parsed.data.delta}.`, 400);
  }
  await db.query("INSERT INTO stock_movements (item_id, delta, reason) VALUES ($1,$2,$3)", [
    id,
    parsed.data.delta,
    parsed.data.reason,
  ]);
  const { rows } = await db.query<InventoryRow>(
    "UPDATE inventory_items SET quantity = quantity + $1 WHERE id = $2 RETURNING *",
    [parsed.data.delta, id],
  );
  return json({ produit: itemToJson(rows[0]), quantiteAvant: before, quantiteApres: after });
});

route("GET", "/api/inventory/:id/movements", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT id, delta, reason, created_at FROM stock_movements WHERE item_id = $1 ORDER BY id DESC LIMIT 100",
    [Number(params.id)],
  );
  return json({ mouvements: rows });
});

// --- Commandes fournisseurs ---

const orderSchema = z.object({
  supplier: z.string().min(1, "Fournisseur requis"),
  notes: z.string().default(""),
  shippingCents: z.number().int().min(0).default(4500),
  taxesEnabled: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        itemId: z.number().int().nullable().optional(),
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitCostCents: z.number().int().min(0),
      }),
    )
    .min(1, "Au moins une ligne est requise"),
});

route("GET", "/api/orders", async () => {
  const db = await getDb();
  const { rows: orders } = await db.query(
    "SELECT * FROM supplier_orders ORDER BY id DESC LIMIT 100",
  );
  const { rows: lines } = await db.query(
    "SELECT * FROM supplier_order_items ORDER BY order_id, id",
  );
  return json({
    commandes: (orders as any[]).map((o) => ({
      id: o.id,
      supplier: o.supplier,
      status: o.status,
      orderedOn: o.ordered_on ? toIsoDate(o.ordered_on) : null,
      receivedOn: o.received_on ? toIsoDate(o.received_on) : null,
      subtotalCents: o.subtotal_cents,
      shippingCents: o.shipping_cents,
      taxesEnabled: o.taxes_enabled,
      tpsCents: o.tps_cents,
      tvqCents: o.tvq_cents,
      totalCents: o.total_cents,
      notes: o.notes,
      lines: (lines as any[])
        .filter((l) => l.order_id === o.id)
        .map((l) => ({
          id: l.id,
          itemId: l.item_id,
          description: l.description,
          quantity: Number(l.quantity),
          unitCostCents: l.unit_cost_cents,
          amountCents: l.amount_cents,
        })),
    })),
  });
});

// Totaux d'une commande : sous-total + livraison, puis TPS/TVQ sur le tout.
function orderTotals(
  subtotalCents: number,
  shippingCents: number,
  taxesEnabled: boolean,
): { tpsCents: number; tvqCents: number; totalCents: number } {
  const taxable = subtotalCents + shippingCents;
  const tpsCents = taxesEnabled ? Math.round(taxable * 0.05) : 0;
  const tvqCents = taxesEnabled ? Math.round(taxable * 0.09975) : 0;
  return { tpsCents, tvqCents, totalCents: taxable + tpsCents + tvqCents };
}

route("POST", "/api/orders", async (req) => {
  const parsed = orderSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const subtotal = d.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0);
  const t = orderTotals(subtotal, d.shippingCents, d.taxesEnabled);
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO supplier_orders (supplier, status, ordered_on, subtotal_cents, shipping_cents,
       taxes_enabled, tps_cents, tvq_cents, total_cents, notes)
     VALUES ($1, 'commandée', CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [d.supplier, subtotal, d.shippingCents, d.taxesEnabled, t.tpsCents, t.tvqCents, t.totalCents, d.notes],
  );
  for (const line of d.lines) {
    await db.query(
      `INSERT INTO supplier_order_items (order_id, item_id, description, quantity, unit_cost_cents, amount_cents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [rows[0].id, line.itemId ?? null, line.description, line.quantity, line.unitCostCents, Math.round(line.quantity * line.unitCostCents)],
    );
  }
  return json({ commande: { id: rows[0].id, totalCents: t.totalCents } }, 201);
});

// Modification d'une commande : statut, notes, livraison, taxes, fournisseur.
route("PUT", "/api/orders/:id", async (req, params) => {
  const parsed = z
    .object({
      supplier: z.string().min(1).optional(),
      status: z.enum(["brouillon", "commandée", "reçue", "annulée"]).optional(),
      notes: z.string().optional(),
      shippingCents: z.number().int().min(0).optional(),
      taxesEnabled: z.boolean().optional(),
    })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const { rows: existing } = await db.query<{
    id: number; status: string; subtotal_cents: number; shipping_cents: number; taxes_enabled: boolean;
  }>("SELECT * FROM supplier_orders WHERE id = $1", [Number(params.id)]);
  if (!existing[0]) return error("Commande introuvable.", 404);
  // « reçue » passe par POST /receive (qui ajuste le stock), jamais par ici.
  if (d.status === "reçue" && existing[0].status !== "reçue") {
    return error("Utilisez « Marquer comme reçue » pour recevoir la commande (le stock sera ajusté).", 400);
  }
  const shipping = d.shippingCents ?? existing[0].shipping_cents;
  const taxes = d.taxesEnabled ?? existing[0].taxes_enabled;
  const t = orderTotals(existing[0].subtotal_cents, shipping, taxes);
  await db.query(
    `UPDATE supplier_orders SET supplier = COALESCE($1, supplier), status = COALESCE($2, status),
       notes = COALESCE($3, notes), shipping_cents = $4, taxes_enabled = $5,
       tps_cents = $6, tvq_cents = $7, total_cents = $8 WHERE id = $9`,
    [d.supplier ?? null, d.status ?? null, d.notes ?? null, shipping, taxes,
     t.tpsCents, t.tvqCents, t.totalCents, Number(params.id)],
  );
  return json({ ok: true, totalCents: t.totalCents });
});

route("DELETE", "/api/orders/:id", async (_req, params) => {
  const db = await getDb();
  const { rows: existing } = await db.query<{ status: string }>(
    "SELECT status FROM supplier_orders WHERE id = $1",
    [Number(params.id)],
  );
  if (!existing[0]) return error("Commande introuvable.", 404);
  if (existing[0].status === "reçue") {
    return error("Impossible de supprimer une commande reçue (le stock a été ajusté).", 400);
  }
  await db.query("DELETE FROM supplier_orders WHERE id = $1", [Number(params.id)]);
  return json({ ok: true, supprime: Number(params.id) });
});

// Réception d'une commande : incrémente le stock des produits liés.
route("POST", "/api/orders/:id/receive", async (_req, params) => {
  const db = await getDb();
  const id = Number(params.id);
  const { rows: orders } = await db.query<{ id: number; status: string }>(
    "SELECT id, status FROM supplier_orders WHERE id = $1",
    [id],
  );
  if (!orders[0]) return error("Commande introuvable.", 404);
  if (orders[0].status === "reçue") return error("Cette commande est déjà reçue.", 409);
  const { rows: lines } = await db.query<{ item_id: number | null; quantity: string; description: string }>(
    "SELECT item_id, quantity, description FROM supplier_order_items WHERE order_id = $1",
    [id],
  );
  const incremented: { itemId: number; delta: number }[] = [];
  for (const line of lines) {
    if (line.item_id != null) {
      await db.query("INSERT INTO stock_movements (item_id, delta, reason) VALUES ($1,$2,$3)", [
        line.item_id,
        Number(line.quantity),
        `Réception commande #${id}`,
      ]);
      await db.query("UPDATE inventory_items SET quantity = quantity + $1 WHERE id = $2", [
        Number(line.quantity),
        line.item_id,
      ]);
      incremented.push({ itemId: line.item_id, delta: Number(line.quantity) });
    }
  }
  await db.query(
    "UPDATE supplier_orders SET status = 'reçue', received_on = CURRENT_DATE WHERE id = $1",
    [id],
  );
  return json({ ok: true, stockIncremente: incremented });
});

// --- Finances : dépenses, revenus, rapport de marges ---

const expenseSchema = z.object({
  label: z.string().min(1, "Description requise"),
  category: z.string().default("général"),
  amountCents: z.number().int().min(1, "Montant requis"),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().default(""),
});

const revenueSchema = z.object({
  label: z.string().min(1, "Description requise"),
  amountCents: z.number().int().min(1, "Montant requis"),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().default(""),
});

route("GET", "/api/expenses", async () => {
  const db = await getDb();
  const { rows } = await db.query("SELECT * FROM expenses ORDER BY spent_on DESC, id DESC LIMIT 200");
  return json({
    depenses: (rows as any[]).map((r) => ({
      id: r.id, label: r.label, category: r.category,
      amountCents: r.amount_cents, spentOn: toIsoDate(r.spent_on), notes: r.notes,
    })),
  });
});

route("POST", "/api/expenses", async (req) => {
  const parsed = expenseSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO expenses (label, category, amount_cents, spent_on, notes)
     VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5) RETURNING id`,
    [d.label, d.category, d.amountCents, d.spentOn ?? null, d.notes],
  );
  return json({ depense: { id: rows[0].id } }, 201);
});

route("DELETE", "/api/expenses/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query("DELETE FROM expenses WHERE id = $1 RETURNING id", [Number(params.id)]);
  if (!rows.length) return error("Dépense introuvable.", 404);
  return json({ ok: true });
});

route("GET", "/api/revenues", async () => {
  const db = await getDb();
  const { rows } = await db.query("SELECT * FROM revenues ORDER BY received_on DESC, id DESC LIMIT 200");
  return json({
    revenus: (rows as any[]).map((r) => ({
      id: r.id, label: r.label, amountCents: r.amount_cents,
      receivedOn: toIsoDate(r.received_on), notes: r.notes,
      source: r.source ?? "manuel",
    })),
  });
});

route("POST", "/api/revenues", async (req) => {
  const parsed = revenueSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO revenues (label, amount_cents, received_on, notes)
     VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4) RETURNING id`,
    [d.label, d.amountCents, d.receivedOn ?? null, d.notes],
  );
  return json({ revenu: { id: rows[0].id } }, 201);
});

route("DELETE", "/api/revenues/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query("DELETE FROM revenues WHERE id = $1 RETURNING id", [Number(params.id)]);
  if (!rows.length) return error("Revenu introuvable.", 404);
  return json({ ok: true });
});

// Synchronisation des paiements Square → revenus (idempotente par paiement).
// Le webhook payment.* fait la même chose en temps réel; ce bouton sert de
// rattrapage (paiements antérieurs à la souscription webhook, ou webhook manqué).
route("POST", "/api/finances/sync-square", async () => {
  let payments;
  try {
    payments = await listSquarePayments(365);
  } catch (err) {
    if (err instanceof SquareError) return error(err.message, err.status);
    throw err;
  }
  let inseres = 0;
  for (const p of payments) {
    if (await applySquarePayment(p)) inseres++;
  }
  return json({ ok: true, paiements: payments.length, nouveauxRevenus: inseres });
});

// Rapport de marges : revenus (factures payées + revenus manuels) − coûts (dépenses).
route("GET", "/api/finances/report", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const from = url.searchParams.get("du") ?? "1970-01-01";
  const to = url.searchParams.get("au") ?? "2999-12-31";
  const sum = async (sql: string, params: unknown[]) =>
    Number((await db.query<{ s: string | null }>(sql, params)).rows[0].s ?? 0);

  const facturesPayees = await sum(
    `SELECT COALESCE(SUM(total_cents),0) AS s FROM documents
     WHERE kind = 'facture' AND status = 'payée' AND issued_on BETWEEN $1::date AND $2::date`,
    [from, to],
  );
  const revenusManuels = await sum(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM revenues WHERE received_on BETWEEN $1::date AND $2::date",
    [from, to],
  );
  const depenses = await sum(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM expenses WHERE spent_on BETWEEN $1::date AND $2::date",
    [from, to],
  );
  const { rows: parCategorie } = await db.query(
    `SELECT category, SUM(amount_cents)::int AS total FROM expenses
     WHERE spent_on BETWEEN $1::date AND $2::date GROUP BY category ORDER BY total DESC`,
    [from, to],
  );
  const revenusTotal = facturesPayees + revenusManuels;
  const marge = revenusTotal - depenses;
  const margePct = revenusTotal > 0 ? Math.round((marge / revenusTotal) * 10000) / 100 : null;
  return json({
    du: from,
    au: to,
    revenus: { facturesPayees, revenusManuels, total: revenusTotal },
    couts: { depenses, parCategorie },
    marge,
    margePct,
  });
});

// --- Marketing : campagnes ---

const campaignSchema = z.object({
  name: z.string().min(1, "Nom de campagne requis"),
  channel: z.string().default(""),
  content: z.string().default(""),
  objective: z.string().default(""),
  tone: z.string().default(""),
  aiPrompt: z.string().default(""),
  imageData: z.string().default(""),
  launchOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de lancement requise (AAAA-MM-JJ)"),
});

function campaignToJson(r: any) {
  return {
    id: r.id,
    name: r.name,
    channel: r.channel,
    content: r.content,
    objective: r.objective ?? "",
    tone: r.tone ?? "",
    aiPrompt: r.ai_prompt ?? "",
    imageData: r.image_data ?? "",
    launchOn: r.launch_on ? toIsoDate(r.launch_on) : null,
    status: r.status,
    createdAt: r.created_at,
  };
}

route("GET", "/api/campaigns", async () => {
  const db = await getDb();
  const { rows } = await db.query("SELECT * FROM campaigns ORDER BY launch_on NULLS LAST, id DESC");
  return json({ campagnes: (rows as any[]).map(campaignToJson) });
});

route("POST", "/api/campaigns", async (req) => {
  const parsed = campaignSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const status = d.launchOn > today ? "planifiée" : "lancée";
  const { rows } = await db.query(
    `INSERT INTO campaigns (name, channel, content, objective, tone, ai_prompt, image_data, launch_on, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9) RETURNING *`,
    [d.name, d.channel, d.content, d.objective, d.tone, d.aiPrompt, d.imageData, d.launchOn, status],
  );
  return json({ campagne: campaignToJson(rows[0]) }, 201);
});

route("PUT", "/api/campaigns/:id", async (req, params) => {
  const parsed = campaignSchema
    .partial()
    .extend({ status: z.enum(["planifiée", "lancée", "terminée", "annulée"]).optional() })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  const db = await getDb();
  const map: [string, unknown][] = [
    ["name", d.name], ["channel", d.channel], ["content", d.content],
    ["objective", d.objective], ["tone", d.tone], ["ai_prompt", d.aiPrompt],
    ["image_data", d.imageData], ["launch_on", d.launchOn], ["status", d.status],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [col, val] of map) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (!sets.length) return error("Aucun champ à modifier.", 400);
  values.push(Number(params.id));
  const { rows } = await db.query(
    `UPDATE campaigns SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return error("Campagne introuvable.", 404);
  return json({ campagne: campaignToJson(rows[0]) });
});

route("DELETE", "/api/campaigns/:id", async (_req, params) => {
  const db = await getDb();
  const { rows } = await db.query("DELETE FROM campaigns WHERE id = $1 RETURNING id", [Number(params.id)]);
  if (!rows.length) return error("Campagne introuvable.", 404);
  return json({ ok: true });
});

// Génération IA (Gemini) : texte d'annonce ou visuel publicitaire.
route("POST", "/api/marketing/generate", async (req) => {
  const parsed = z
    .object({
      mode: z.enum(["texte", "image"]),
      platform: z.string().default("Facebook"),
      objective: z.string().default(""),
      tone: z.string().default("chaleureux et professionnel"),
      details: z.string().default(""),
    })
    .safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  try {
    if (d.mode === "texte") {
      const prompt = [
        `Tu es le responsable marketing de « St-Amour du Vert », une entreprise`,
        `familiale d'entretien de pelouse à L'Ange-Gardien (Outaouais, Québec) —`,
        `forfaits saisonniers Essentiel / Régulier / Élite, produits naturels,`,
        `site web stamourduvert.com, téléphone 819-598-7891.`,
        `Rédige le texte d'une annonce ${d.platform} en français québécois.`,
        d.objective ? `Objectif de la campagne : ${d.objective}.` : "",
        `Ton : ${d.tone}.`,
        d.details ? `Détails à intégrer : ${d.details}.` : "",
        `Réponds UNIQUEMENT avec le texte de l'annonce, prêt à copier-coller`,
        `(accroche, corps court, appel à l'action, 3 à 5 mots-clics pertinents).`,
      ]
        .filter(Boolean)
        .join(" ");
      const texte = await generateAdText(prompt);
      return json({ texte });
    }
    const prompt = [
      `Publicité pour une entreprise d'entretien de pelouse au Québec (St-Amour du Vert).`,
      `Image photoréaliste lumineuse : pelouse résidentielle verte impeccable,`,
      `banlieue québécoise, été. Aucun texte dans l'image.`,
      d.objective ? `Thème : ${d.objective}.` : "",
      d.details ? `Détails : ${d.details}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const image = await generateAdImage(prompt);
    return json({ image });
  } catch (err) {
    if (err instanceof GeminiError) return error(err.message, err.status === 429 ? 429 : 502);
    throw err;
  }
});

// ---------- Répartiteur ----------

export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

  // Préflight CORS pour l'endpoint public de soumission (appelé par le site vitrine).
  if (req.method === "OPTIONS" && path === "/api/public/soumission") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const match = r.pattern.exec(path);
    if (!match) continue;
    let user: SessionUser | null = null;
    if (r.auth) {
      user = await getSessionUser(req);
      if (!user) return error("Authentification requise.", 401);
    }
    try {
      return await r.handler(req, (match.groups ?? {}) as Params, user as SessionUser);
    } catch (err) {
      console.error(`Erreur ${req.method} ${path}:`, err);
      if (err instanceof DbNotProvisionedError) return error(err.message, 503);
      return error("Erreur interne du serveur.", 500);
    }
  }
  return error("Route introuvable.", 404);
}
