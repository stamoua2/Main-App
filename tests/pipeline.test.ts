// Pipeline de vente : regroupement des documents par étape du cycle.
// Vérifie que chaque document tombe dans la bonne colonne et qu'une estimation
// acceptée (convertie) n'est pas comptée deux fois.

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let clientId: number;

async function creerEstimation(unitPriceCents = 50000) {
  const est = await api("POST", "/api/documents", {
    cookie,
    body: {
      kind: "estimation",
      clientId,
      taxesEnabled: false,
      depositCents: 0,
      lines: [{ description: "Service test", quantity: 1, unitPriceCents }],
    },
  });
  return est.body.document.id as number;
}

function etape(body: any, cle: string) {
  return body.stages.find((s: any) => s.cle === cle);
}

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
  const c = await api("POST", "/api/clients", {
    cookie,
    body: {
      firstName: "Test",
      lastName: "Pipeline",
      email: "",
      addressLine: "1 rue Test",
      city: "L'Ange-Gardien",
      postalCode: "J8L 3J6",
    },
  });
  clientId = c.body.client.id;
});

describe("pipeline de vente", () => {
  it("place une estimation brouillon dans l'étape « Estimations »", async () => {
    const id = await creerEstimation(50000);
    const res = await api("GET", "/api/pipeline", { cookie });
    expect(res.status).toBe(200);
    const est = etape(res.body, "estimation");
    expect(est.deals.some((d: any) => d.id === id)).toBe(true);
    expect(est.count).toBeGreaterThanOrEqual(1);
    expect(est.totalCents).toBeGreaterThanOrEqual(50000);
  });

  it("une estimation refusée va dans « Refusé » et non dans « Estimations »", async () => {
    const id = await creerEstimation(30000);
    await api("POST", `/api/documents/${id}/refuse`, { cookie });
    const res = await api("GET", "/api/pipeline", { cookie });
    expect(etape(res.body, "perdu").deals.some((d: any) => d.id === id)).toBe(true);
    expect(etape(res.body, "estimation").deals.some((d: any) => d.id === id)).toBe(false);
  });

  it("convertir déplace le suivi vers « Factures à payer » sans compter deux fois l'estimation", async () => {
    const id = await creerEstimation(70000);
    const conv = await api("POST", `/api/documents/${id}/convert`, { cookie });
    const factureId = conv.body.document.id;
    const res = await api("GET", "/api/pipeline", { cookie });
    // L'estimation acceptée disparaît des « Estimations » (représentée par sa suite).
    expect(etape(res.body, "estimation").deals.some((d: any) => d.id === id)).toBe(false);
    // La facture apparaît dans « Factures à payer ».
    expect(etape(res.body, "facture").deals.some((d: any) => d.id === factureId)).toBe(true);
  });
});
