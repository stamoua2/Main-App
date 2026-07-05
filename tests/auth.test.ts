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

  it("connecte Alex par NOM D'UTILISATEUR et donne accès aux API protégées", async () => {
    const res = await api("POST", "/api/auth/login", {
      body: { identifiant: "alex", password: ALEX.password },
    });
    expect(res.status).toBe(200);
    expect(res.body.utilisateur.username).toBe("alex");
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    const clients = await api("GET", "/api/clients", { cookie });
    expect(clients.status).toBe(200);
  });

  it("accepte aussi le courriel comme identifiant (rétrocompatibilité)", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const me = await api("GET", "/api/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.body.utilisateur.email).toBe(ALEX.email);
  });

  it("permet de créer le compte de Cindy (username), qui peut ensuite se connecter", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const created = await api("POST", "/api/users", {
      cookie,
      body: {
        username: "Cindy", // normalisé en minuscules
        email: "cindy@stamourduvert.com",
        name: "Cindy",
        password: "MotDePasseCindy123!",
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.utilisateur.username).toBe("cindy");

    const res = await api("POST", "/api/auth/login", {
      body: { identifiant: "cindy", password: "MotDePasseCindy123!" },
    });
    expect(res.status).toBe(200);
    expect(res.body.utilisateur.name).toBe("Cindy");
  });

  it("refuse un nom d'utilisateur ou un courriel en double", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const dupUsername = await api("POST", "/api/users", {
      cookie,
      body: { username: "ALEX", email: "autre@exemple.com", name: "Doublon", password: "Password123!" },
    });
    expect(dupUsername.status).toBe(409);
    const dupEmail = await api("POST", "/api/users", {
      cookie,
      body: { username: "doublon", email: ALEX.email, name: "Doublon", password: "Password123!" },
    });
    expect(dupEmail.status).toBe(409);
  });

  it("met à jour un utilisateur : nom, nom d'utilisateur et mot de passe", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const users = await api("GET", "/api/users", { cookie });
    const cindy = users.body.utilisateurs.find((u: any) => u.username === "cindy");

    const updated = await api("PUT", `/api/users/${cindy.id}`, {
      cookie,
      body: { name: "Cindy St-Amour", username: "cindy.sa", password: "NouveauMotDePasse123!" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.utilisateur.username).toBe("cindy.sa");
    expect(updated.body.motDePasseChange).toBe(true);

    // L'ancien mot de passe ne fonctionne plus; le nouveau oui, avec le nouveau username.
    const oldLogin = await api("POST", "/api/auth/login", {
      body: { identifiant: "cindy.sa", password: "MotDePasseCindy123!" },
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api("POST", "/api/auth/login", {
      body: { identifiant: "cindy.sa", password: "NouveauMotDePasse123!" },
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.utilisateur.name).toBe("Cindy St-Amour");
  });

  it("refuse un nom d'utilisateur déjà pris lors d'une mise à jour", async () => {
    const cookie = await login(ALEX.email, ALEX.password);
    const users = await api("GET", "/api/users", { cookie });
    const cindy = users.body.utilisateurs.find((u: any) => u.username === "cindy.sa");
    const res = await api("PUT", `/api/users/${cindy.id}`, { cookie, body: { username: "alex" } });
    expect(res.status).toBe(409);
  });

  it("la déconnexion invalide le cookie", async () => {
    const res = await api("POST", "/api/auth/logout");
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain("Max-Age=0");
  });
});
