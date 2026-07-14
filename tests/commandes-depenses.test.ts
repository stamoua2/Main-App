// Commandes fournisseurs comptabilisées en dépenses : une commande passée crée
// une dépense liée (catégorie « Fournisseurs »), synchronisée à la modification
// et retirée à l'annulation/suppression de la commande.

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

async function depenses() {
  const r = await api("GET", "/api/expenses", { cookie });
  return r.body.depenses as any[];
}

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
});

describe("commandes fournisseurs → dépenses", () => {
  it("une commande passée crée une dépense liée du même montant", async () => {
    const res = await api("POST", "/api/orders", {
      cookie,
      body: {
        supplier: "OJ Compagnie",
        shippingCents: 0,
        taxesEnabled: false,
        notes: "",
        lines: [{ description: "Engrais 32-0-4", quantity: 2, unitCostCents: 5000 }],
      },
    });
    expect(res.status).toBe(201);
    const orderId = res.body.commande.id;
    expect(res.body.commande.totalCents).toBe(10000);

    const dep = (await depenses()).find((d) => d.supplierOrderId === orderId);
    expect(dep).toBeTruthy();
    expect(dep.amountCents).toBe(10000);
    expect(dep.category).toBe("Fournisseurs");
    expect(dep.label).toContain("OJ Compagnie");
  });

  it("compte la dépense de la commande dans le rapport de marges", async () => {
    const auj = new Date().toISOString().slice(0, 10);
    const res = await api("GET", `/api/finances/report?du=${auj}&au=${auj}`, { cookie });
    expect(res.body.couts.depenses).toBeGreaterThanOrEqual(10000);
    const cats = Object.fromEntries(res.body.couts.parCategorie.map((c: any) => [c.category, c.total]));
    expect(cats["Fournisseurs"]).toBeGreaterThanOrEqual(10000);
  });

  it("actualise la dépense quand la livraison change", async () => {
    const res = await api("POST", "/api/orders", {
      cookie,
      body: { supplier: "Fournisseur B", shippingCents: 0, taxesEnabled: false, lines: [{ description: "X", quantity: 1, unitCostCents: 8000 }] },
    });
    const orderId = res.body.commande.id;
    await api("PUT", `/api/orders/${orderId}`, { cookie, body: { shippingCents: 4500 } });
    const dep = (await depenses()).find((d) => d.supplierOrderId === orderId);
    expect(dep.amountCents).toBe(12500); // 8000 + 4500 de livraison
  });

  it("retire la dépense quand la commande est annulée", async () => {
    const res = await api("POST", "/api/orders", {
      cookie,
      body: { supplier: "Fournisseur C", shippingCents: 0, taxesEnabled: false, lines: [{ description: "Y", quantity: 1, unitCostCents: 3000 }] },
    });
    const orderId = res.body.commande.id;
    expect((await depenses()).some((d) => d.supplierOrderId === orderId)).toBe(true);
    await api("PUT", `/api/orders/${orderId}`, { cookie, body: { status: "annulée" } });
    expect((await depenses()).some((d) => d.supplierOrderId === orderId)).toBe(false);
  });

  it("retire la dépense quand la commande est supprimée (cascade)", async () => {
    const res = await api("POST", "/api/orders", {
      cookie,
      body: { supplier: "Fournisseur D", shippingCents: 0, taxesEnabled: false, lines: [{ description: "Z", quantity: 1, unitCostCents: 2000 }] },
    });
    const orderId = res.body.commande.id;
    await api("DELETE", `/api/orders/${orderId}`, { cookie });
    expect((await depenses()).some((d) => d.supplierOrderId === orderId)).toBe(false);
  });

  it("empêche la suppression directe d'une dépense liée à une commande", async () => {
    const res = await api("POST", "/api/orders", {
      cookie,
      body: { supplier: "Fournisseur E", shippingCents: 0, taxesEnabled: false, lines: [{ description: "W", quantity: 1, unitCostCents: 1500 }] },
    });
    const orderId = res.body.commande.id;
    const dep = (await depenses()).find((d) => d.supplierOrderId === orderId);
    const del = await api("DELETE", `/api/expenses/${dep.id}`, { cookie });
    expect(del.status).toBe(409);
  });
});
