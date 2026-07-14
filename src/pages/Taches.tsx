import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Client, type Tache } from "../api";
import { useFeedback } from "../components/Feedback";
import { SkeletonTable } from "../components/Skeleton";

type Portee = "ouvertes" | "terminees" | "toutes";

const PRIORITES: { valeur: Tache["priority"]; label: string }[] = [
  { valeur: "basse", label: "Basse" },
  { valeur: "normale", label: "Normale" },
  { valeur: "haute", label: "Haute" },
];

const TACHE_VIDE = { title: "", notes: "", dueOn: "", priority: "normale" as Tache["priority"], clientId: "" };

// État d'échéance pour la lecture visuelle (rouge = en retard, ambre = aujourd'hui).
function etatEcheance(t: Tache): { classe: string; texte: string } | null {
  if (!t.dueOn) return null;
  const auj = new Date().toISOString().slice(0, 10);
  if (t.done) return { classe: "chip ok", texte: t.dueOn };
  if (t.dueOn < auj) return { classe: "chip danger", texte: `En retard · ${t.dueOn}` };
  if (t.dueOn === auj) return { classe: "chip warn", texte: "Aujourd'hui" };
  return { classe: "chip info", texte: t.dueOn };
}

export default function Taches() {
  const [taches, setTaches] = useState<Tache[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [portee, setPortee] = useState<Portee>("ouvertes");
  const [form, setForm] = useState(TACHE_VIDE);
  const [formVisible, setFormVisible] = useState(false);
  const { toast, confirmer } = useFeedback();

  const charger = useCallback(async () => {
    const r = await api.get<{ taches: Tache[] }>(`/api/tasks?scope=${portee}`);
    setTaches(r.taches);
  }, [portee]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    api.get<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients));
  }, []);

  async function creer(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/tasks", {
        title: form.title,
        notes: form.notes,
        dueOn: form.dueOn || null,
        priority: form.priority,
        clientId: form.clientId ? Number(form.clientId) : null,
      });
      setForm(TACHE_VIDE);
      setFormVisible(false);
      toast("Tâche ajoutée.");
      await charger();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Erreur lors de l'ajout.", "error");
    }
  }

  async function basculer(t: Tache) {
    try {
      await api.put(`/api/tasks/${t.id}`, { done: !t.done });
      await charger();
    } catch {
      toast("Impossible de mettre à jour la tâche.", "error");
    }
  }

  async function supprimer(t: Tache) {
    const ok = await confirmer({
      titre: "Supprimer cette tâche ?",
      message: t.title,
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/tasks/${t.id}`);
      toast("Tâche supprimée.");
      await charger();
    } catch {
      toast("Erreur lors de la suppression.", "error");
    }
  }

  const compteOuvertes = useMemo(
    () => (taches ? taches.filter((t) => !t.done).length : 0),
    [taches],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Suivi & relances</div>
          <h1>Tâches</h1>
        </div>
        <button className="btn" onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? "Fermer" : "+ Nouvelle tâche"}
        </button>
      </div>

      {formVisible && (
        <div className="panel">
          <h2>Nouvelle tâche</h2>
          <form onSubmit={creer}>
            <div className="form-grid">
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Tâche
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex. : Rappeler pour l'estimation EST-2026-0003"
                  required
                />
              </label>
              <label className="field">
                Échéance
                <input type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
              </label>
              <label className="field">
                Priorité
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as Tache["priority"] })}
                >
                  {PRIORITES.map((p) => (
                    <option key={p.valeur} value={p.valeur}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Client (optionnel)
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Notes
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <button className="btn" type="submit" style={{ marginTop: 14 }}>
              Ajouter la tâche
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([
            ["ouvertes", `À faire${compteOuvertes ? ` (${compteOuvertes})` : ""}`],
            ["terminees", "Terminées"],
            ["toutes", "Toutes"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={`btn small ${portee === value ? "" : "secondary"}`}
              onClick={() => setPortee(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {taches === null ? (
          <SkeletonTable lignes={5} colonnes={4} />
        ) : taches.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 12H3" />
                <path d="M16 6H3" />
                <path d="M16 18H3" />
                <path d="m18 9 3 3-3 3" />
              </svg>
            </span>
            <p>Aucune tâche {portee === "ouvertes" ? "à faire" : portee === "terminees" ? "terminée" : ""}.</p>
          </div>
        ) : (
          <ul className="task-list">
            {taches.map((t) => {
              const ech = etatEcheance(t);
              return (
                <li key={t.id} className={`task-item${t.done ? " done" : ""}`}>
                  <label className="task-check">
                    <input type="checkbox" checked={t.done} onChange={() => basculer(t)} />
                  </label>
                  <div className="task-body">
                    <div className="task-titre">
                      {t.priority === "haute" && <span className="task-prio" title="Priorité haute" />}
                      {t.title}
                    </div>
                    <div className="task-meta">
                      {ech && <span className={ech.classe}>{ech.texte}</span>}
                      {t.clientName && (
                        <Link to={`/clients/${t.clientId}`} className="task-client">
                          {t.clientName}
                        </Link>
                      )}
                      {t.notes && <span className="task-notes">{t.notes}</span>}
                    </div>
                  </div>
                  <button className="btn danger small" onClick={() => supprimer(t)}>
                    Supprimer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
