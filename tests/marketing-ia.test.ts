// Marketing IA (Gemini simulé) et synchronisation des paiements Square → revenus.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setGeminiFetchForTests } from "../server/gemini.js";
import { setSquareFetchForTests } from "../server/square.js";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function fakeGeminiFetch(): typeof fetch {
  return (async (input: any) => {
    const url = String(input);
    const respond = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
    if (url.includes("gemini-flash-latest")) {
      return respond({
        candidates: [
          {
            content: {
              parts: [{ text: "Une pelouse verte sans effort ! 🌱 Appelez St-Amour du Vert. #pelouse" }],
            },
          },
        ],
      });
    }
    if (url.includes("gemini-2.5-flash-image")) {
      return respond({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_BASE64 } }] } },
        ],
      });
    }
    return respond({ error: { code: 404, message: "modèle non simulé" } }, 404);
  }) as typeof fetch;
}

function fakeSquarePaymentsFetch(): typeof fetch {
  return (async (input: any) => {
    const url = String(input);
    const respond = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/v2/payments")) {
      return respond({
        payments: [
          {
            id: "PAY_TEST_001",
            status: "COMPLETED",
            amount_money: { amount: 42300, currency: "CAD" },
            created_at: "2026-06-15T14:00:00Z",
            note: "Acompte contrat",
          },
          {
            id: "PAY_TEST_002",
            status: "COMPLETED",
            amount_money: { amount: 12000, currency: "CAD" },
            created_at: "2026-07-01T10:00:00Z",
          },
          { id: "PAY_TEST_FAILED", status: "FAILED", amount_money: { amount: 999, currency: "CAD" } },
        ],
      });
    }
    return respond({ errors: [{ code: "NOT_FOUND", detail: "non simulé" }] }, 404);
  }) as typeof fetch;
}

beforeAll(async () => {
  await freshSeededDb();
  setGeminiFetchForTests(fakeGeminiFetch());
  setSquareFetchForTests(fakeSquarePaymentsFetch());
  cookie = await login(ALEX.email, ALEX.password);
});

afterAll(() => {
  setGeminiFetchForTests(null);
  setSquareFetchForTests(null);
});

describe("marketing IA (Gemini)", () => {
  it("exige l'authentification (401)", async () => {
    const res = await api("POST", "/api/marketing/generate", {
      body: { mode: "texte" },
    });
    expect(res.status).toBe(401);
  });

  it("génère le texte d'une annonce Facebook", async () => {
    const res = await api("POST", "/api/marketing/generate", {
      cookie,
      body: {
        mode: "texte",
        platform: "Facebook",
        objective: "promo printemps",
        tone: "chaleureux et professionnel",
        details: "15 % de rabais avant le 1er avril",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.texte).toContain("St-Amour du Vert");
  });

  it("génère une image (data URL base64)", async () => {
    const res = await api("POST", "/api/marketing/generate", {
      cookie,
      body: { mode: "image", objective: "pelouse parfaite" },
    });
    expect(res.status).toBe(200);
    expect(res.body.image).toMatch(/^data:image\/png;base64,/);
  });

  it("sauvegarde une campagne complète (texte + image) puis la met à jour", async () => {
    const created = await api("POST", "/api/campaigns", {
      cookie,
      body: {
        name: "Promo printemps 2026",
        channel: "Facebook",
        content: "Texte de l'annonce",
        objective: "promo printemps",
        tone: "dynamique",
        imageData: `data:image/png;base64,${PNG_BASE64}`,
        launchOn: "2026-04-01",
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.campagne.imageData).toContain("base64");

    const updated = await api("PUT", `/api/campaigns/${created.body.campagne.id}`, {
      cookie,
      body: { status: "lancée", content: "Texte révisé" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.campagne.status).toBe("lancée");
    expect(updated.body.campagne.content).toBe("Texte révisé");
  });
});

describe("synchronisation des paiements Square → revenus", () => {
  it("importe les paiements COMPLETED une seule fois (idempotence)", async () => {
    const first = await api("POST", "/api/finances/sync-square", { cookie });
    expect(first.status).toBe(200);
    expect(first.body.paiements).toBe(2); // FAILED exclu
    expect(first.body.nouveauxRevenus).toBe(2);

    const again = await api("POST", "/api/finances/sync-square", { cookie });
    expect(again.body.nouveauxRevenus).toBe(0);

    const revenus = await api("GET", "/api/revenues", { cookie });
    const squareRevenus = revenus.body.revenus.filter((r: any) => r.source === "square");
    expect(squareRevenus).toHaveLength(2);
    expect(squareRevenus.reduce((s: number, r: any) => s + r.amountCents, 0)).toBe(42300 + 12000);
  });

  it("les paiements Square comptent dans le rapport de marges", async () => {
    const report = await api("GET", "/api/finances/report?du=2026-06-01&au=2026-07-31", { cookie });
    expect(report.body.revenus.revenusManuels).toBeGreaterThanOrEqual(42300 + 12000);
  });
});
