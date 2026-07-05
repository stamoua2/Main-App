// Critère 8 (PRD) / 6 (passe 2) — visites et optimisation de routes.
// L'API Google (géocodage + Routes) est simulée; l'appel réel est démontré
// dans la transcription.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setMapsFetchForTests } from "../server/routesapi.js";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
const visitIds: number[] = [];
const clientIds: number[] = [];

const GEOCODES: Record<string, { lat: number; lng: number }> = {
  "1177, route 315": { lat: 45.6086, lng: -75.3961 },       // L'Ange-Gardien
  "390, avenue de Buckingham": { lat: 45.5853, lng: -75.4225 }, // Buckingham
  "57, chemin de Montréal Ouest": { lat: 45.5468, lng: -75.5507 }, // Masson-Angers
  "33, chemin du Graphite": { lat: 45.5701, lng: -75.3532 },    // dépôt
};

function fakeMapsFetch(): typeof fetch {
  return (async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes("maps/api/geocode")) {
      const address = decodeURIComponent(url.match(/address=([^&]+)/)![1]).replace(/\+/g, " ");
      const known = Object.keys(GEOCODES).find((k) => address.includes(k.split(",")[0]));
      if (!known) {
        return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [{ geometry: { location: GEOCODES[known] }, formatted_address: known }],
        }),
        { status: 200 },
      );
    }
    if (url.includes("routes.googleapis.com")) {
      const req = JSON.parse(init!.body);
      const optimize = Boolean(req.optimizeWaypointOrder);
      // Simulation : l'ordre optimisé inverse l'ordre de saisie et raccourcit le trajet.
      const n = req.intermediates.length;
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: optimize ? 32000 : 41000,
              duration: optimize ? "3600s" : "4700s",
              ...(optimize
                ? { optimizedIntermediateWaypointIndex: Array.from({ length: n }, (_, i) => n - 1 - i) }
                : {}),
              legs: Array.from({ length: n + 1 }, () => ({
                distanceMeters: Math.round((optimize ? 32000 : 41000) / (n + 1)),
                duration: `${Math.round((optimize ? 3600 : 4700) / (n + 1))}s`,
              })),
            },
          ],
        }),
        { status: 200 },
      );
    }
    throw new Error(`URL non simulée : ${url}`);
  }) as typeof fetch;
}

beforeAll(async () => {
  await freshSeededDb();
  setMapsFetchForTests(fakeMapsFetch());
  cookie = await login(ALEX.email, ALEX.password);

  // 3 clients à des adresses réelles différentes de la région
  const clients = [
    { firstName: "Denis", lastName: "Ouellet2", addressLine: "1177, route 315", city: "L'Ange-Gardien" },
    { firstName: "Marie", lastName: "Tremblay", addressLine: "390, avenue de Buckingham", city: "Gatineau" },
    { firstName: "Paul", lastName: "Girard", addressLine: "57, chemin de Montréal Ouest", city: "Gatineau" },
  ];
  for (const c of clients) {
    const res = await api("POST", "/api/clients", { cookie, body: c });
    clientIds.push(res.body.client.id);
  }
  for (let i = 0; i < clientIds.length; i++) {
    const res = await api("POST", "/api/visits", {
      cookie,
      body: {
        clientId: clientIds[i],
        scheduledAt: `2026-07-10T0${8 + i}:00:00`,
        durationMinutes: 45,
        services: "Fertilisation + contrôle des mauvaises herbes",
      },
    });
    visitIds.push(res.body.visite.id);
  }
});

afterAll(() => setMapsFetchForTests(null));

describe("visites (calendrier)", () => {
  it("liste les visites d'une journée", async () => {
    const res = await api("GET", "/api/visits?date=2026-07-10", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.visites).toHaveLength(3);
    expect(res.body.visites[0].clientName).toContain("Denis");
  });

  it("modifie et supprime une visite", async () => {
    const created = await api("POST", "/api/visits", {
      cookie,
      body: { clientId: clientIds[0], scheduledAt: "2026-07-11T09:00:00" },
    });
    const id = created.body.visite.id;
    const updated = await api("PUT", `/api/visits/${id}`, { cookie, body: { status: "annulee" } });
    expect(updated.body.visite.status).toBe("annulee");
    const deleted = await api("DELETE", `/api/visits/${id}`, { cookie });
    expect(deleted.status).toBe(200);
  });
});

describe("optimisation de route", () => {
  it("exige au moins 2 visites", async () => {
    const res = await api("POST", "/api/routes/optimize", { cookie, body: { date: "2026-07-12" } });
    expect(res.status).toBe(400);
  });

  it("retourne l'ordre optimisé, distances/durées, et le compare à l'ordre naïf", async () => {
    const res = await api("POST", "/api/routes/optimize", { cookie, body: { date: "2026-07-10" } });
    expect(res.status).toBe(200);
    const r = res.body;

    // Ordre naïf = ordre de saisie ; ordre optimisé = différent (inversé ici)
    expect(r.naif.ordre.map((s: any) => s.visiteId)).toEqual(visitIds);
    expect(r.optimise.ordre.map((s: any) => s.visiteId)).toEqual([...visitIds].reverse());

    expect(r.optimise.distanceMetres).toBe(32000);
    expect(r.optimise.dureeSecondes).toBe(3600);
    expect(r.naif.distanceMetres).toBe(41000);
    expect(r.gainMetres).toBe(9000);
    expect(r.gainSecondes).toBe(1100);
    expect(r.optimise.segments).toHaveLength(4); // dépôt → 3 arrêts → dépôt
    expect(r.depot.adresse).toContain("chemin du Graphite");
  });

  it("persiste l'ordre optimisé (route_position) et les coordonnées géocodées", async () => {
    const res = await api("GET", "/api/visits?date=2026-07-10", { cookie });
    const positions = new Map(res.body.visites.map((v: any) => [v.id, v.routePosition]));
    expect(positions.get(visitIds[0])).toBe(3);
    expect(positions.get(visitIds[2])).toBe(1);

    const client = await api("GET", `/api/clients/${clientIds[0]}`, { cookie });
    expect(client.body.client.latitude).toBeCloseTo(45.6086, 3);
  });
});
