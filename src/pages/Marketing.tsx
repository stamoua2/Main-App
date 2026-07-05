import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

interface Campagne {
  id: number;
  name: string;
  channel: string;
  content: string;
  launchOn: string | null;
  status: string;
}

const STATUTS = ["planifiée", "lancée", "terminée", "annulée"];

export default function Marketing() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [nouvelle, setNouvelle] = useState({ name: "", channel: "Facebook", content: "", launchOn: "" });
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    const r = await api.get<{ campagnes: Campagne[] }>("/api/campaigns");
    setCampagnes(r.campagnes);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creer(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    try {
      await api.post("/api/campaigns", nouvelle);
      setFormVisible(false);
      setNouvelle({ name: "", channel: "Facebook", content: "", launchOn: "" });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    }
  }

  async function changerStatut(c: Campagne, status: string) {
    await api.put(`/api/campaigns/${c.id}`, { status });
    await charger();
  }

  async function supprimer(id: number) {
    await api.delete(`/api/campaigns/${id}`);
    await charger();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Opérations</div>
          <h1>Marketing</h1>
        </div>
        <button className="btn" onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? "Fermer" : "+ Nouvelle campagne"}
        </button>
      </div>

      {formVisible && (
        <div className="panel">
          <h2>Planifier une campagne</h2>
          <form onSubmit={creer}>
            <div className="form-grid">
              <label className="field" style={{ gridColumn: "span 2" }}>
                Nom de la campagne
                <input value={nouvelle.name} onChange={(e) => setNouvelle({ ...nouvelle, name: e.target.value })} required />
              </label>
              <label className="field">
                Canal
                <select value={nouvelle.channel} onChange={(e) => setNouvelle({ ...nouvelle, channel: e.target.value })}>
                  <option>Facebook</option>
                  <option>Courriel</option>
                  <option>Porte-à-porte</option>
                  <option>Google</option>
                  <option>Autre</option>
                </select>
              </label>
              <label className="field">
                Date de lancement
                <input type="date" value={nouvelle.launchOn} onChange={(e) => setNouvelle({ ...nouvelle, launchOn: e.target.value })} required />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Contenu / message
                <textarea rows={3} value={nouvelle.content} onChange={(e) => setNouvelle({ ...nouvelle, content: e.target.value })} />
              </label>
            </div>
            {erreur && <div className="error-text">{erreur}</div>}
            <button className="btn" type="submit" style={{ marginTop: 14 }}>
              Planifier
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <h2>Campagnes</h2>
        {campagnes.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Aucune campagne. Planifiez la première !</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Lancement</th>
                <th>Campagne</th>
                <th>Canal</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campagnes.map((c) => (
                <tr key={c.id}>
                  <td>{c.launchOn ?? "—"}</td>
                  <td>
                    <strong>{c.name}</strong>
                    {c.content && (
                      <>
                        <br />
                        <span style={{ color: "var(--muted)", fontSize: 13 }}>{c.content.slice(0, 120)}</span>
                      </>
                    )}
                  </td>
                  <td>{c.channel || "—"}</td>
                  <td>
                    <select value={c.status} onChange={(e) => changerStatut(c, e.target.value)} style={{ font: "inherit", padding: "4px 8px", borderRadius: 8 }}>
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn danger small" onClick={() => supprimer(c.id)}>
                      Supprimer
                    </button>
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
