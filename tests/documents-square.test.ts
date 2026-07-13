// Répercussion des modifications de documents dans Square :
//  - suppression d'un document → retrait de la facture Square (delete/cancel);
//  - refus d'une estimation → retrait de la facture Square + statut « refusée »;
//  - modification d'un document lié → ancienne facture retirée puis recréée.
// L'API Square est simulée par un magasin de factures en mémoire qui suit les
// statuts (DRAFT → publiée → annulée) comme le fait Square.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setSquareFetchForTests } from "../server/square.js";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let clientId: number;
const calls: { method: string; path: string }[] = [];
const invoices = new Map<string, { id: string; version: number; status: string; number?: string }>();
let counter = 0;

function fakeSquareFetch(): typeof fetch {
  return (async (input: any, init?: any) => {
    const url = String(input);
    const path = url.replace("https://connect.squareup.com", "");
    const method = init?.method ?? "GET";
    calls.push({ method, path });
    const respond = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

    if (path === "/v2/locations") {
      return respond({ locations: [{ id: "LTEST", status: "ACTIVE", currency: "CAD" }] });
    }
    if (path === "/v2/customers" && method === "POST") return respond({ customer: { id: "CUST_1" } });
    if (path === "/v2/orders" && method === "POST") {
      return respond({ order: { id: `ORD_${++counter}`, total_money: { amount: 10000, currency: "CAD" } } });
    }
    if (path === "/v2/invoices" && method === "POST") {
      const id = `inv:TEST-${String(++counter).padStart(4, "0")}`;
      const number = JSON.parse(init?.body ?? "{}")?.invoice?.invoice_number as string | undefined;
      invoices.set(id, { id, version: 0, status: "DRAFT", number });
      return respond({ invoice: invoices.get(id) });
    }
    const publish = path.match(/^\/v2\/invoices\/(.+)\/publish$/);
    if (publish) {
      const id = decodeURIComponent(publish[1]);
      const inv = invoices.get(id)!;
      inv.status = "UNPAID";
      inv.version = 1;
      return respond({ invoice: { ...inv, public_url: "https://squareup.com/pay-invoice/x" } });
    }
    const cancel = path.match(/^\/v2\/invoices\/(.+)\/cancel$/);
    if (cancel && method === "POST") {
      const id = decodeURIComponent(cancel[1]);
      const inv = invoices.get(id)!;
      inv.status = "CANCELED";
      inv.version += 1;
      return respond({ invoice: inv });
    }
    const byId = path.match(/^\/v2\/invoices\/([^/?]+)(\?.*)?$/);
    if (byId && method === "GET") {
      const inv = invoices.get(decodeURIComponent(byId[1]));
      return inv ? respond({ invoice: inv }) : respond({ errors: [{ code: "NOT_FOUND" }] }, 404);
    }
    if (byId && method === "DELETE") {
      invoices.delete(decodeURIComponent(byId[1]));
      return respond({});
    }
    return respond({ errors: [{ code: "NOT_FOUND", detail: `non simulé : ${method} ${path}` }] }, 404);
  }) as typeof fetch;
}

async function creerEstimation(unitPriceCents = 100000) {
  const est = await api("POST", "/api/documents", {
    cookie,
    body: {
      kind: "estimation",
      clientId,
      taxesEnabled: false,
      depositCents: 0,
      lines: [{ description: "TEST — ne pas payer", quantity: 1, unitPriceCents }],
    },
  });
  return est.body.document.id as number;
}

beforeAll(async () => {
  await freshSeededDb();
  setSquareFetchForTests(fakeSquareFetch());
  cookie = await login(ALEX.email, ALEX.password);
  const c = await api("POST", "/api/clients", {
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
  clientId = c.body.client.id;
});

afterAll(() => setSquareFetchForTests(null));

describe("Square — répercussion des changements de documents", () => {
  it("refuser une estimation retire son BROUILLON de Square et passe en « refusée »", async () => {
    const id = await creerEstimation();
    const push = await api("POST", `/api/documents/${id}/square`, { cookie });
    const invId = push.body.square.squareInvoiceId;
    expect(invoices.has(invId)).toBe(true);

    calls.length = 0;
    const res = await api("POST", `/api/documents/${id}/refuse`, { cookie });
    expect(res.status).toBe(200);
    expect(res.body.document.status).toBe("refusée");
    // Le lien Square est effacé et la facture (brouillon) supprimée côté Square.
    expect(res.body.document.squareInvoiceId).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(invoices.has(invId)).toBe(false);
  });

  it("refuser n'accepte que les estimations", async () => {
    const id = await creerEstimation();
    const conv = await api("POST", `/api/documents/${id}/convert`, { cookie });
    const res = await api("POST", `/api/documents/${conv.body.document.id}/refuse`, { cookie });
    expect(res.status).toBe(400);
  });

  it("supprimer un document lié annule/supprime aussi la facture Square", async () => {
    const id = await creerEstimation();
    const push = await api("POST", `/api/documents/${id}/square`, { cookie });
    const invId = push.body.square.squareInvoiceId;

    const res = await api("DELETE", `/api/documents/${id}`, { cookie });
    expect(res.status).toBe(200);
    expect(invoices.has(invId)).toBe(false);
    // Document réellement supprimé
    const get = await api("GET", `/api/documents/${id}`, { cookie });
    expect(get.status).toBe(404);
  });

  it("supprimer une facture PUBLIÉE l'annule dans Square (cancel)", async () => {
    const id = await creerEstimation();
    // La conversion envoie automatiquement la facture (publiée) vers Square.
    const conv = await api("POST", `/api/documents/${id}/convert`, { cookie });
    const invoiceDocId = conv.body.document.id;
    const invId = conv.body.document.squareInvoiceId;
    expect(invId).toBeTruthy();
    expect(invoices.get(invId)?.status).toBe("UNPAID");

    calls.length = 0;
    await api("DELETE", `/api/documents/${invoiceDocId}`, { cookie });
    expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(true);
    expect(invoices.get(invId)?.status).toBe("CANCELED");
  });

  it("supprimer un document SANS Square n'appelle pas Square", async () => {
    const id = await creerEstimation();
    calls.length = 0;
    const res = await api("DELETE", `/api/documents/${id}`, { cookie });
    expect(res.status).toBe(200);
    expect(calls.length).toBe(0);
  });

  it("modifier un document lié recrée la facture Square avec les nouveaux montants", async () => {
    const id = await creerEstimation(100000);
    const push = await api("POST", `/api/documents/${id}/square`, { cookie });
    const ancienInvId = push.body.square.squareInvoiceId;

    const res = await api("PUT", `/api/documents/${id}`, {
      cookie,
      body: {
        taxesEnabled: false,
        depositCents: 0,
        notes: "Montant révisé",
        lines: [{ description: "Service révisé", quantity: 2, unitPriceCents: 75000 }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.squareResynced).toBe(true);
    // Totaux recalculés (2 × 750 $ = 1500 $)
    expect(res.body.document.subtotalCents).toBe(150000);
    expect(res.body.document.notes).toBe("Montant révisé");
    // Nouvelle facture Square, l'ancienne a été retirée
    const nouvelInvId = res.body.document.squareInvoiceId;
    expect(nouvelInvId).not.toBe(ancienInvId);
    expect(invoices.has(ancienInvId)).toBe(false);
    expect(invoices.has(nouvelInvId)).toBe(true);
  });

  it("un ré-envoi Square utilise un invoice_number unique (suffixe -R2)", async () => {
    const id = await creerEstimation(100000);
    const push1 = await api("POST", `/api/documents/${id}/square`, { cookie });
    const inv1 = push1.body.square.squareInvoiceId;
    const numero1 = invoices.get(inv1)?.number;
    expect(numero1).toBeTruthy();

    // Modification → l'ancienne facture Square est retirée puis recréée : le
    // nouvel invoice_number doit différer (suffixe) pour ne pas heurter Square.
    const res = await api("PUT", `/api/documents/${id}`, {
      cookie,
      body: {
        taxesEnabled: false,
        depositCents: 0,
        notes: "Révision",
        lines: [{ description: "Service révisé", quantity: 1, unitPriceCents: 120000 }],
      },
    });
    const inv2 = res.body.document.squareInvoiceId;
    const numero2 = invoices.get(inv2)?.number;
    expect(numero2).toBe(`${numero1}-R2`);
  });

  it("refuse de modifier un document payé", async () => {
    const id = await creerEstimation();
    // Conversion → facture envoyée automatiquement vers Square.
    const conv = await api("POST", `/api/documents/${id}/convert`, { cookie });
    const facId = conv.body.document.id;
    const invId = conv.body.document.squareInvoiceId;
    // Simule un paiement complet côté Square puis synchronise.
    invoices.get(invId)!.status = "PAID";
    await api("POST", `/api/documents/${facId}/square/sync`, { cookie });
    const doc = await api("GET", `/api/documents/${facId}`, { cookie });
    expect(doc.body.document.status).toBe("payée");

    const res = await api("PUT", `/api/documents/${facId}`, {
      cookie,
      body: { lines: [{ description: "x", quantity: 1, unitPriceCents: 100 }] },
    });
    expect(res.status).toBe(400);
  });
});
