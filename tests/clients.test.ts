// Critère 3 — gestion complète des clients (créer, modifier, supprimer).

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
});

describe("gestion des clients", () => {
  it("la donnée de départ contient le client test avec adresse réelle de la région", async () => {
    const res = await api("GET", "/api/clients", { cookie });
    expect(res.status).toBe(200);
    const denis = res.body.clients.find((c: any) => c.lastName === "Ouellet");
    expect(denis).toBeDefined();
    expect(denis.city).toBe("L'Ange-Gardien");
    expect(denis.packageName).toBe("Essentiel");
  });

  it("crée, modifie puis supprime un client", async () => {
    // Création avec adresse complète
    const created = await api("POST", "/api/clients", {
      cookie,
      body: {
        firstName: "Marie",
        lastName: "Tremblay",
        email: "marie.tremblay@example.com",
        phone: "819-555-0177",
        addressLine: "45, chemin du Fort",
        city: "Val-des-Monts",
        province: "QC",
        postalCode: "J8N 7T6",
        status: "actif",
        notes: "Terrain avec pente à l'arrière.",
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.client.id;
    expect(created.body.client.fullName).toBe("Marie Tremblay");

    // Modification (superficie + forfait)
    const packages = await api("GET", "/api/packages", { cookie });
    const regulier = packages.body.forfaits.find((f: any) => f.slug === "regulier");
    const updated = await api("PUT", `/api/clients/${id}`, {
      cookie,
      body: { lotAreaM2: 418.06, packageId: regulier.id, notes: "Terrain mesuré au traceur." },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.client.lotAreaM2).toBeCloseTo(418.06, 2);
    expect(updated.body.client.packageName).toBe("Régulier");

    // Suppression + preuve d'absence
    const deleted = await api("DELETE", `/api/clients/${id}`, { cookie });
    expect(deleted.status).toBe(200);
    const after = await api("GET", `/api/clients/${id}`, { cookie });
    expect(after.status).toBe(404);
    const list = await api("GET", "/api/clients", { cookie });
    expect(list.body.clients.some((c: any) => c.id === id)).toBe(false);
  });

  it("valide les champs requis", async () => {
    const res = await api("POST", "/api/clients", {
      cookie,
      body: { firstName: "", lastName: "X", addressLine: "1 rue", city: "Gatineau" },
    });
    expect(res.status).toBe(400);
  });

  it("recherche par nom ou ville", async () => {
    const res = await api("GET", "/api/clients?q=ouellet", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.clients.length).toBeGreaterThanOrEqual(1);
    expect(res.body.clients[0].lastName).toBe("Ouellet");
  });
});
