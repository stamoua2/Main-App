// Fiche client enrichie : étiquettes (tags), historique d'activité daté
// (appels/courriels/notes) et « dernier contact » dérivé.

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let clientId: number;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
  const c = await api("POST", "/api/clients", {
    cookie,
    body: {
      firstName: "Fiche",
      lastName: "Enrichie",
      addressLine: "1 rue",
      city: "L'Ange-Gardien",
      postalCode: "J8L 3J6",
      tags: ["VIP", "Résidentiel"],
    },
  });
  clientId = c.body.client.id;
});

describe("fiche client enrichie", () => {
  it("stocke et renvoie les étiquettes en tableau", async () => {
    const res = await api("GET", `/api/clients/${clientId}`, { cookie });
    expect(res.body.client.tags).toEqual(["VIP", "Résidentiel"]);
    expect(res.body.client.lastContactOn).toBeNull();
  });

  it("modifie les étiquettes", async () => {
    const res = await api("PUT", `/api/clients/${clientId}`, {
      cookie,
      body: { tags: ["Commercial"] },
    });
    expect(res.body.client.tags).toEqual(["Commercial"]);
  });

  it("ajoute une activité datée et la liste (plus récente d'abord)", async () => {
    const a1 = await api("POST", `/api/clients/${clientId}/followups`, {
      cookie,
      body: { body: "Appel : intéressé par le forfait Élite", kind: "appel" },
    });
    expect(a1.status).toBe(201);
    expect(a1.body.activite.kind).toBe("appel");
    expect(a1.body.activite.authorName).toBe("Alex St-Amour");

    await api("POST", `/api/clients/${clientId}/followups`, {
      cookie,
      body: { body: "Courriel de suivi envoyé", kind: "courriel" },
    });

    const liste = await api("GET", `/api/clients/${clientId}/followups`, { cookie });
    expect(liste.body.activites).toHaveLength(2);
    expect(liste.body.activites[0].body).toBe("Courriel de suivi envoyé");
  });

  it("met à jour « dernier contact » après une activité", async () => {
    const res = await api("GET", `/api/clients/${clientId}`, { cookie });
    expect(res.body.client.lastContactOn).toBeTruthy();
  });

  it("valide la note requise", async () => {
    const res = await api("POST", `/api/clients/${clientId}/followups`, { cookie, body: { body: "" } });
    expect(res.status).toBe(400);
  });

  it("supprime une activité", async () => {
    const cree = await api("POST", `/api/clients/${clientId}/followups`, {
      cookie,
      body: { body: "À retirer" },
    });
    const del = await api("DELETE", `/api/followups/${cree.body.activite.id}`, { cookie });
    expect(del.status).toBe(200);
  });

  it("supprime l'historique quand le client est supprimé (cascade)", async () => {
    const c = await api("POST", "/api/clients", {
      cookie,
      body: { firstName: "Temp", lastName: "Cascade", addressLine: "2 rue", city: "Gatineau", postalCode: "J8P 1A1" },
    });
    await api("POST", `/api/clients/${c.body.client.id}/followups`, { cookie, body: { body: "note" } });
    await api("DELETE", `/api/clients/${c.body.client.id}`, { cookie });
    const liste = await api("GET", `/api/clients/${c.body.client.id}/followups`, { cookie });
    expect(liste.body.activites).toHaveLength(0);
  });
});
