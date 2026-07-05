// Calculateur de prix des forfaits : coût des produits selon la superficie,
// marge de profit ajustable, produits de forfait modifiables.

import { beforeAll, describe, expect, it } from "vitest";
import { coutForfait, margeDepuisPrix, prixDepuisMarge } from "../shared/pricing.js";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
});

describe("shared/pricing — calculs purs", () => {
  it("calcule le coût d'un forfait (produits + visites)", () => {
    // 2 kg/100 m² × 500 m² × 3 applications = 30 kg → 1,5 format de 20 kg à 40 $.
    const r = coutForfait(
      [{ label: "Engrais", dosePer100m2: 2, doseUnit: "kg", formatQuantity: 20, formatCostCents: 4000, applications: 3 }],
      500,
      3,
      3000,
    );
    expect(r.details[0].quantiteTotale).toBe(30);
    expect(r.details[0].formats).toBe(1.5);
    expect(r.produitsCents).toBe(6000);
    expect(r.visitesCents).toBe(9000);
    expect(r.totalCents).toBe(15000);
  });

  it("prix depuis la marge (sur prix de vente), arrondi au dollar supérieur", () => {
    expect(prixDepuisMarge(15000, 40)).toBe(25000); // 150 / 0,60 = 250 $
    expect(prixDepuisMarge(20043, 55)).toBe(44600); // 200,43 / 0,45 = 445,40 → 446 $
    expect(prixDepuisMarge(0, 50)).toBe(0);
  });

  it("marge depuis un prix donné (aller-retour cohérent)", () => {
    expect(margeDepuisPrix(15000, 25000)).toBeCloseTo(40, 9);
    expect(margeDepuisPrix(10000, 8000)).toBeLessThan(0); // prix sous le coût
  });
});

describe("API /api/pricing/quote", () => {
  it("exige l'authentification (401)", async () => {
    const res = await api("GET", "/api/pricing/quote?areaM2=500");
    expect(res.status).toBe(401);
  });

  it("refuse une requête sans superficie (400)", async () => {
    const res = await api("GET", "/api/pricing/quote", { cookie });
    expect(res.status).toBe(400);
  });

  it("cote les 3 forfaits pour 500 m² avec les produits par défaut", async () => {
    const res = await api("GET", "/api/pricing/quote?areaM2=500", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.superficie.m2).toBe(500);
    expect(res.body.forfaits).toHaveLength(3);

    const essentiel = res.body.forfaits.find((f: any) => f.slug === "essentiel");
    // Engrais 21-3-7 : 3,5 kg/100 m² × 5 × 3 app = 52,5 kg → 2,1 sacs de 25 kg à 29,06 $ = 61,03 $
    // Fiesta : 0,7 L/100 m² × 5 × 2 app = 7 L → 0,35 caisse de 20 L à 184 $ = 64,40 $
    expect(essentiel.couts.produitsCents).toBe(6103 + 6440);
    expect(essentiel.couts.visitesCents).toBe(3 * 2500); // 3 visites × 25 $ par défaut
    expect(essentiel.couts.totalCents).toBe(20043);
    // Marge par défaut 55 % : 200,43 / 0,45 = 445,40 → 446 $
    expect(essentiel.marginPct).toBe(55);
    expect(essentiel.prixCents).toBe(44600);
    expect(essentiel.prixParVisiteCents).toBe(Math.round(44600 / 3));

    // Les forfaits plus garnis coûtent (et se vendent) plus cher.
    const regulier = res.body.forfaits.find((f: any) => f.slug === "regulier");
    const elite = res.body.forfaits.find((f: any) => f.slug === "elite");
    expect(regulier.couts.totalCents).toBeGreaterThan(essentiel.couts.totalCents);
    expect(elite.couts.totalCents).toBeGreaterThan(regulier.couts.totalCents);
    expect(elite.prixCents).toBeGreaterThan(regulier.prixCents);
  });

  it("accepte la superficie en pi²", async () => {
    const res = await api("GET", "/api/pricing/quote?areaFt2=5382", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.superficie.m2).toBeCloseTo(500, 0);
  });

  it("tire la superficie mesurée d'un client (clientId)", async () => {
    const created = await api("POST", "/api/clients", {
      cookie,
      body: {
        firstName: "Test",
        lastName: "Superficie",
        addressLine: "1, rue du Test",
        city: "L'Ange-Gardien",
        lotAreaM2: 750,
      },
    });
    expect(created.status).toBe(201);
    const res = await api("GET", `/api/pricing/quote?clientId=${created.body.client.id}`, { cookie });
    expect(res.status).toBe(200);
    expect(res.body.superficie.m2).toBe(750);
  });
});

describe("ajustement des marges et des produits de forfait", () => {
  it("sauvegarde la marge d'un forfait et la cotation la reflète", async () => {
    const pkgs = await api("GET", "/api/packages", { cookie });
    const essentiel = pkgs.body.forfaits.find((f: any) => f.slug === "essentiel");

    const updated = await api("PUT", `/api/packages/${essentiel.id}`, {
      cookie,
      body: { marginPct: 60 },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.forfait.marginPct).toBe(60);

    const quote = await api("GET", "/api/pricing/quote?areaM2=500", { cookie });
    const f = quote.body.forfaits.find((x: any) => x.slug === "essentiel");
    expect(f.marginPct).toBe(60);
    // 200,43 / 0,40 = 501,08 → 502 $
    expect(f.prixCents).toBe(prixDepuisMarge(20043, 60));
  });

  it("remplace les produits d'un forfait et le coût suit exactement", async () => {
    const pkgs = await api("GET", "/api/packages", { cookie });
    const essentiel = pkgs.body.forfaits.find((f: any) => f.slug === "essentiel");

    // Produit à coût manuel : 2 kg/100 m², format 20 kg à 40 $, 3 applications.
    const put = await api("PUT", `/api/packages/${essentiel.id}/products`, {
      cookie,
      body: {
        produits: [
          {
            label: "Engrais test",
            dosePer100m2: 2,
            doseUnit: "kg",
            formatQuantity: 20,
            applications: 3,
            unitCostCents: 4000,
          },
        ],
      },
    });
    expect(put.status).toBe(200);
    expect(put.body.produits).toHaveLength(1);
    expect(put.body.produits[0].formatCostCents).toBe(4000);

    // Visites : 3 × 30 $, marge 40 % → coût 60 + 90 = 150 $, prix 250 $.
    await api("PUT", `/api/packages/${essentiel.id}`, {
      cookie,
      body: { visitCount: 3, visitCostCents: 3000, marginPct: 40 },
    });
    const quote = await api("GET", "/api/pricing/quote?areaM2=500", { cookie });
    const f = quote.body.forfaits.find((x: any) => x.slug === "essentiel");
    expect(f.couts.produitsCents).toBe(6000);
    expect(f.couts.visitesCents).toBe(9000);
    expect(f.couts.totalCents).toBe(15000);
    expect(f.prixCents).toBe(25000);
  });

  it("lie un produit d'inventaire OJ : le coût vient de l'inventaire", async () => {
    const pkgs = await api("GET", "/api/packages", { cookie });
    const regulier = pkgs.body.forfaits.find((f: any) => f.slug === "regulier");
    const inv = await api("GET", "/api/inventory?q=Fiesta", { cookie });
    const fiesta = inv.body.produits.find((p: any) => p.name === "Fiesta" && p.format === "2 x 10 L");
    expect(fiesta).toBeDefined();

    const put = await api("PUT", `/api/packages/${regulier.id}/products`, {
      cookie,
      body: {
        produits: [
          {
            itemId: fiesta.id,
            label: "Fiesta",
            dosePer100m2: 1,
            doseUnit: "L",
            formatQuantity: 20,
            applications: 2,
          },
        ],
      },
    });
    expect(put.status).toBe(200);
    expect(put.body.produits[0].itemName).toBe("Fiesta");
    expect(put.body.produits[0].formatCostCents).toBe(fiesta.costCents);
  });

  it("le seed ne réécrase pas des produits ajustés", async () => {
    const { getDb } = await import("../server/db.js");
    const { seedAll } = await import("../server/seed.js");
    await seedAll(await getDb(), { alexPassword: ALEX.password });

    const pkgs = await api("GET", "/api/packages", { cookie });
    const essentiel = pkgs.body.forfaits.find((f: any) => f.slug === "essentiel");
    const products = await api("GET", `/api/packages/${essentiel.id}/products`, { cookie });
    // Toujours notre produit personnalisé du test précédent, pas les défauts.
    expect(products.body.produits).toHaveLength(1);
    expect(products.body.produits[0].label).toBe("Engrais test");
  });
});
