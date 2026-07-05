import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Client, type PlanRoute, type Visite } from "../api";

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDistance(m: number): string {
  return `${(m / 1000).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} km`;
}

function formatDuree(s: number): string {
  const h = Math.floor(s / 3600);
  const min = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${min.toString().padStart(2, "0")}` : `${min} min`;
}

const STATUTS: Record<string, string> = { planifiee: "planifiée", faite: "faite", annulee: "annulée" };

export default function Calendrier() {
  const [date, setDate] = useState(aujourdhui());
  const [visites, setVisites] = useState<Visite[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [plan, setPlan] = useState<PlanRoute | null>(null);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [nouvelle, setNouvelle] = useState({ clientId: "", heure: "08:00", durationMinutes: "45", services: "" });
  const [aVenir, setAVenir] = useState<Visite[]>([]);

  const charger = useCallback(async () => {
    const r = await api.get<{ visites: Visite[] }>(`/api/visits?date=${date}`);
    setVisites(r.visites);
    const tout = await api.get<{ visites: Visite[] }>("/api/visits");
    const maintenant = Date.now();
    setAVenir(
      tout.visites
        .filter((v) => v.status === "planifiee" && new Date(v.scheduledAt).getTime() >= maintenant)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 30),
    );
  }, [date]);

  useEffect(() => {
    charger();
    setPlan(null);
    setErreur("");
  }, [charger]);

  useEffect(() => {
    api.get<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients));
  }, []);

  async function ajouterVisite(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    try {
      await api.post("/api/visits", {
        clientId: Number(nouvelle.clientId),
        scheduledAt: `${date}T${nouvelle.heure}:00`,
        durationMinutes: Number(nouvelle.durationMinutes),
        services: nouvelle.services,
      });
      setFormVisible(false);
      setNouvelle({ clientId: "", heure: "08:00", durationMinutes: "45", services: "" });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    }
  }

  async function optimiser() {
    setErreur("");
    setEnCours(true);
    setPlan(null);
    try {
      const r = await api.post<PlanRoute>("/api/routes/optimize", { date });
      setPlan(r);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Optimisation impossible.");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(id: number) {
    await api.delete(`/api/visits/${id}`);
    await charger();
  }

  async function changerStatut(v: Visite, statut: string) {
    await api.put(`/api/visits/${v.id}`, { status: statut });
    await charger();
  }

  // Déplacer une visite (gestion manuelle du calendrier).
  async function deplacer(v: Visite, quand: string) {
    if (!quand) return;
    await api.put(`/api/visits/${v.id}`, { scheduledAt: `${quand}:00` });
    await charger();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Planification</div>
          <h1>Calendrier & routes</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field">
            Journée
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn secondary" onClick={() => setFormVisible((v) => !v)}>
            {formVisible ? "Fermer" : "+ Ajouter une visite"}
          </button>
          <button className="btn" onClick={optimiser} disabled={enCours || visites.length < 2}>
            {enCours ? "Optimisation…" : "Optimiser la route"}
          </button>
        </div>
      </div>

      {formVisible && (
        <div className="panel">
          <h2>Nouvelle visite — {date}</h2>
          <form onSubmit={ajouterVisite}>
            <div className="form-grid">
              <label className="field">
                Client
                <select
                  value={nouvelle.clientId}
                  onChange={(e) => setNouvelle({ ...nouvelle, clientId: e.target.value })}
                  required
                >
                  <option value="">— Choisir un client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — {c.addressLine}, {c.city}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Heure
                <input
                  type="time"
                  value={nouvelle.heure}
                  onChange={(e) => setNouvelle({ ...nouvelle, heure: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                Durée (minutes)
                <input
                  type="number"
                  min={5}
                  value={nouvelle.durationMinutes}
                  onChange={(e) => setNouvelle({ ...nouvelle, durationMinutes: e.target.value })}
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Services prévus
                <input
                  value={nouvelle.services}
                  onChange={(e) => setNouvelle({ ...nouvelle, services: e.target.value })}
                  placeholder="Ex. : Fertilisation d'été + contrôle des mauvaises herbes"
                />
              </label>
            </div>
            <button className="btn" type="submit" style={{ marginTop: 14 }}>
              Ajouter
            </button>
          </form>
        </div>
      )}

      {erreur && <div className="error-text">{erreur}</div>}

      <div className="panel">
        <h2>Visites du {date}</h2>
        {visites.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Aucune visite planifiée ce jour-là.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Client</th>
                <th>Adresse</th>
                <th>Services</th>
                <th>Contrat</th>
                <th>Ordre route</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visites.map((v) => (
                <tr key={v.id}>
                  <td>{v.scheduledAt.slice(11, 16)}</td>
                  <td>{v.clientName}</td>
                  <td>
                    {v.addressLine}, {v.city}
                  </td>
                  <td>{v.services || "—"}</td>
                  <td>
                    {v.documentId ? (
                      <Link to={`/documents/${v.documentId}`}>{v.contractNumber ?? `#${v.documentId}`}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{v.routePosition ? <span className="chip">no {v.routePosition}</span> : "—"}</td>
                  <td>
                    <select value={v.status} onChange={(e) => changerStatut(v, e.target.value)}>
                      {Object.entries(STATUTS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn danger small" onClick={() => supprimer(v.id)}>
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Prochaines visites planifiées</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Les visites des contrats signés apparaissent ici automatiquement — changez la
          date/heure directement dans la liste, l'ordre du jour suit.
        </p>
        {aVenir.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Aucune visite à venir.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Date & heure</th>
                  <th>Client</th>
                  <th>Services</th>
                  <th>Contrat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {aVenir.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <input
                        type="datetime-local"
                        defaultValue={v.scheduledAt.slice(0, 16)}
                        onBlur={(e) => e.target.value !== v.scheduledAt.slice(0, 16) && deplacer(v, e.target.value)}
                      />
                    </td>
                    <td>{v.clientName}</td>
                    <td>{v.services || "—"}</td>
                    <td>
                      {v.documentId ? (
                        <Link to={`/documents/${v.documentId}`}>{v.contractNumber ?? `#${v.documentId}`}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button className="btn danger small" onClick={() => supprimer(v.id)}>
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {plan && (
        <div className="grid cols-2">
          <div className="panel">
            <h2>Itinéraire optimisé</h2>
            <p style={{ color: "var(--muted)" }}>
              Départ et retour : {plan.depot.adresse}
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Arrêt</th>
                  <th>Client</th>
                  <th>Adresse</th>
                </tr>
              </thead>
              <tbody>
                {plan.optimise.ordre.map((a) => (
                  <tr key={a.visiteId}>
                    <td>
                      <span className="chip">no {a.arret}</span>
                    </td>
                    <td>{a.client}</td>
                    <td>{a.adresse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="area-readout">
              <div className="measure">
                <div className="label">Distance totale</div>
                <div className="value">{formatDistance(plan.optimise.distanceMetres)}</div>
              </div>
              <div className="measure">
                <div className="label">Durée de conduite</div>
                <div className="value">{formatDuree(plan.optimise.dureeSecondes)}</div>
              </div>
            </div>
          </div>
          <div className="panel">
            <h2>Comparaison avec l'ordre de saisie</h2>
            <p style={{ color: "var(--muted)" }}>
              Ordre naïf : {plan.naif.ordre.map((a) => a.client).join(" → ")} —{" "}
              {formatDistance(plan.naif.distanceMetres)} · {formatDuree(plan.naif.dureeSecondes)}
            </p>
            <p>
              <strong>
                Gain de l'optimisation :{" "}
                {plan.gainMetres > 0
                  ? `${formatDistance(plan.gainMetres)} et ${formatDuree(plan.gainSecondes)} de moins`
                  : "l'ordre de saisie était déjà optimal"}
                .
              </strong>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
