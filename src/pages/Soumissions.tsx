import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type NotificationApp, type Prospect } from "../api";

const STATUTS: Record<string, string> = {
  nouveau: "nouveau",
  "contacté": "contacté",
  converti: "converti",
  "fermé": "fermé",
};

export default function Soumissions() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [notifications, setNotifications] = useState<NotificationApp[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    const [leads, notifs] = await Promise.all([
      api.get<{ prospects: Prospect[] }>("/api/leads"),
      api.get<{ notifications: NotificationApp[]; nonLues: number }>("/api/notifications"),
    ]);
    setProspects(leads.prospects);
    setNotifications(notifs.notifications);
    setNonLues(notifs.nonLues);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function convertir(p: Prospect) {
    setErreur("");
    try {
      await api.post(`/api/leads/${p.id}/convert`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Conversion impossible.");
    }
  }

  async function changerStatut(p: Prospect, status: string) {
    await api.put(`/api/leads/${p.id}`, { status });
    await charger();
  }

  async function marquerLues() {
    await api.post("/api/notifications/lues", {});
    await charger();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Site web</div>
          <h1>Soumissions web</h1>
        </div>
        {nonLues > 0 && (
          <button className="btn secondary" onClick={marquerLues}>
            Marquer les {nonLues} notification{nonLues > 1 ? "s" : ""} comme lue{nonLues > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {erreur && <div className="error-text">{erreur}</div>}

      <div className="panel">
        <h2>Demandes reçues du formulaire stamourduvert.com</h2>
        {prospects.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Aucune soumission reçue pour l'instant.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Reçue le</th>
                <th>Nom</th>
                <th>Coordonnées</th>
                <th>Terrain</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id}>
                  <td>{String(p.createdAt).slice(0, 10)}</td>
                  <td>{p.fullName}</td>
                  <td>
                    {p.email}
                    <br />
                    {p.phone}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {p.address && (
                      <>
                        {p.address} {p.sector && `(${p.sector})`}
                        <br />
                      </>
                    )}
                    <span style={{ color: "var(--muted)" }}>{p.message}</span>
                  </td>
                  <td>
                    <select
                      value={p.status}
                      onChange={(e) => changerStatut(p, e.target.value)}
                      style={{ font: "inherit", padding: "4px 8px", borderRadius: 8 }}
                      disabled={p.status === "converti"}
                    >
                      {Object.entries(STATUTS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {p.clientId ? (
                      <Link className="btn secondary small" to={`/clients/${p.clientId}`}>
                        Voir le client
                      </Link>
                    ) : (
                      <button className="btn small" onClick={() => convertir(p)}>
                        Convertir en client
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Notifications</h2>
        {notifications.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Aucune notification.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Notification</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} style={n.read ? { opacity: 0.6 } : undefined}>
                  <td>{String(n.created_at).slice(0, 10)}</td>
                  <td>
                    <span className={`chip${n.kind === "paiement" ? "" : " warn"}`}>{n.kind}</span>
                  </td>
                  <td>
                    <strong>{n.title}</strong>
                    {n.body && (
                      <>
                        <br />
                        <span style={{ color: "var(--muted)" }}>{n.body}</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
