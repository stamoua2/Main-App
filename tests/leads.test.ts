// Critère 7 (PRD) — soumission web → prospect + notification.

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
});

describe("soumissions web", () => {
  it("l'endpoint public accepte une soumission sans authentification", async () => {
    const res = await api("POST", "/api/public/soumission", {
      body: {
        fullName: "Isabelle Roy",
        email: "isabelle.roy@example.com",
        phone: "819-555-0199",
        address: "855, boulevard de la Gappe, Gatineau",
        sector: "Gatineau",
        message: "Terrain d'environ 4 500 pi², mauvaises herbes à l'avant.",
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("le prospect apparaît dans la liste (authentifiée)", async () => {
    const res = await api("GET", "/api/leads", { cookie });
    expect(res.status).toBe(200);
    const lead = res.body.prospects.find((p: any) => p.fullName === "Isabelle Roy");
    expect(lead).toBeDefined();
    expect(lead.status).toBe("nouveau");
    expect(lead.message).toContain("4 500 pi²");
  });

  it("une notification a été créée et visible", async () => {
    const res = await api("GET", "/api/notifications", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.nonLues).toBeGreaterThanOrEqual(1);
    const notif = res.body.notifications.find((n: any) => n.kind === "soumission");
    expect(notif.title).toContain("Isabelle Roy");
  });

  it("rejette le pot de miel (robot) et les données invalides", async () => {
    const bot = await api("POST", "/api/public/soumission", {
      body: { fullName: "Bot", website: "http://spam.example" },
    });
    expect(bot.status).toBe(400);
    const invalid = await api("POST", "/api/public/soumission", { body: { fullName: "" } });
    expect(invalid.status).toBe(400);
  });

  it("convertit le prospect en client", async () => {
    const leads = await api("GET", "/api/leads", { cookie });
    const lead = leads.body.prospects.find((p: any) => p.fullName === "Isabelle Roy");
    const res = await api("POST", `/api/leads/${lead.id}/convert`, { cookie });
    expect(res.status).toBe(201);
    expect(res.body.client.firstName).toBe("Isabelle");
    expect(res.body.client.status).toBe("prospect");

    const after = await api("GET", "/api/leads", { cookie });
    const converted = after.body.prospects.find((p: any) => p.id === lead.id);
    expect(converted.status).toBe("converti");
    expect(converted.clientId).toBe(res.body.client.id);

    const again = await api("POST", `/api/leads/${lead.id}/convert`, { cookie });
    expect(again.status).toBe(409);
  });

  it("les endpoints de gestion restent protégés (401 sans session)", async () => {
    const res = await api("GET", "/api/leads");
    expect(res.status).toBe(401);
  });
});
