// Critère 13 — forfaits conformes au site : la base contient les trois
// forfaits avec exactement les services de l'instantané verbatim de
// stamourduvert.com (la comparaison avec le site EN DIRECT est faite par
// scripts/compare-forfaits.ts).

import { beforeAll, describe, expect, it } from "vitest";
import { SITE_PACKAGES } from "../server/seed-data.js";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
});

describe("forfaits", () => {
  it("expose les trois forfaits dans l'ordre du site", async () => {
    const res = await api("GET", "/api/packages", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.forfaits.map((f: any) => f.name)).toEqual(["Essentiel", "Régulier", "Élite"]);
  });

  it("chaque forfait correspond service par service à l'instantané du site", async () => {
    const res = await api("GET", "/api/packages", { cookie });
    for (let i = 0; i < SITE_PACKAGES.length; i++) {
      const site = SITE_PACKAGES[i];
      const db = res.body.forfaits[i];
      expect(db.name).toBe(site.name);
      expect(db.visits).toBe(site.visits);
      expect(db.tagline).toBe(site.tagline);
      expect(db.popular).toBe(site.popular);
      expect(db.items).toEqual(site.items);
    }
  });

  it("seul Régulier est marqué « le plus populaire »", async () => {
    const res = await api("GET", "/api/packages", { cookie });
    const populars = res.body.forfaits.filter((f: any) => f.popular);
    expect(populars).toHaveLength(1);
    expect(populars[0].name).toBe("Régulier");
  });

  it("le catalogue des 9 services du site est chargé", async () => {
    const res = await api("GET", "/api/services", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(9);
    expect(res.body.services[0].name).toBe("Contrôle des mauvaises herbes");
  });
});
