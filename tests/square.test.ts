// Critères 6 (PRD) / 3-4 (passe 2) — synchronisation Square.
// L'API Square est simulée (fetch injecté); l'appel de PRODUCTION réel est
// démontré séparément dans la transcription. Le webhook est testé avec une
// charge utile conforme à la documentation Square (signature HMAC-SHA256 de
// l'URL de notification + corps, encodée base64, en-tête
// x-square-hmacsha256-signature).

import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setSquareFetchForTests, verifySquareSignature } from "../server/square.js";
import { handleApiRequest } from "../server/router.js";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let invoiceDocId: number;
let estimateDocId: number;
let invoiceSquareId: string;
let invoiceCounter = 0;
const squareCalls: { method: string; path: string; body: any }[] = [];

// Simulation minimale de l'API Square (customers → orders → invoices → publish).
function fakeSquareFetch(): typeof fetch {
  return (async (input: any, init?: any) => {
    const url = String(input);
    const path = url.replace("https://connect.squareup.com", "");
    const method = init?.method ?? "GET";
    const reqBody = init?.body ? JSON.parse(init.body) : undefined;
    squareCalls.push({ method, path, body: reqBody });
    const respond = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

    if (path === "/v2/locations") {
      return respond({ locations: [{ id: "LTEST123", status: "ACTIVE", currency: "CAD" }] });
    }
    if (path === "/v2/customers" && method === "POST") {
      return respond({ customer: { id: "CUST_ALEX_1" } });
    }
    if (path === "/v2/orders" && method === "POST") {
      return respond({ order: { id: "ORDER_1", total_money: { amount: 123483, currency: "CAD" } } });
    }
    if (path === "/v2/invoices" && method === "POST") {
      invoiceCounter++;
      return respond({
        invoice: { id: `inv:TEST-${String(invoiceCounter).padStart(4, "0")}`, version: 0, status: "DRAFT" },
      });
    }
    const publishMatch = path.match(/^\/v2\/invoices\/(.+)\/publish$/);
    if (publishMatch) {
      return respond({
        invoice: {
          id: decodeURIComponent(publishMatch[1]),
          version: 1,
          status: "UNPAID",
          public_url: "https://squareup.com/pay-invoice/inv-test",
        },
      });
    }
    const getMatch = path.match(/^\/v2\/invoices\/([^/]+)$/);
    if (getMatch && method === "GET") {
      return respond({ invoice: { id: decodeURIComponent(getMatch[1]), version: 2, status: "PAID" } });
    }
    return respond({ errors: [{ code: "NOT_FOUND", detail: `non simulé : ${method} ${path}` }] }, 404);
  }) as typeof fetch;
}

beforeAll(async () => {
  await freshSeededDb();
  setSquareFetchForTests(fakeSquareFetch());
  cookie = await login(ALEX.email, ALEX.password);

  // Facture test au nom personnel d'Alex (jamais un vrai client).
  const alexClient = await api("POST", "/api/clients", {
    cookie,
    body: {
      firstName: "Alex",
      lastName: "St-Amour (test personnel)",
      email: "astamour8@gmail.com",
      addressLine: "33, chemin du Graphite",
      city: "L'Ange-Gardien",
      postalCode: "J8L 3J6",
    },
  });
  const est = await api("POST", "/api/documents", {
    cookie,
    body: {
      kind: "estimation",
      clientId: alexClient.body.client.id,
      taxesEnabled: true,
      depositCents: 20000,
      lines: [{ description: "TEST Square — ne pas payer", quantity: 1, unitPriceCents: 107400 }],
    },
  });
  estimateDocId = est.body.document.id;
  // La conversion en facture (et donc l'envoi auto vers Square) est faite dans
  // un test ci-dessous pour pouvoir en vérifier la séquence d'appels.
});

afterAll(() => setSquareFetchForTests(null));

describe("synchronisation Square — sortante", () => {
  it("envoie une estimation en BROUILLON Square (créée, jamais publiée)", async () => {
    const res = await api("POST", `/api/documents/${estimateDocId}/square`, { cookie });
    expect(res.status).toBe(201);
    expect(res.body.square.status).toBe("DRAFT");
    expect(res.body.square.publicUrl).toBeNull();
    // Aucune publication pour une estimation
    const publishCalls = squareCalls.filter((c) => c.path.endsWith("/publish"));
    expect(publishCalls).toHaveLength(0);
  });

  it("convertir en facture l'envoie AUTOMATIQUEMENT vers Square (publiée)", async () => {
    squareCalls.length = 0;
    const conv = await api("POST", `/api/documents/${estimateDocId}/convert`, { cookie });
    expect(conv.status).toBe(201);
    expect(conv.body.squareError ?? null).toBeNull();
    invoiceDocId = conv.body.document.id;
    invoiceSquareId = conv.body.document.squareInvoiceId;
    expect(invoiceSquareId).toBeTruthy();
    expect(conv.body.document.squarePaymentStatus).toBe("UNPAID");

    // Séquence d'appels conforme au flux Square (client réutilisé)
    const paths = squareCalls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toContain("POST /v2/orders");
    expect(paths).toContain("POST /v2/invoices");
    expect(paths).toContain(`POST /v2/invoices/${invoiceSquareId}/publish`);

    // La commande porte les taxes TPS/TVQ en pourcentage
    const order = squareCalls.find((c) => c.path === "/v2/orders")!.body.order;
    expect(order.taxes).toEqual([
      { name: "TPS", percentage: "5", scope: "ORDER" },
      { name: "TVQ", percentage: "9.975", scope: "ORDER" },
    ]);
    // L'acompte devient une demande de paiement DEPOSIT
    const invoice = squareCalls.filter((c) => c.path === "/v2/invoices").pop()!.body.invoice;
    expect(invoice.payment_requests[0].request_type).toBe("DEPOSIT");
    expect(invoice.payment_requests[0].fixed_amount_requested_money.amount).toBe(20000);
    expect(invoice.delivery_method).toBe("SHARE_MANUALLY");
  });

  it("refuse un double envoi (facture déjà dans Square)", async () => {
    const res = await api("POST", `/api/documents/${invoiceDocId}/square`, { cookie });
    expect(res.status).toBe(409);
  });
});

describe("synchronisation Square — entrante (webhook)", () => {
  const NOTIFICATION_URL = "https://mainappsav.netlify.app/api/webhooks/square";
  const SIGNATURE_KEY = "cle-webhook-de-test";

  // Charge utile conforme à la documentation Square (invoice.payment_made).
  // invoiceSquareId est rempli par le test d'envoi de la facture ci-dessus.
  const paymentEvent = () => ({
    merchant_id: "ML5SSNY97FR20",
    type: "invoice.payment_made",
    event_id: "e7d90c05-0000-4000-8000-000000000001",
    created_at: new Date().toISOString(),
    data: {
      type: "invoice",
      id: invoiceSquareId,
      object: {
        invoice: {
          id: invoiceSquareId,
          version: 3,
          status: "PAID",
          invoice_number: "FAC-2026-0001",
        },
      },
    },
  });

  function signedRequest(body: string, signature?: string): Request {
    return new Request(NOTIFICATION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-square-hmacsha256-signature":
          signature ??
          createHmac("sha256", SIGNATURE_KEY).update(NOTIFICATION_URL + body).digest("base64"),
      },
      body,
    });
  }

  it("vérifie la signature HMAC selon la spécification Square", () => {
    const body = JSON.stringify(paymentEvent());
    const good = createHmac("sha256", SIGNATURE_KEY).update(NOTIFICATION_URL + body).digest("base64");
    expect(verifySquareSignature(NOTIFICATION_URL, body, good, SIGNATURE_KEY)).toBe(true);
    expect(verifySquareSignature(NOTIFICATION_URL, body, "fausse-signature", SIGNATURE_KEY)).toBe(false);
    expect(verifySquareSignature(NOTIFICATION_URL, body, null, SIGNATURE_KEY)).toBe(false);
  });

  it("rejette un webhook mal signé (401)", async () => {
    const res = await handleApiRequest(signedRequest(JSON.stringify(paymentEvent()), "signature-invalide"));
    expect(res.status).toBe(401);
  });

  it("statut AVANT paiement : « à payer »", async () => {
    const doc = await api("GET", `/api/documents/${invoiceDocId}`, { cookie });
    expect(doc.body.document.status).toBe("à payer");
  });

  it("webhook invoice.payment_made signé → statut « payée » + notification", async () => {
    const res = await handleApiRequest(signedRequest(JSON.stringify(paymentEvent())));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.processed).toBe(true);
    expect(result.detail).toContain("→ payée");

    const doc = await api("GET", `/api/documents/${invoiceDocId}`, { cookie });
    expect(doc.body.document.status).toBe("payée");
    expect(doc.body.document.squarePaymentStatus).toBe("PAID");

    const notifs = await api("GET", "/api/notifications", { cookie });
    expect(notifs.body.notifications.some((n: any) => n.kind === "paiement")).toBe(true);
  });

  it("rejoue le même event_id sans double traitement (idempotence)", async () => {
    const res = await handleApiRequest(signedRequest(JSON.stringify(paymentEvent())));
    const result = await res.json();
    expect(result.processed).toBe(false);
    expect(result.detail).toContain("idempotence");
  });

  it("la synchronisation manuelle interroge Square et applique le statut", async () => {
    const res = await api("POST", `/api/documents/${invoiceDocId}/square/sync`, { cookie });
    expect(res.status).toBe(200);
    expect(res.body.square.squareStatus).toBe("PAID");
  });

  // Le webhook payment.* enregistre l'encaissement comme revenu en temps réel.
  const paymentMadeEvent = {
    type: "payment.created",
    event_id: "e7d90c05-0000-4000-8000-0000000000pay",
    created_at: new Date().toISOString(),
    data: {
      type: "payment",
      id: "PAY_WEBHOOK_1",
      object: {
        payment: {
          id: "PAY_WEBHOOK_1",
          status: "COMPLETED",
          amount_money: { amount: 20000, currency: "CAD" },
          created_at: "2026-07-01T12:00:00Z",
          note: "Acompte via webhook",
        },
      },
    },
  };

  it("webhook payment.created signé → revenu Square enregistré", async () => {
    const res = await handleApiRequest(signedRequest(JSON.stringify(paymentMadeEvent)));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.processed).toBe(true);

    const revenus = await api("GET", "/api/revenues", { cookie });
    const revenu = revenus.body.revenus.find((r: any) => r.source === "square" && r.amountCents === 20000);
    expect(revenu).toBeDefined();
  });

  it("rejoue le même paiement sans double revenu (idempotence)", async () => {
    const res = await handleApiRequest(signedRequest(JSON.stringify(paymentMadeEvent)));
    const result = await res.json();
    expect(result.processed).toBe(false);
    const revenus = await api("GET", "/api/revenues", { cookie });
    const count = revenus.body.revenus.filter((r: any) => r.amountCents === 20000 && r.source === "square").length;
    expect(count).toBe(1);
  });

  it("ignore proprement un type d'événement non géré", async () => {
    const other = {
      type: "customer.created",
      event_id: "e7d90c05-0000-4000-8000-0000000000cus",
      data: { type: "customer", object: {} },
    };
    const res = await handleApiRequest(signedRequest(JSON.stringify(other)));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.processed).toBe(false);
    expect(result.detail).toContain("ignoré");
  });
});
