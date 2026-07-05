// Critère 9 (PRD) / 3 (passe 3) — inventaire : ajout manuel, sortie de stock,
// commandes fournisseurs (réception → stock incrémenté).

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let itemId: number;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
});

describe("catalogue OJ Compagnie", () => {
  it("charge tout le catalogue (source « oj ») au seed, avec les bons prix", async () => {
    const { OJ_CATALOG } = await import("../server/oj-catalog.js");
    const res = await api("GET", "/api/inventory?source=oj", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.comptes.oj).toBe(OJ_CATALOG.length);
    const fiesta = res.body.produits.find((p: any) => p.name === "Fiesta" && p.format === "2 x 10 L");
    expect(fiesta.costCents).toBe(18400); // 184,00 $ au catalogue 2026
    expect(fiesta.category).toBe("Herbicides");
  });

  it("le réimport est idempotent (aucun doublon)", async () => {
    const { OJ_CATALOG } = await import("../server/oj-catalog.js");
    const res = await api("POST", "/api/inventory/import-oj", { cookie });
    expect(res.body.importe.inserted).toBe(0);
    expect(res.body.importe.updated).toBe(OJ_CATALOG.length);
    const after = await api("GET", "/api/inventory?source=oj", { cookie });
    expect(after.body.comptes.oj).toBe(OJ_CATALOG.length);
  });
});

describe("inventaire", () => {
  it("ajoute un produit manuel hors catalogue", async () => {
    const res = await api("POST", "/api/inventory", {
      cookie,
      body: {
        name: "Semence à gazon premium (mélange soleil)",
        category: "Semences",
        format: "Sac 25 kg",
        unit: "sac",
        quantity: 10,
        costCents: 8999,
        notes: "Produit hors catalogue OJ, acheté localement.",
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.produit.source).toBe("manuel");
    expect(res.body.produit.quantity).toBe(10);
    itemId = res.body.produit.id;
  });

  it("effectue une sortie de stock et décrémente la quantité", async () => {
    const before = await api("GET", "/api/inventory", { cookie });
    const avant = before.body.produits.find((p: any) => p.id === itemId).quantity;
    expect(avant).toBe(10);

    const res = await api("POST", `/api/inventory/${itemId}/movement`, {
      cookie,
      body: { delta: -3, reason: "Visite chez Denis Ouellet — sursemis" },
    });
    expect(res.status).toBe(200);
    expect(res.body.quantiteAvant).toBe(10);
    expect(res.body.quantiteApres).toBe(7);

    const after = await api("GET", "/api/inventory", { cookie });
    expect(after.body.produits.find((p: any) => p.id === itemId).quantity).toBe(7);

    const movements = await api("GET", `/api/inventory/${itemId}/movements`, { cookie });
    expect(Number(movements.body.mouvements[0].delta)).toBe(-3);
  });

  it("refuse une sortie dépassant le stock", async () => {
    const res = await api("POST", `/api/inventory/${itemId}/movement`, {
      cookie,
      body: { delta: -999, reason: "erreur" },
    });
    expect(res.status).toBe(400);
    expect(res.body.erreur).toContain("Stock insuffisant");
  });

  it("recherche dans l'inventaire", async () => {
    const res = await api("GET", "/api/inventory?q=semence", { cookie });
    expect(res.body.produits.some((p: any) => p.id === itemId)).toBe(true);
  });
});

describe("commandes fournisseurs", () => {
  it("crée une commande et la réception incrémente le stock", async () => {
    const order = await api("POST", "/api/orders", {
      cookie,
      body: {
        supplier: "OJ Compagnie",
        notes: "Réapprovisionnement de mi-saison",
        lines: [
          { itemId, description: "Semence à gazon premium", quantity: 5, unitCostCents: 8500 },
          { description: "Produit non suivi en stock", quantity: 1, unitCostCents: 12000 },
        ],
      },
    });
    expect(order.status).toBe(201);
    // Sous-total 545 $ + livraison 45 $ (défaut) = 590 $, puis TPS 5 % et
    // TVQ 9,975 % sur le tout : 590 + 29,50 + 58,85 = 678,35 $.
    const sousTotal = 5 * 8500 + 12000;
    const taxable = sousTotal + 4500;
    expect(order.body.commande.totalCents).toBe(
      taxable + Math.round(taxable * 0.05) + Math.round(taxable * 0.09975),
    );

    const received = await api("POST", `/api/orders/${order.body.commande.id}/receive`, { cookie });
    expect(received.status).toBe(200);
    expect(received.body.stockIncremente).toEqual([{ itemId, delta: 5 }]);

    const inventory = await api("GET", "/api/inventory", { cookie });
    expect(inventory.body.produits.find((p: any) => p.id === itemId).quantity).toBe(12); // 7 + 5

    const again = await api("POST", `/api/orders/${order.body.commande.id}/receive`, { cookie });
    expect(again.status).toBe(409);
  });
});
