// Tâches & relances : CRUD, portées (ouvertes/terminées), échéances, et
// répercussion sur le tableau de bord (en retard / aujourd'hui / prochaines).

import { beforeAll, describe, expect, it } from "vitest";
import { ALEX, api, freshSeededDb, login } from "./helpers.js";

let cookie: string;
let clientId: number;

const HIER = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const AUJ = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  await freshSeededDb();
  cookie = await login(ALEX.email, ALEX.password);
  const c = await api("POST", "/api/clients", {
    cookie,
    body: { firstName: "Relance", lastName: "Test", addressLine: "1 rue", city: "L'Ange-Gardien", postalCode: "J8L 3J6" },
  });
  clientId = c.body.client.id;
});

describe("tâches & relances", () => {
  it("crée une tâche rattachée à un client et l'affiche dans « ouvertes »", async () => {
    const res = await api("POST", "/api/tasks", {
      cookie,
      body: { title: "Rappeler pour l'estimation", clientId, dueOn: AUJ, priority: "haute" },
    });
    expect(res.status).toBe(201);
    expect(res.body.tache.clientName).toBe("Relance Test");
    expect(res.body.tache.done).toBe(false);

    const liste = await api("GET", "/api/tasks", { cookie });
    expect(liste.body.taches.some((t: any) => t.id === res.body.tache.id)).toBe(true);
  });

  it("valide le titre requis", async () => {
    const res = await api("POST", "/api/tasks", { cookie, body: { title: "" } });
    expect(res.status).toBe(400);
  });

  it("marque une tâche terminée : elle sort des « ouvertes » et va dans « terminees »", async () => {
    const cree = await api("POST", "/api/tasks", { cookie, body: { title: "À cocher" } });
    const id = cree.body.tache.id;
    const maj = await api("PUT", `/api/tasks/${id}`, { cookie, body: { done: true } });
    expect(maj.body.tache.done).toBe(true);
    expect(maj.body.tache.completedAt).toBeTruthy();

    const ouvertes = await api("GET", "/api/tasks?scope=ouvertes", { cookie });
    expect(ouvertes.body.taches.some((t: any) => t.id === id)).toBe(false);
    const terminees = await api("GET", "/api/tasks?scope=terminees", { cookie });
    expect(terminees.body.taches.some((t: any) => t.id === id)).toBe(true);
  });

  it("compte les relances en retard et du jour dans le tableau de bord", async () => {
    await api("POST", "/api/tasks", { cookie, body: { title: "En retard", dueOn: HIER } });
    const dash = await api("GET", "/api/dashboard", { cookie });
    expect(dash.body.tachesEnRetard).toBeGreaterThanOrEqual(1);
    expect(dash.body.tachesAujourdhui).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(dash.body.prochainesTaches)).toBe(true);
  });

  it("filtre les tâches par client", async () => {
    const autre = await api("POST", "/api/clients", {
      cookie,
      body: { firstName: "Autre", lastName: "Client", addressLine: "2 rue", city: "Gatineau", postalCode: "J8P 1A1" },
    });
    await api("POST", "/api/tasks", { cookie, body: { title: "Tâche autre client", clientId: autre.body.client.id } });
    const res = await api("GET", `/api/tasks?scope=toutes&clientId=${clientId}`, { cookie });
    expect(res.body.taches.every((t: any) => t.clientId === clientId)).toBe(true);
  });

  it("supprime une tâche", async () => {
    const cree = await api("POST", "/api/tasks", { cookie, body: { title: "À supprimer" } });
    const del = await api("DELETE", `/api/tasks/${cree.body.tache.id}`, { cookie });
    expect(del.status).toBe(200);
    const relire = await api("GET", "/api/tasks?scope=toutes", { cookie });
    expect(relire.body.taches.some((t: any) => t.id === cree.body.tache.id)).toBe(false);
  });

  it("supprime les tâches d'un client supprimé (cascade)", async () => {
    const c = await api("POST", "/api/clients", {
      cookie,
      body: { firstName: "Ephemere", lastName: "Client", addressLine: "3 rue", city: "Gatineau", postalCode: "J8P 1A1" },
    });
    const t = await api("POST", "/api/tasks", { cookie, body: { title: "Liée", clientId: c.body.client.id } });
    await api("DELETE", `/api/clients/${c.body.client.id}`, { cookie });
    const relire = await api("GET", "/api/tasks?scope=toutes", { cookie });
    expect(relire.body.taches.some((x: any) => x.id === t.body.tache.id)).toBe(false);
  });
});
