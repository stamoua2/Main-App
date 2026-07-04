// Routeur API — toutes les routes /api/*. Utilisé par la fonction Netlify
// (netlify/functions/api.ts), le serveur de développement local et les tests.

import { z } from "zod";
import { getDb } from "./db.js";
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
  return json({
    clientsActifs,
    prospects,
    estimationsEnCours,
    facturesImpayees,
    documentsRecents: recents.map((r) => documentToJson(r)),
    repartitionForfaits: repartition,
  });
});

// ---------- Répartiteur ----------

export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

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
      return error("Erreur interne du serveur.", 500);
    }
  }
  return error("Route introuvable.", 404);
}
