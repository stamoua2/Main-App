// Critère 10 (PRD) / 4 (passe 3) — finances : rapport de marges à montants
// connus. Calcul attendu (fait à la main) :
//   Revenus = facture payée 1 000,00 $ + revenu manuel 500,00 $ = 1 500,00 $
//   Coûts   = 400,00 $ + 200,00 $                              =   600,00 $
//   Marge   = 1 500 − 600                                      =   900,00 $
//   Marge % = 900 / 1500                                       =   60 %

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);

  // Facture payée de 1 000,00 $ (via une estimation convertie puis marquée payée
  // par le mécanisme Square simulé au niveau BD : on crée directement le statut).
  const clients = await api("GET", "/api/clients", { cookie });
  const est = await api("POST", "/api/documents", {
    cookie,
    body: {
      kind: "estimation",
      clientId: clients.body.clients[0].id,
      taxesEnabled: false,
      issuedOn: "2026-06-15",
      lines: [{ description: "Forfait saison", quantity: 1, unitPriceCents: 100000 }],
    },
  });
  const invoice = await api("POST", `/api/documents/${est.body.document.id}/convert`, { cookie });
  // Le statut « payée » est normalement posé par la synchronisation Square;
  // on l'applique ici par l'API de test (mise à jour directe non exposée),
  // en réutilisant le endpoint webhook simulé serait redondant — on passe
  // par la BD via l'endpoint documents (statut fourni à la création).
  await api("POST", "/api/documents", {
    cookie,
    body: {
      kind: "facture",
      clientId: clients.body.clients[0].id,
      taxesEnabled: false,
      issuedOn: "2026-06-20",
      status: "payée",
      lines: [{ description: "Facture test payée", quantity: 1, unitPriceCents: 100000 }],
    },
  });
  // La facture convertie reste « à payer » (sert au critère 6 du tableau de bord).
  void invoice;

  // Revenu manuel 500,00 $
  await api("POST", "/api/revenues", {
    cookie,
    body: { label: "Contrat commercial ponctuel", amountCents: 50000, receivedOn: "2026-06-22" },
  });
  // Dépenses 400,00 $ + 200,00 $
  await api("POST", "/api/expenses", {
    cookie,
    body: { label: "Engrais 32-0-4 (commande OJ)", category: "produits", amountCents: 40000, spentOn: "2026-06-10" },
  });
  await api("POST", "/api/expenses", {
    cookie,
    body: { label: "Essence camion", category: "véhicule", amountCents: 20000, spentOn: "2026-06-18" },
  });
});

describe("rapport de marges", () => {
  it("calcule revenus, coûts, marge et % conformément au calcul manuel", async () => {
    const res = await api("GET", "/api/finances/report?du=2026-06-01&au=2026-06-30", { cookie });
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.revenus.facturesPayees).toBe(100000);
    expect(r.revenus.revenusManuels).toBe(50000);
    expect(r.revenus.total).toBe(150000);
    expect(r.couts.depenses).toBe(60000);
    expect(r.marge).toBe(90000);
    expect(r.margePct).toBe(60);
  });

  it("ventile les coûts par catégorie", async () => {
    const res = await api("GET", "/api/finances/report?du=2026-06-01&au=2026-06-30", { cookie });
    const categories = Object.fromEntries(res.body.couts.parCategorie.map((c: any) => [c.category, c.total]));
    expect(categories["produits"]).toBe(40000);
    expect(categories["véhicule"]).toBe(20000);
  });

  it("exclut ce qui est hors période", async () => {
    const res = await api("GET", "/api/finances/report?du=2026-07-01&au=2026-07-31", { cookie });
    expect(res.body.revenus.total).toBe(0);
    expect(res.body.couts.depenses).toBe(0);
    expect(res.body.margePct).toBeNull();
  });
});

describe("campagnes marketing", () => {
  it("crée une campagne à date future avec statut « planifiée »", async () => {
    const res = await api("POST", "/api/campaigns", {
      cookie,
      body: {
        name: "Blitz printemps 2027 — Facebook",
        channel: "Facebook",
        content: "Réservez votre forfait avant le 1er avril et obtenez 10 % de rabais.",
        launchOn: "2027-03-15",
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.campagne.status).toBe("planifiée");
    expect(res.body.campagne.launchOn).toBe("2027-03-15");

    const list = await api("GET", "/api/campaigns", { cookie });
    const found = list.body.campagnes.find((c: any) => c.name.includes("Blitz printemps"));
    expect(found.status).toBe("planifiée");
  });

  it("une campagne à date passée est « lancée »", async () => {
    const res = await api("POST", "/api/campaigns", {
      cookie,
      body: { name: "Campagne déjà partie", channel: "Courriel", content: "…", launchOn: "2026-01-05" },
    });
    expect(res.body.campagne.status).toBe("lancée");
  });
});

describe("tableau de bord — indicateurs", () => {
  it("reflète factures impayées, marge du mois et compte réel en BD", async () => {
    const dash = await api("GET", "/api/dashboard", { cookie });
    // La facture convertie (à payer) doit compter comme impayée
    const docs = await api("GET", "/api/documents?type=facture", { cookie });
    const impayeesEnBd = docs.body.documents.filter((d: any) => d.status !== "payée").length;
    expect(dash.body.facturesImpayees).toBe(impayeesEnBd);
    expect(impayeesEnBd).toBeGreaterThanOrEqual(1);
    // Marge du mois courant : aucune donnée de juin ne compte (mois courant ≠ juin 2026)
    expect(typeof dash.body.margeMoisCents).toBe("number");
  });
});
