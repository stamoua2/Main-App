// Critère 12 — authentification multi-utilisateurs.

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

beforeAll(freshSeededDb);

describe("authentification", () => {
  it("rejette une requête non authentifiée vers une API protégée (401)", async () => {
    const res = await api("GET", "/api/clients");
    expect(res.status).toBe(401);
    expect(res.body.erreur).toBe("Authentification requise.");
  });

  it("rejette un mauvais mot de passe", async () => {
    const res = await api("POST", "/api/auth/login", {
      body: { email: ALEX.email, password: "mauvais-mot-de-passe" },
    });
    expect(res.status).toBe(401);
  });

  it("connecte Alex et donne accès aux API protégées", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const me = await api("GET", "/api/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.body.utilisateur.email).toBe(ALEX.email);
    const clients = await api("GET", "/api/clients", { cookie });
    expect(clients.status).toBe(200);
  });

  it("permet de créer le compte de Cindy, qui peut ensuite se connecter", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const created = await api("POST", "/api/users", {
      cookie,
      body: { email: "cindy@stamourduvert.com", name: "Cindy", password: "MotDePasseCindy123!" },
    });
    expect(created.status).toBe(201);
    expect(created.body.utilisateur.email).toBe("cindy@stamourduvert.com");

    const cindyCookie = await login("cindy@stamourduvert.com", "MotDePasseCindy123!");
    const me = await api("GET", "/api/auth/me", { cookie: cindyCookie });
    expect(me.status).toBe(200);
    expect(me.body.utilisateur.name).toBe("Cindy");
  });

  it("refuse un courriel en double", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const res = await api("POST", "/api/users", {
      cookie,
      body: { email: ALEX.email, name: "Doublon", password: "Password123!" },
    });
    expect(res.status).toBe(409);
  });

  it("la déconnexion invalide le cookie", async () => {
    const res = await api("POST", "/api/auth/logout");
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain("Max-Age=0");
  });
});
