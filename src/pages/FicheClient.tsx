import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Client, type DocumentFacturation, type Forfait } from "../api";
import { m2ToFt2 } from "../../shared/area";
import { formatCad } from "../../shared/money";
import { FormClient } from "./Clients";
import { classeStatut } from "../statut";

export default function FicheClient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [documents, setDocuments] = useState<DocumentFacturation[]>([]);
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const r = await api.get<{ client: Client }>(`/api/clients/${id}`);
    setClient(r.client);
    const docs = await api.get<{ documents: DocumentFacturation[] }>("/api/documents");
    setDocuments(docs.documents.filter((d) => d.clientId === r.client.id));
  }

  useEffect(() => {
    charger().catch(() => setErreur("Client introuvable."));
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function supprimer() {
    if (!client) return;
    if (!window.confirm(`Supprimer définitivement ${client.fullName} ?`)) return;
    try {
      await api.delete(`/api/clients/${client.id}`);
      navigate("/clients");
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Suppression impossible.");
    }
  }

  if (erreur && !client) return <p className="error-text">{erreur}</p>;
  if (!client) return <p>Chargement…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fiche client</div>
          <h1>{client.fullName}</h1>
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
            }}
            forfaits={forfaits}
            onSauvegarde={async (data) => {
              await api.put(`/api/clients/${client.id}`, data);
              setEdition(false);
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
