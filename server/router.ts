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

const loginSchema = z.object({
  email: z.string().email("Courriel invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

const userSchema = z.object({
  email: z.string().email("Courriel invalide"),
  name: z.string().min(1, "Nom requis"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
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
  kind: z.enum(["estimation", "facture"]).default("estimation"),
  clientId: z.number().int(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxesEnabled: z.boolean().optional(),
  depositCents: z.number().int().min(0).default(0),
  notes: z.string().default(""),
  status: z.string().optional(),
  lines: z.array(documentLineSchema).min(1, "Au moins une ligne est requise"),
});

const settingsSchema = z.object({
  companyName: z.string().min(1).optional(),
  companyAddress: z.string().optional(),
  companyEmail: z.string().optional(),
  companyPhone: z.string().optional(),
  taxesEnabled: z.boolean().optional(),
  tpsRate: z.number().min(0).max(1).optional(),
  tvqRate: z.number().min(0).max(1).optional(),
  tpsNumber: z.string().optional(),
  tvqNumber: z.string().optional(),
  estimateValidityDays: z.number().int().min(1).optional(),
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
    taxes_enabled: boolean;
    tps_rate: string;
    tvq_rate: string;
    tps_number: string;
    tvq_number: string;
    estimate_validity_days: number;
  }>("SELECT * FROM settings WHERE id = 1");
  const s = rows[0];
  return {
    companyName: s.company_name,
    companyAddress: s.company_address,
    companyEmail: s.company_email,
    companyPhone: s.company_phone,
    taxesEnabled: s.taxes_enabled,
    tpsRate: Number(s.tps_rate),
    tvqRate: Number(s.tvq_rate),
    tpsNumber: s.tps_number,
    tvqNumber: s.tvq_number,
    estimateValidityDays: s.estimate_validity_days,
  };
}

async function nextDocumentNumber(kind: "estimation" | "facture"): Promise<string> {
  const db = await getDb();
  const prefix = kind === "estimation" ? "EST" : "FAC";
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
  kind: "estimation" | "facture";
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
    const user = await authenticate(parsed.data.email, parsed.data.password);
    if (!user) return error("Courriel ou mot de passe invalide.", 401);
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

// --- Configuration cliente (clé Google Maps servie aux utilisateurs connectés) ---

route("GET", "/api/config", async () =>
  json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" }),
);

// --- Utilisateurs ---

route("GET", "/api/users", async () => {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT id, email, name, role, created_at FROM users ORDER BY id",
  );
  return json({ utilisateurs: rows });
});

route("POST", "/api/users", async (req) => {
  const parsed = userSchema.safeParse(await body(req));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const db = await getDb();
  const { rows: existing } = await db.query(
    "SELECT id FROM users WHERE lower(email) = lower($1)",
    [parsed.data.email],
  );
  if (existing.length) return error("Un utilisateur avec ce courriel existe déjà.", 409);
  const { rows } = await db.query(
    `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin')
     RETURNING id, email, name, role, created_at`,
    [parsed.data.email, parsed.data.name, hashPassword(parsed.data.password)],
  );
  return json({ utilisateur: rows[0] }, 201);
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
    ["taxes_enabled", d.taxesEnabled],
    ["tps_rate", d.tpsRate],
    ["tvq_rate", d.tvqRate],
    ["tps_number", d.tpsNumber],
    ["tvq_number", d.tvqNumber],
    ["estimate_validity_days", d.estimateValidityDays],
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

route("GET", "/api/packages", async () => {
  const db = await getDb();
  const { rows: packages } = await db.query<{
    id: number; slug: string; name: string; visits: string; tagline: string;
    popular: boolean; position: number; price_cents: number | null;
  }>("SELECT * FROM packages WHERE active ORDER BY position");
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
      items: items.filter((i) => i.package_id === p.id).map((i) => i.label),
    })),
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
  const totals = computeTotals(data.lines, {
    taxesEnabled,
    tpsRate: settings.tpsRate,
    tvqRate: settings.tvqRate,
    depositCents: data.depositCents,
  });
  const number = await nextDocumentNumber(data.kind);
  const status = data.status ?? (data.kind === "estimation" ? "brouillon" : "à payer");
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO documents (kind, number, client_id, status, issued_on, taxes_enabled,
       tps_rate, tvq_rate, subtotal_cents, tps_cents, tvq_cents, total_cents,
       deposit_cents, balance_cents, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [
      data.kind, number, data.clientId, status,
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

// Conversion estimation → facture
route("POST", "/api/documents/:id/convert", async (_req, params) => {
  const db = await getDb();
  const loaded = await loadDocument(Number(params.id));
  if (!loaded) return error("Document introuvable.", 404);
  if (loaded.row.kind !== "estimation") {
    return error("Seule une estimation peut être convertie en facture.", 400);
  }
  const number = await nextDocumentNumber("facture");
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO documents (kind, number, client_id, status, issued_on, taxes_enabled,
       tps_rate, tvq_rate, subtotal_cents, tps_cents, tvq_cents, total_cents,
       deposit_cents, balance_cents, notes, converted_from_id)
     VALUES ('facture', $1, $2, 'à payer', CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      number, loaded.row.client_id, loaded.row.taxes_enabled,
      loaded.row.tps_rate, loaded.row.tvq_rate,
      loaded.row.subtotal_cents, loaded.row.tps_cents, loaded.row.tvq_cents,
      loaded.row.total_cents, loaded.row.deposit_cents, loaded.row.balance_cents,
      loaded.row.notes, loaded.row.id,
    ],
  );
  const invoiceId = rows[0].id;
  for (const line of loaded.lines) {
    await db.query(
      `INSERT INTO document_lines (document_id, position, description, quantity, unit_price_cents, amount_cents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [invoiceId, line.position, line.description, Number(line.quantity), line.unit_price_cents, line.amount_cents],
    );
  }
  await db.query("UPDATE documents SET status = 'acceptée', updated_at = now() WHERE id = $1", [
    loaded.row.id,
  ]);
  const invoice = await loadDocument(invoiceId);
  return json(
    {
      document: documentToJson(
        invoice!.row,
        invoice!.lines.map((l) => ({
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
  return json({
    clientsActifs,
    prospects,
    estimationsEnCours,
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
  };
}

const VISIT_SELECT = `SELECT v.*, (c.first_name || ' ' || c.last_name) AS client_name,
    c.address_line, c.city, c.latitude, c.longitude
  FROM visits v JOIN clients c ON c.id = v.client_id`;

route("GET", "/api/visits", async (req) => {
  const db = await getDb();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const { rows } = date
    ? await db.query<VisitRow>(
        `${VISIT_SELECT} WHERE v.scheduled_at::date = $1::date ORDER BY v.scheduled_at`,
        [date],
      )
    : await db.query<VisitRow>(`${VISIT_SELECT} ORDER BY v.scheduled_at DESC LIMIT 100`);
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
    `INSERT INTO visits (client_id, scheduled_at, duration_minutes, services, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [d.clientId, d.scheduledAt, d.durationMinutes, d.services, d.status, d.notes],
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
