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
          <div className="empty-state">
            <span className="empty-ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </span>
            <p>Aucune soumission reçue pour l'instant.</p>
          </div>
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
          <div className="empty-state">
            <span className="empty-ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
            <p>Aucune notification.</p>
          </div>
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
                    <span className="chip plain">{n.kind}</span>
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
