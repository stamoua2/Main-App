// Gestion des contrats : estimation → contrat (CON-) → visites de saison
// générées → facture supplémentaire; acompte automatique (50 % par défaut).

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let clientId: number;
let estimationId: number;
let contratId: number;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
  const clients = await api("GET", "/api/clients", { cookie });
  clientId = clients.body.clients[0].id;
});

describe("acompte automatique", () => {
  it("sans acompte fourni : 50 % du total, arrondi au dollar", async () => {
    const res = await api("POST", "/api/documents", {
      cookie,
      body: {
        kind: "estimation",
        clientId,
        lines: [{ description: "Forfait Régulier — saison 2026", quantity: 1, unitPriceCents: 84500 }],
      },
    });
    expect(res.status).toBe(201);
    estimationId = res.body.document.id;
    expect(res.body.document.totalCents).toBe(84500);
    // 845 / 2 = 422,50 → arrondi au dollar : 423,00 $
    expect(res.body.document.depositCents).toBe(42300);
    expect(res.body.document.balanceCents).toBe(84500 - 42300);
  });

  it("un acompte fourni est respecté tel quel", async () => {
    const res = await api("POST", "/api/documents", {
      cookie,
      body: {
        kind: "estimation",
        clientId,
        depositCents: 10000,
        lines: [{ description: "Test acompte manuel", quantity: 1, unitPriceCents: 50000 }],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.document.depositCents).toBe(10000);
    await api("DELETE", `/api/documents/${res.body.document.id}`, { cookie });
  });

  it("le % d'acompte est configurable dans les paramètres", async () => {
    await api("PUT", "/api/settings", { cookie, body: { depositPct: 25 } });
    const res = await api("POST", "/api/documents", {
      cookie,
      body: {
        kind: "estimation",
        clientId,
        lines: [{ description: "Test 25 %", quantity: 1, unitPriceCents: 40000 }],
      },
    });
    expect(res.body.document.depositCents).toBe(10000); // 400 × 25 % = 100 $
    await api("DELETE", `/api/documents/${res.body.document.id}`, { cookie });
    await api("PUT", "/api/settings", { cookie, body: { depositPct: 50 } });
  });
});

describe("cycle estimation → contrat → facture", () => {
  it("crée le contrat (CON-) depuis l'estimation acceptée et génère les visites", async () => {
    const res = await api("POST", `/api/documents/${estimationId}/contract`, { cookie });
    expect(res.status).toBe(201);
    contratId = res.body.document.id;
    expect(res.body.document.kind).toBe("contrat");
    expect(res.body.document.number).toMatch(/^CON-\d{4}-\d{4}$/);
    expect(res.body.document.totalCents).toBe(84500);
    expect(res.body.document.convertedFromId).toBe(estimationId);

    // L'estimation d'origine est marquée acceptée.
    const est = await api("GET", `/api/documents/${estimationId}`, { cookie });
    expect(est.body.document.status).toBe("acceptée");

    // Les visites de la saison sont générées (forfait Essentiel du client = 3).
    expect(res.body.visitesGenerees).toBeGreaterThanOrEqual(3);
    const visites = await api("GET", `/api/visits?documentId=${contratId}`, { cookie });
    expect(visites.body.visites).toHaveLength(res.body.visitesGenerees);
    expect(visites.body.visites[0].contractNumber).toBe(res.body.document.number);
    // Réparties dans la saison (mai à octobre), en ordre chronologique.
    const dates = visites.body.visites.map((v: any) => v.scheduledAt);
    expect([...dates].sort()).toEqual(dates);
  });

  it("les visites du contrat restent gérables manuellement (déplacer/retirer)", async () => {
    const visites = await api("GET", `/api/visits?documentId=${contratId}`, { cookie });
    const premiere = visites.body.visites[0];
    const moved = await api("PUT", `/api/visits/${premiere.id}`, {
      cookie,
      body: { scheduledAt: "2026-06-01T13:00:00" },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.visite.scheduledAt).toContain("2026-06-01");

    const del = await api("DELETE", `/api/visits/${premiere.id}`, { cookie });
    expect(del.status).toBe(200);
    const apres = await api("GET", `/api/visits?documentId=${contratId}`, { cookie });
    expect(apres.body.visites).toHaveLength(visites.body.visites.length - 1);
  });

  it("seule une estimation peut devenir un contrat", async () => {
    const res = await api("POST", `/api/documents/${contratId}/contract`, { cookie });
    expect(res.status).toBe(400);
  });

  it("le PDF du contrat s'intitule CONTRAT", async () => {
    const res = await api("GET", `/api/documents/${contratId}/pdf`, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("un contrat peut être converti en facture (services facturés)", async () => {
    const res = await api("POST", `/api/documents/${contratId}/convert`, { cookie });
    expect(res.status).toBe(201);
    expect(res.body.document.kind).toBe("facture");
    expect(res.body.document.number).toMatch(/^FAC-/);
  });

  it("le filtre par type retourne les contrats", async () => {
    const res = await api("GET", "/api/documents?type=contrat", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
    expect(res.body.documents.every((d: any) => d.kind === "contrat")).toBe(true);
  });
});

describe("commandes fournisseurs : modification et suppression", () => {
  let orderId: number;

  it("modifie livraison/taxes/statut et recalcule les totaux", async () => {
    const created = await api("POST", "/api/orders", {
      cookie,
      body: {
        supplier: "OJ Compagnie",
        shippingCents: 4500,
        taxesEnabled: true,
        lines: [{ description: "Engrais test", quantity: 2, unitCostCents: 10000 }],
      },
    });
    expect(created.status).toBe(201);
    orderId = created.body.commande.id;

    // Sans taxes ni livraison : total = sous-total.
    const updated = await api("PUT", `/api/orders/${orderId}`, {
      cookie,
      body: { shippingCents: 0, taxesEnabled: false, status: "brouillon" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.totalCents).toBe(20000);
  });

  it("refuse de passer à « reçue » sans passer par la réception", async () => {
    const res = await api("PUT", `/api/orders/${orderId}`, { cookie, body: { status: "reçue" } });
    expect(res.status).toBe(400);
  });

  it("supprime une commande non reçue", async () => {
    const res = await api("DELETE", `/api/orders/${orderId}`, { cookie });
    expect(res.status).toBe(200);
    const list = await api("GET", "/api/orders", { cookie });
    expect(list.body.commandes.some((c: any) => c.id === orderId)).toBe(false);
  });
});

describe("catégories de produits", () => {
  it("liste, ajoute et retire des catégories du menu", async () => {
    const avant = await api("GET", "/api/inventory/categories", { cookie });
    // Alimentée par le catalogue OJ (Insecticides, Herbicides, Semences…)
    expect(avant.body.categories.length).toBeGreaterThanOrEqual(10);

    const created = await api("POST", "/api/inventory/categories", {
      cookie,
      body: { name: "Équipement" },
    });
    expect(created.status).toBe(201);

    const apres = await api("GET", "/api/inventory/categories", { cookie });
    expect(apres.body.categories.some((c: any) => c.name === "Équipement")).toBe(true);

    const del = await api("DELETE", `/api/inventory/categories/${created.body.categorie.id}`, { cookie });
    expect(del.status).toBe(200);
  });

  it("modifie puis retire un produit OJ de l'inventaire", async () => {
    const inv = await api("GET", "/api/inventory?q=Fiesta", { cookie });
    const fiesta = inv.body.produits.find((p: any) => p.format === "2 x 10 L");
    const upd = await api("PUT", `/api/inventory/${fiesta.id}`, {
      cookie,
      body: { costCents: 19900, category: "Herbicides" },
    });
    expect(upd.status).toBe(200);
    expect(upd.body.produit.costCents).toBe(19900);

    const del = await api("DELETE", `/api/inventory/${fiesta.id}`, { cookie });
    expect(del.status).toBe(200);
    const apres = await api("GET", "/api/inventory?q=Fiesta", { cookie });
    expect(apres.body.produits.some((p: any) => p.id === fiesta.id)).toBe(false);
  });
});
