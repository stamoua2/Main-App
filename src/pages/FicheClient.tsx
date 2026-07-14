import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type Activite, type Client, type DocumentFacturation, type Forfait, type Tache } from "../api";
import { m2ToFt2 } from "../../shared/area";
import { formatCad } from "../../shared/money";
import { FormClient } from "./Clients";
import { classeStatut } from "../statut";
import { Retour } from "../components/Retour";
import { useFeedback } from "../components/Feedback";

const TYPES_ACTIVITE: { valeur: Activite["kind"]; label: string }[] = [
  { valeur: "note", label: "Note" },
  { valeur: "appel", label: "Appel" },
  { valeur: "courriel", label: "Courriel" },
  { valeur: "visite", label: "Visite" },
];

export default function FicheClient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast, confirmer } = useFeedback();
  const [client, setClient] = useState<Client | null>(null);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [documents, setDocuments] = useState<DocumentFacturation[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [edition, setEdition] = useState(params.get("edit") === "1");
  const [erreur, setErreur] = useState("");
  const [noteTexte, setNoteTexte] = useState("");
  const [noteType, setNoteType] = useState<Activite["kind"]>("note");
  const [tacheTexte, setTacheTexte] = useState("");
  const [tacheEcheance, setTacheEcheance] = useState("");

  async function charger() {
    const r = await api.get<{ client: Client }>(`/api/clients/${id}`);
    setClient(r.client);
    const docs = await api.get<{ documents: DocumentFacturation[] }>("/api/documents");
    setDocuments(docs.documents.filter((d) => d.clientId === r.client.id));
  }

  async function chargerActivites() {
    const r = await api.get<{ activites: Activite[] }>(`/api/clients/${id}/followups`);
    setActivites(r.activites);
  }

  async function chargerTaches() {
    const r = await api.get<{ taches: Tache[] }>(`/api/tasks?scope=toutes&clientId=${id}`);
    setTaches(r.taches);
  }

  useEffect(() => {
    charger().catch(() => setErreur("Client introuvable."));
    chargerActivites().catch(() => {});
    chargerTaches().catch(() => {});
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function ajouterActivite(e: FormEvent) {
    e.preventDefault();
    if (!noteTexte.trim()) return;
    try {
      await api.post(`/api/clients/${id}/followups`, { body: noteTexte, kind: noteType });
      setNoteTexte("");
      setNoteType("note");
      toast("Activité enregistrée.");
      await chargerActivites();
      await charger(); // rafraîchit « dernier contact »
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Erreur.", "error");
    }
  }

  async function supprimerActivite(a: Activite) {
    const ok = await confirmer({ titre: "Supprimer cette activité ?", confirmer: "Supprimer", danger: true });
    if (!ok) return;
    await api.delete(`/api/followups/${a.id}`);
    await chargerActivites();
    await charger();
  }

  async function ajouterTache(e: FormEvent) {
    e.preventDefault();
    if (!tacheTexte.trim()) return;
    try {
      await api.post("/api/tasks", {
        title: tacheTexte,
        clientId: Number(id),
        dueOn: tacheEcheance || null,
      });
      setTacheTexte("");
      setTacheEcheance("");
      toast("Tâche ajoutée.");
      await chargerTaches();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Erreur.", "error");
    }
  }

  async function basculerTache(t: Tache) {
    await api.put(`/api/tasks/${t.id}`, { done: !t.done });
    await chargerTaches();
  }

  async function supprimer() {
    if (!client) return;
    const ok = await confirmer({
      titre: `Supprimer ${client.fullName} ?`,
      message: "Cette action est définitive. Un client rattaché à des documents ne peut pas être supprimé.",
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/clients/${client.id}`);
      toast(`${client.fullName} supprimé.`);
      navigate("/clients");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Suppression impossible.", "error");
    }
  }

  if (erreur && !client) return <p className="error-text">{erreur}</p>;
  if (!client) return <p>Chargement…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <Retour to="/clients">Clients</Retour>
          <div className="eyebrow">Fiche client</div>
          <h1>{client.fullName}</h1>
          {client.tags.length > 0 && (
            <div className="tag-rangee">
              {client.tags.map((t) => (
                <span key={t} className="tag-puce">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn secondary" onClick={() => setEdition((v) => !v)}>
            {edition ? "Fermer l'édition" : "Modifier"}
          </button>
          <button className="btn danger" onClick={supprimer}>
            Supprimer
          </button>
        </div>
      </div>

      {erreur && <div className="error-text">{erreur}</div>}

      {edition ? (
        <div className="panel">
          <h2>Modifier le client</h2>
          <FormClient
            initial={{
              firstName: client.firstName,
              lastName: client.lastName,
              email: client.email,
              phone: client.phone,
              addressLine: client.addressLine,
              city: client.city,
              province: client.province,
              postalCode: client.postalCode,
              status: client.status,
              notes: client.notes,
              packageId: client.packageId,
              lotAreaM2: client.lotAreaM2,
              tags: client.tags,
            }}
            forfaits={forfaits}
            onSauvegarde={async (data) => {
              await api.put(`/api/clients/${client.id}`, data);
              setEdition(false);
              toast("Client mis à jour.");
              await charger();
            }}
            onAnnule={() => setEdition(false)}
          />
        </div>
      ) : (
        <div className="grid cols-2">
          <div className="panel">
            <h2>Coordonnées</h2>
            <p>
              {client.addressLine}
              <br />
              {client.city} ({client.province}) {client.postalCode}
            </p>
            <p>
              {client.email && (
                <>
                  {client.email}
                  <br />
                </>
              )}
              {client.phone}
            </p>
            {client.notes && (
              <p style={{ color: "var(--muted)" }}>
                <strong>Notes :</strong> {client.notes}
              </p>
            )}
          </div>
          <div className="panel">
            <h2>Terrain & forfait</h2>
            <p>
              <strong>Forfait :</strong> {client.packageName ?? "Aucun"}
              <br />
              <strong>Statut :</strong> <span className={classeStatut(client.status)}>{client.status}</span>
              <br />
              <strong>Dernier contact :</strong>{" "}
              {client.lastContactOn ? String(client.lastContactOn).slice(0, 10) : "Aucun"}
            </p>
            <p>
              <strong>Superficie du terrain :</strong>{" "}
              {client.lotAreaM2
                ? `${Math.round(m2ToFt2(client.lotAreaM2)).toLocaleString("fr-CA")} pi²`
                : "Non mesurée"}
            </p>
            <Link className="btn secondary small" to={`/superficie?client=${client.id}`}>
              Mesurer sur la carte
            </Link>
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <div className="panel">
          <h2>Historique d'activité</h2>
          <form onSubmit={ajouterActivite} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as Activite["kind"])}
                style={{ maxWidth: 130 }}
              >
                {TYPES_ACTIVITE.map((t) => (
                  <option key={t.valeur} value={t.valeur}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button className="btn small" type="submit">
                Ajouter
              </button>
            </div>
            <textarea
              rows={2}
              value={noteTexte}
              onChange={(e) => setNoteTexte(e.target.value)}
              placeholder="Ex. : Appel — souhaite un devis pour l'aération…"
            />
          </form>
          {activites.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5 }}>Aucune activité enregistrée.</p>
          ) : (
            <ul className="activite-list">
              {activites.map((a) => (
                <li key={a.id} className="activite-item">
                  <div className="activite-entete">
                    <span className={`tag-puce type-${a.kind}`}>
                      {TYPES_ACTIVITE.find((t) => t.valeur === a.kind)?.label ?? a.kind}
                    </span>
                    <span className="activite-date">{String(a.createdAt).slice(0, 10)}</span>
                    <button className="lien-supprimer" onClick={() => supprimerActivite(a)}>
                      Retirer
                    </button>
                  </div>
                  <div className="activite-corps">{a.body}</div>
                  {a.authorName && <div className="activite-auteur">— {a.authorName}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>
            Tâches & relances{" "}
            <Link to="/taches" style={{ fontSize: 13, fontWeight: 500 }}>
              Toutes →
            </Link>
          </h2>
          <form onSubmit={ajouterTache} style={{ marginBottom: 14 }}>
            <input
              value={tacheTexte}
              onChange={(e) => setTacheTexte(e.target.value)}
              placeholder="Ex. : Relancer pour l'estimation…"
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={tacheEcheance} onChange={(e) => setTacheEcheance(e.target.value)} />
              <button className="btn small" type="submit">
                Ajouter
              </button>
            </div>
          </form>
          {taches.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5 }}>Aucune tâche pour ce client.</p>
          ) : (
            <ul className="task-list">
              {taches.map((t) => (
                <li key={t.id} className={`task-item${t.done ? " done" : ""}`}>
                  <label className="task-check">
                    <input type="checkbox" checked={t.done} onChange={() => basculerTache(t)} />
                  </label>
                  <div className="task-body">
                    <div className="task-titre">{t.title}</div>
                    {t.dueOn && <div className="task-meta"><span className="task-notes">Échéance : {t.dueOn}</span></div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Estimations & factures</h2>
        {documents.length === 0 ? (
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <p>Aucun document pour ce client.</p>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>No</th>
                <th>Type</th>
                <th>Statut</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.number}</Link>
                  </td>
                  <td>{d.kind}</td>
                  <td>
                    <span className={classeStatut(d.status)}>{d.status}</span>
                  </td>
                  <td className="num">{formatCad(d.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 12 }}>
          <Link className="btn small" to={`/documents/nouveau?client=${client.id}`}>
            + Nouvelle estimation pour ce client
          </Link>
        </div>
      </div>
    </>
  );
}
