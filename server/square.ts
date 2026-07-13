// Intégration Square (compte de PRODUCTION).
// Flux sortant : facture de l'app → client + commande + facture Square publiée.
// Flux entrant : webhook `invoice.*` (signature HMAC vérifiée) ou
// synchronisation manuelle → statut « payée » dans l'app.
//
// IMPORTANT (PRD) : les tests utilisent des factures au nom personnel d'Alex
// ou de Cindy — jamais les vrais clients.

import { createHmac, randomUUID } from "node:crypto";
import { getDb, type Db } from "./db.js";

const SQUARE_BASE = "https://connect.squareup.com";
const SQUARE_VERSION = "2025-01-23";

let fetchImpl: typeof fetch = (...args) => fetch(...args);

/** Tests : remplace fetch par une implémentation simulée. */
export function setSquareFetchForTests(impl: typeof fetch | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

export class SquareError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function squareFetch<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    throw new SquareError("SQUARE_ACCESS_TOKEN non configuré.", 503, null);
  }
  const res = await fetchImpl(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { detail?: string; code?: string }[] };
  if (!res.ok) {
    const detail = data.errors?.[0]?.detail ?? data.errors?.[0]?.code ?? `HTTP ${res.status}`;
    throw new SquareError(`Erreur Square : ${detail}`, res.status, data.errors ?? data);
  }
  return data;
}

// ---------- Emplacement ----------

export async function getSquareLocationId(db: Db): Promise<string> {
  const { rows } = await db.query<{ square_location_id: string }>(
    "SELECT square_location_id FROM settings WHERE id = 1",
  );
  if (rows[0]?.square_location_id) return rows[0].square_location_id;
  const data = await squareFetch<{
    locations: { id: string; status: string; currency: string }[];
  }>("/v2/locations", "GET");
  const location =
    data.locations.find((l) => l.status === "ACTIVE" && l.currency === "CAD") ??
    data.locations[0];
  if (!location) throw new SquareError("Aucun emplacement Square trouvé.", 500, data);
  await db.query("UPDATE settings SET square_location_id = $1, updated_at = now() WHERE id = 1", [
    location.id,
  ]);
  return location.id;
}

// ---------- Envoi d'une facture vers Square ----------

interface SquareInvoice {
  id: string;
  version: number;
  status: string;
  invoice_number?: string;
  public_url?: string;
  order_id?: string;
  payment_requests?: { computed_amount_money?: { amount: number } }[];
}

interface PushResult {
  squareInvoiceId: string;
  status: string;
  publicUrl: string | null;
  squareCustomerId: string;
  squareOrderId: string;
  squareTotal: number | null;
}

/** 0.09975 → « 9.975 » (sans artefact de virgule flottante). */
function ratePct(rate: string | number): string {
  return (Number(rate) * 100).toFixed(4).replace(/\.?0+$/, "");
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function pushDocumentToSquare(documentId: number): Promise<PushResult> {
  const db = await getDb();
  const { rows: docs } = await db.query<{
    id: number;
    kind: string;
    number: string;
    client_id: number;
    taxes_enabled: boolean;
    tps_rate: string;
    tvq_rate: string;
    deposit_cents: number;
    square_invoice_id: string | null;
    square_send_count: number;
  }>("SELECT * FROM documents WHERE id = $1", [documentId]);
  const doc = docs[0];
  if (!doc) throw new SquareError("Document introuvable.", 404, null);
  if (doc.square_invoice_id) {
    throw new SquareError(`Ce document est déjà dans Square (${doc.square_invoice_id}).`, 409, null);
  }
  // Square exige un invoice_number unique par emplacement, et le conserve même
  // après annulation. À chaque (ré)envoi on incrémente donc un compteur et on
  // suffixe le numéro dès le 2e envoi (« CON-2026-0001-R2 »…) pour ne jamais
  // heurter un numéro déjà utilisé côté Square. Le compteur est persisté AVANT
  // l'appel : ainsi un « Réessayer » après un échec obtient un numéro neuf.
  const sendAttempt = (doc.square_send_count ?? 0) + 1;
  const invoiceNumber = sendAttempt === 1 ? doc.number : `${doc.number}-R${sendAttempt}`;
  await db.query("UPDATE documents SET square_send_count = $1 WHERE id = $2", [sendAttempt, documentId]);
  // Estimation : créée en BROUILLON dans Square (visible au tableau de bord
  // Square, jamais envoyée au client). Contrat et facture : publiés.
  const publier = doc.kind !== "estimation";

  const { rows: clients } = await db.query<{
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    square_customer_id: string | null;
  }>("SELECT * FROM clients WHERE id = $1", [doc.client_id]);
  const client = clients[0];

  const { rows: lines } = await db.query<{
    description: string;
    quantity: string;
    unit_price_cents: number;
  }>("SELECT * FROM document_lines WHERE document_id = $1 ORDER BY position", [documentId]);

  const locationId = await getSquareLocationId(db);

  // 1) Client Square (réutilisé si déjà créé)
  let customerId = client.square_customer_id;
  if (!customerId) {
    const created = await squareFetch<{ customer: { id: string } }>("/v2/customers", "POST", {
      idempotency_key: randomUUID(),
      given_name: client.first_name,
      family_name: client.last_name,
      ...(client.email ? { email_address: client.email } : {}),
      ...(client.phone ? { phone_number: client.phone } : {}),
      note: "Créé par le Gestionnaire St-Amour du Vert",
    });
    customerId = created.customer.id;
    await db.query("UPDATE clients SET square_customer_id = $1, updated_at = now() WHERE id = $2", [
      customerId,
      client.id,
    ]);
  }

  // 2) Commande (lignes + taxes en pourcentage si activées)
  const order = await squareFetch<{ order: { id: string; total_money?: { amount: number } } }>(
    "/v2/orders",
    "POST",
    {
      idempotency_key: randomUUID(),
      order: {
        location_id: locationId,
        reference_id: doc.number,
        customer_id: customerId,
        line_items: lines.map((l) => ({
          name: l.description.slice(0, 512),
          quantity: String(Number(l.quantity)),
          base_price_money: { amount: l.unit_price_cents, currency: "CAD" },
        })),
        ...(doc.taxes_enabled
          ? {
              taxes: [
                { name: "TPS", percentage: ratePct(doc.tps_rate), scope: "ORDER" },
                { name: "TVQ", percentage: ratePct(doc.tvq_rate), scope: "ORDER" },
              ],
            }
          : {}),
      },
    },
  );

  // 3) Facture Square (SHARE_MANUALLY : aucun courriel envoyé par Square)
  const paymentRequests: unknown[] = [];
  if (doc.deposit_cents > 0) {
    paymentRequests.push({
      request_type: "DEPOSIT",
      due_date: isoDatePlusDays(7),
      fixed_amount_requested_money: { amount: doc.deposit_cents, currency: "CAD" },
    });
  }
  paymentRequests.push({ request_type: "BALANCE", due_date: isoDatePlusDays(30) });

  const created = await squareFetch<{ invoice: SquareInvoice }>("/v2/invoices", "POST", {
    idempotency_key: randomUUID(),
    invoice: {
      location_id: locationId,
      order_id: order.order.id,
      primary_recipient: { customer_id: customerId },
      payment_requests: paymentRequests,
      delivery_method: "SHARE_MANUALLY",
      invoice_number: invoiceNumber,
      title:
        doc.kind === "contrat"
          ? "St-Amour du Vert — Contrat d'entretien de pelouse"
          : "St-Amour du Vert — Entretien de pelouse",
      accepted_payment_methods: { card: true },
    },
  });

  // 4) Publication (sauf estimation, qui reste en brouillon dans Square)
  const published = publier
    ? await squareFetch<{ invoice: SquareInvoice }>(
        `/v2/invoices/${created.invoice.id}/publish`,
        "POST",
        { idempotency_key: randomUUID(), version: created.invoice.version },
      )
    : created;

  await db.query(
    `UPDATE documents SET square_invoice_id = $1, square_payment_status = $2,
       square_public_url = $3,
       status = CASE WHEN $5 THEN
         (CASE WHEN kind = 'contrat' THEN 'envoyé' ELSE 'à payer' END)
         ELSE status END,
       updated_at = now() WHERE id = $4`,
    [published.invoice.id, published.invoice.status, published.invoice.public_url ?? null, documentId, publier],
  );

  return {
    squareInvoiceId: published.invoice.id,
    status: published.invoice.status,
    publicUrl: published.invoice.public_url ?? null,
    squareCustomerId: customerId,
    squareOrderId: order.order.id,
    squareTotal: order.order.total_money?.amount ?? null,
  };
}

// ---------- Retrait d'une facture de Square ----------

/**
 * Retire de Square la facture liée à un document : une facture en BROUILLON est
 * supprimée (`DELETE`), une facture publiée est annulée (`POST .../cancel`).
 * Square exige la version courante → on la relit d'abord. No-op si le document
 * n'a pas de facture Square. Avec `clearLink`, délie aussi le document local
 * (efface les champs `square_*`) pour qu'il puisse être renvoyé au besoin.
 */
export async function cancelSquareInvoice(
  documentId: number,
  opts: { clearLink?: boolean } = {},
): Promise<{ action: "none" | "deleted" | "canceled"; squareInvoiceId: string | null }> {
  const db = await getDb();
  const { rows } = await db.query<{ square_invoice_id: string | null }>(
    "SELECT square_invoice_id FROM documents WHERE id = $1",
    [documentId],
  );
  if (!rows[0]) throw new SquareError("Document introuvable.", 404, null);
  const invoiceId = rows[0].square_invoice_id;
  if (!invoiceId) return { action: "none", squareInvoiceId: null };

  // Version courante requise par Square pour supprimer/annuler.
  const current = await squareFetch<{ invoice: SquareInvoice }>(
    `/v2/invoices/${encodeURIComponent(invoiceId)}`,
    "GET",
  );
  let action: "deleted" | "canceled";
  if (current.invoice.status === "DRAFT") {
    await squareFetch(
      `/v2/invoices/${encodeURIComponent(invoiceId)}?version=${current.invoice.version}`,
      "DELETE",
    );
    action = "deleted";
  } else {
    await squareFetch(`/v2/invoices/${encodeURIComponent(invoiceId)}/cancel`, "POST", {
      version: current.invoice.version,
    });
    action = "canceled";
  }

  if (opts.clearLink) {
    await db.query(
      `UPDATE documents SET square_invoice_id = NULL, square_payment_status = NULL,
         square_public_url = NULL, updated_at = now() WHERE id = $1`,
      [documentId],
    );
  }
  return { action, squareInvoiceId: invoiceId };
}

// ---------- Synchronisation entrante ----------

const PAID_STATUSES = new Set(["PAID", "REFUNDED", "PARTIALLY_REFUNDED"]);

export function mapSquareStatus(squareStatus: string, kind = "facture"): string | null {
  if (kind === "contrat") {
    // L'acompte payé vaut signature du contrat; le paiement complet le clôt.
    if (PAID_STATUSES.has(squareStatus)) return "payé";
    if (squareStatus === "PARTIALLY_PAID") return "signé";
    if (squareStatus === "CANCELED") return "annulé";
    return null;
  }
  if (PAID_STATUSES.has(squareStatus)) return "payée";
  if (squareStatus === "PARTIALLY_PAID") return "partiellement payée";
  if (squareStatus === "CANCELED") return "annulée";
  return null; // DRAFT/UNPAID/SCHEDULED/... : le statut local reste inchangé
}

/** Applique l'état d'une facture Square au document local correspondant. */
export async function applySquareInvoiceUpdate(invoice: {
  id: string;
  status?: string;
  public_url?: string;
}): Promise<{ documentId: number; number: string; statusBefore: string; statusAfter: string } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number; number: string; status: string; kind: string }>(
    "SELECT id, number, status, kind FROM documents WHERE square_invoice_id = $1",
    [invoice.id],
  );
  const doc = rows[0];
  if (!doc || !invoice.status) return null;
  const mapped = mapSquareStatus(invoice.status, doc.kind);
  const newStatus = mapped ?? doc.status;
  await db.query(
    `UPDATE documents SET square_payment_status = $1, status = $2,
       square_public_url = COALESCE($3, square_public_url), updated_at = now() WHERE id = $4`,
    [invoice.status, newStatus, invoice.public_url ?? null, doc.id],
  );
  if (doc.kind !== "contrat" && mapped === "payée" && doc.status !== "payée") {
    await db.query(
      `INSERT INTO notifications (kind, title, body, link) VALUES ('paiement', $1, $2, $3)`,
      [
        `Facture ${doc.number} payée`,
        `Square confirme le paiement de la facture ${doc.number}.`,
        `/documents/${doc.id}`,
      ],
    );
  }
  if (
    doc.kind === "contrat" &&
    (mapped === "signé" || mapped === "payé") &&
    doc.status !== "signé" &&
    doc.status !== "payé"
  ) {
    await db.query(
      `INSERT INTO notifications (kind, title, body, link) VALUES ('contrat', $1, $2, $3)`,
      [
        `Contrat ${doc.number} signé`,
        `Le client a payé via Square — le contrat ${doc.number} est confirmé.`,
        `/documents/${doc.id}`,
      ],
    );
  }
  return { documentId: doc.id, number: doc.number, statusBefore: doc.status, statusAfter: newStatus };
}

export async function syncDocumentFromSquare(documentId: number): Promise<{
  squareStatus: string;
  document: { documentId: number; number: string; statusBefore: string; statusAfter: string } | null;
}> {
  const db = await getDb();
  const { rows } = await db.query<{ square_invoice_id: string | null }>(
    "SELECT square_invoice_id FROM documents WHERE id = $1",
    [documentId],
  );
  if (!rows[0]) throw new SquareError("Document introuvable.", 404, null);
  if (!rows[0].square_invoice_id) {
    throw new SquareError("Cette facture n'a pas encore été envoyée vers Square.", 400, null);
  }
  const data = await squareFetch<{ invoice: SquareInvoice }>(
    `/v2/invoices/${rows[0].square_invoice_id}`,
    "GET",
  );
  const applied = await applySquareInvoiceUpdate(data.invoice);
  return { squareStatus: data.invoice.status, document: applied };
}

// ---------- Paiements (synchronisation des revenus) ----------

export interface SquarePayment {
  id: string;
  status: string;
  amount_money?: { amount: number; currency: string };
  created_at?: string;
  note?: string;
  order_id?: string;
}

/** Paiements COMPLETED des `days` derniers jours (pagination suivie). */
export async function listSquarePayments(days = 365): Promise<SquarePayment[]> {
  const begin = new Date(Date.now() - days * 86400000).toISOString();
  const payments: SquarePayment[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ begin_time: begin, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await squareFetch<{ payments?: SquarePayment[]; cursor?: string }>(
      `/v2/payments?${params}`,
      "GET",
    );
    payments.push(...(data.payments ?? []));
    cursor = data.cursor;
  } while (cursor);
  return payments.filter((p) => p.status === "COMPLETED");
}

/**
 * Enregistre un paiement Square comme revenu (idempotent : la contrainte
 * unique sur square_payment_id empêche tout doublon). Retourne true si un
 * nouveau revenu a été inséré. Seuls les paiements COMPLETED sont comptés.
 */
export async function applySquarePayment(payment: SquarePayment): Promise<boolean> {
  const amount = payment.amount_money?.amount ?? 0;
  if (payment.status !== "COMPLETED" || amount <= 0) return false;
  const db = await getDb();
  const { rows } = await db.query(
    `INSERT INTO revenues (label, amount_cents, received_on, notes, source, square_payment_id)
     VALUES ($1, $2, $3::date, $4, 'square', $5)
     ON CONFLICT (square_payment_id) WHERE square_payment_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      `Paiement Square ${payment.id.slice(0, 8)}`,
      amount,
      (payment.created_at ?? new Date().toISOString()).slice(0, 10),
      payment.note ?? "",
      payment.id,
    ],
  );
  return rows.length > 0;
}

// ---------- Webhook ----------

/**
 * Vérification de signature Square : l'en-tête `x-square-hmacsha256-signature`
 * contient base64(HMAC-SHA256(clé, URL de notification + corps brut)).
 * https://developer.squareup.com/docs/webhooks/step3validate
 */
export function verifySquareSignature(
  notificationUrl: string,
  rawBody: string,
  signatureHeader: string | null,
  signatureKey: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", signatureKey)
    .update(notificationUrl + rawBody)
    .digest("base64");
  return expected === signatureHeader;
}

export interface SquareWebhookEvent {
  event_id?: string;
  type?: string;
  data?: {
    object?: {
      invoice?: { id: string; status?: string; public_url?: string };
      payment?: SquarePayment;
    };
  };
}

export async function handleSquareWebhook(event: SquareWebhookEvent): Promise<{
  processed: boolean;
  detail: string;
  document?: { documentId: number; number: string; statusBefore: string; statusAfter: string } | null;
}> {
  const db = await getDb();
  const eventId = event.event_id ?? randomUUID();
  const { rows: existing } = await db.query(
    "SELECT event_id FROM square_events WHERE event_id = $1",
    [eventId],
  );
  if (existing.length) return { processed: false, detail: "Événement déjà traité (idempotence)." };
  await db.query(
    "INSERT INTO square_events (event_id, event_type, payload) VALUES ($1, $2, $3)",
    [eventId, event.type ?? "inconnu", JSON.stringify(event).slice(0, 10000)],
  );

  // Événements de facture : met à jour le statut du document (contrat « signé »,
  // facture « payée »…).
  const invoice = event.data?.object?.invoice;
  if (event.type?.startsWith("invoice.") && invoice?.id) {
    const document = await applySquareInvoiceUpdate(invoice);
    return {
      processed: document !== null,
      detail: document
        ? `Facture ${document.number} : ${document.statusBefore} → ${document.statusAfter}.`
        : "Aucun document local ne correspond à cette facture Square.",
      document,
    };
  }

  // Événements de paiement : enregistre l'encaissement comme revenu en temps réel.
  const payment = event.data?.object?.payment;
  if (event.type?.startsWith("payment.") && payment?.id) {
    const inserted = await applySquarePayment(payment);
    return {
      processed: inserted,
      detail: inserted
        ? `Paiement Square ${payment.id.slice(0, 8)} enregistré comme revenu.`
        : "Paiement déjà enregistré ou non complété.",
    };
  }

  return { processed: false, detail: `Type d'événement ignoré : ${event.type ?? "inconnu"}.` };
}
