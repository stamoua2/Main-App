// Critère 5 — estimations/factures : totaux avec taxes activées ET
// désactivées, acompte, conversion estimation → facture, génération PDF.

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let clientId: number;

const LINES = [
  { description: "Forfait Essentiel — 3 visites par saison", quantity: 1, unitPriceCents: 44900 },
  { description: "Aération du sol", quantity: 1, unitPriceCents: 13500 },
  { description: "Sursemis (semence premium)", quantity: 2, unitPriceCents: 9500 },
];
// Sous-total attendu : 449,00 + 135,00 + 190,00 = 774,00 $

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
  const clients = await api("GET", "/api/clients", { cookie });
  clientId = clients.body.clients[0].id;
});

describe("estimations et factures", () => {
  it("crée une estimation SANS taxes (configuration par défaut)", async () => {
    const res = await api("POST", "/api/documents", {
      cookie,
      body: { kind: "estimation", clientId, lines: LINES, depositCents: 20000 },
    });
    expect(res.status).toBe(201);
    const d = res.body.document;
    expect(d.number).toMatch(/^EST-\d{4}-0001$/);
    expect(d.issuedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.taxesEnabled).toBe(false);
    expect(d.subtotalCents).toBe(77400);
    expect(d.tpsCents).toBe(0);
    expect(d.tvqCents).toBe(0);
    expect(d.totalCents).toBe(77400);
    expect(d.depositCents).toBe(20000);
    expect(d.balanceCents).toBe(57400);
  });

  it("crée une estimation AVEC taxes TPS/TVQ", async () => {
    const res = await api("POST", "/api/documents", {
      cookie,
      body: { kind: "estimation", clientId, taxesEnabled: true, lines: LINES, depositCents: 20000 },
    });
    expect(res.status).toBe(201);
    const d = res.body.document;
    expect(d.taxesEnabled).toBe(true);
    expect(d.subtotalCents).toBe(77400);
    expect(d.tpsCents).toBe(3870);   // 774,00 × 5 % = 38,70 $
    expect(d.tvqCents).toBe(7721);   // 774,00 × 9,975 % = 77,2065 → 77,21 $
    expect(d.totalCents).toBe(88991); // 889,91 $
    expect(d.balanceCents).toBe(68991);
  });

  it("respecte la configuration d'entreprise quand taxesEnabled n'est pas fourni", async () => {
    await api("PUT", "/api/settings", { cookie, body: { taxesEnabled: true } });
    const res = await api("POST", "/api/documents", {
      cookie,
      body: { kind: "estimation", clientId, lines: [{ description: "Test", quantity: 1, unitPriceCents: 10000 }] },
    });
    expect(res.body.document.taxesEnabled).toBe(true);
    expect(res.body.document.tpsCents).toBe(500);
    await api("PUT", "/api/settings", { cookie, body: { taxesEnabled: false } });
  });

  it("convertit une estimation en facture (mêmes lignes et totaux)", async () => {
    const est = await api("POST", "/api/documents", {
      cookie,
      body: { kind: "estimation", clientId, taxesEnabled: true, lines: LINES, depositCents: 20000 },
    });
    const converted = await api("POST", `/api/documents/${est.body.document.id}/convert`, { cookie });
    expect(converted.status).toBe(201);
    const invoice = converted.body.document;
    expect(invoice.kind).toBe("facture");
    expect(invoice.number).toMatch(/^FAC-\d{4}-\d{4}$/);
    expect(invoice.convertedFromId).toBe(est.body.document.id);
    expect(invoice.totalCents).toBe(est.body.document.totalCents);
    expect(invoice.lines).toHaveLength(LINES.length);

    // L'estimation d'origine passe au statut « acceptée »
    const original = await api("GET", `/api/documents/${est.body.document.id}`, { cookie });
    expect(original.body.document.status).toBe("acceptée");
  });

  it("refuse de convertir une facture", async () => {
    const invoices = await api("GET", "/api/documents?type=facture", { cookie });
    const res = await api("POST", `/api/documents/${invoices.body.documents[0].id}/convert`, { cookie });
    expect(res.status).toBe(400);
  });

  it("génère un PDF d'estimation valide", async () => {
    const docs = await api("GET", "/api/documents?type=estimation", { cookie });
    const id = docs.body.documents[0].id;
    const res = await api("GET", `/api/documents/${id}/pdf`, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await res.raw.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(2000);
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 8));
    expect(head.startsWith("%PDF-")).toBe(true);
  });

  it("génère un PDF de facture valide", async () => {
    const docs = await api("GET", "/api/documents?type=facture", { cookie });
    const id = docs.body.documents[0].id;
    const res = await api("GET", `/api/documents/${id}/pdf`, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("empêche la suppression d'un client ayant des documents", async () => {
    const res = await api("DELETE", `/api/clients/${clientId}`, { cookie });
    expect(res.status).toBe(409);
  });
});
