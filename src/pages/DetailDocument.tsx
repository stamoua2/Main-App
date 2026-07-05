import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type DocumentFacturation, type Visite } from "../api";
import { formatCad, formatPct } from "../../shared/money";

const KIND_LABELS = { estimation: "Estimation", contrat: "Contrat", facture: "Facture" } as const;

export default function DetailDocument() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentFacturation | null>(null);
  const [visites, setVisites] = useState<Visite[]>([]);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [squareEnCours, setSquareEnCours] = useState(false);

  useEffect(() => {
    setMessage("");
    api
      .get<{ document: DocumentFacturation }>(`/api/documents/${id}`)
      .then((r) => {
        setDoc(r.document);
        if (r.document.kind === "contrat") {
          api
            .get<{ visites: Visite[] }>(`/api/visits?documentId=${r.document.id}`)
            .then((v) => setVisites(v.visites));
        } else {
          setVisites([]);
        }
      })
      .catch(() => setErreur("Document introuvable."));
  }, [id]);

  async function convertir() {
    if (!doc) return;
    try {
      const r = await api.post<{ document: DocumentFacturation }>(`/api/documents/${doc.id}/convert`);
      navigate(`/documents/${r.document.id}`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Conversion impossible.");
    }
  }

  // Estimation acceptée → contrat (+ visites de la saison générées).
  async function creerContrat() {
    if (!doc) return;
    try {
      const r = await api.post<{ document: DocumentFacturation; visitesGenerees: number }>(
        `/api/documents/${doc.id}/contract`,
      );
      navigate(`/documents/${r.document.id}`, {
        state: { message: `${r.visitesGenerees} visites générées au calendrier.` },
      });
      setMessage(`Contrat créé — ${r.visitesGenerees} visites proposées au calendrier (ajustables).`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Création du contrat impossible.");
    }
  }

  async function envoyerSquare() {
    if (!doc) return;
    setErreur("");
    setSquareEnCours(true);
    try {
      await api.post(`/api/documents/${doc.id}/square`);
      const r = await api.get<{ document: DocumentFacturation }>(`/api/documents/${doc.id}`);
      setDoc(r.document);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Envoi vers Square impossible.");
    } finally {
      setSquareEnCours(false);
    }
  }

  async function synchroniserSquare() {
    if (!doc) return;
    setErreur("");
    setSquareEnCours(true);
    try {
      await api.post(`/api/documents/${doc.id}/square/sync`);
      const r = await api.get<{ document: DocumentFacturation }>(`/api/documents/${doc.id}`);
      setDoc(r.document);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Synchronisation impossible.");
    } finally {
      setSquareEnCours(false);
    }
  }

  async function supprimer() {
    if (!doc) return;
    if (!window.confirm(`Supprimer ${doc.number} ?`)) return;
    await api.delete(`/api/documents/${doc.id}`);
    navigate("/documents");
  }

  if (erreur && !doc) return <p className="error-text">{erreur}</p>;
  if (!doc) return <p>Chargement…</p>;

  const estEstimation = doc.kind === "estimation";
  const estContrat = doc.kind === "contrat";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{KIND_LABELS[doc.kind]}</div>
          <h1>{doc.number}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer">
            Télécharger le PDF
          </a>
          {estEstimation && (
            <button className="btn secondary" onClick={creerContrat}>
              Accepter → créer le contrat
            </button>
          )}
          {estEstimation && (
            <button className="btn secondary" onClick={convertir}>
              Convertir en facture
            </button>
          )}
          {estContrat && (
            <Link className="btn secondary" to={`/documents/nouveau?client=${doc.clientId}&type=facture`}>
              + Facture supplémentaire
            </Link>
          )}
          {!doc.squareInvoiceId && (
            <button className="btn secondary" onClick={envoyerSquare} disabled={squareEnCours}>
              {squareEnCours
                ? "Envoi…"
                : estEstimation
                  ? "Créer le brouillon Square"
                  : estContrat
                    ? "Envoyer le contrat via Square"
                    : "Envoyer vers Square"}
            </button>
          )}
          {doc.squareInvoiceId && (
            <button className="btn secondary" onClick={synchroniserSquare} disabled={squareEnCours}>
              {squareEnCours ? "Synchronisation…" : "Synchroniser le paiement Square"}
            </button>
          )}
          <button className="btn danger" onClick={supprimer}>
            Supprimer
          </button>
        </div>
      </div>

      {message && <div className="ok-text">{message}</div>}
      {erreur && <div className="error-text">{erreur}</div>}
      {estContrat && !doc.squareInvoiceId && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6 }}>
          Envoyez le contrat via Square : le client reçoit une facture avec acompte —
          le paiement de l'acompte confirme la signature (statut « signé » automatique).
        </p>
      )}

      <div className="doc-meta">
        <span>
          <strong>Client :</strong> <Link to={`/clients/${doc.clientId}`}>{doc.clientName}</Link>
        </span>
        <span>
          <strong>Date :</strong> {doc.issuedOn}
        </span>
        <span>
          <strong>Statut :</strong> <span className="chip">{doc.status}</span>
        </span>
        <span>
          <strong>Taxes :</strong> {doc.taxesEnabled ? "TPS/TVQ appliquées" : "non applicables"}
        </span>
        {doc.convertedFromId && (
          <span>
            Convertie de l'estimation{" "}
            <Link to={`/documents/${doc.convertedFromId}`}>#{doc.convertedFromId}</Link>
          </span>
        )}
        {doc.squareInvoiceId && (
          <span>
            <strong>Square :</strong> {doc.squareInvoiceId}{" "}
            <span className="chip">{doc.squarePaymentStatus ?? "—"}</span>{" "}
            {doc.squarePublicUrl && (
              <a href={doc.squarePublicUrl} target="_blank" rel="noreferrer">
                page de paiement
              </a>
            )}
          </span>
        )}
      </div>

      <div className="panel">
        <h2>Lignes</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qté</th>
              <th className="num">Prix unitaire</th>
              <th className="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines?.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{formatCad(l.unitPriceCents)}</td>
                <td className="num">{formatCad(l.amountCents ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals-box" style={{ marginTop: 18 }}>
          <div className="row">
            <span>Sous-total</span>
            <span className="num">{formatCad(doc.subtotalCents)}</span>
          </div>
          {doc.taxesEnabled ? (
            <>
              <div className="row">
                <span>TPS ({formatPct(doc.tpsRate)})</span>
                <span className="num">{formatCad(doc.tpsCents)}</span>
              </div>
              <div className="row">
                <span>TVQ ({formatPct(doc.tvqRate)})</span>
                <span className="num">{formatCad(doc.tvqCents)}</span>
              </div>
            </>
          ) : (
            <div className="row" style={{ color: "var(--muted)" }}>
              <span>Taxes non applicables</span>
              <span className="num">—</span>
            </div>
          )}
          <div className="row total">
            <span>Total (CAD)</span>
            <span className="num">{formatCad(doc.totalCents)}</span>
          </div>
          {doc.depositCents > 0 && (
            <>
              <div className="row">
                <span>{estEstimation ? "Acompte requis" : "Acompte reçu"}</span>
                <span className="num">−{formatCad(doc.depositCents)}</span>
              </div>
              <div className="row">
                <span>Solde à payer</span>
                <span className="num">{formatCad(doc.balanceCents)}</span>
              </div>
            </>
          )}
        </div>
        {doc.notes && (
          <p style={{ color: "var(--muted)", marginTop: 16 }}>
            <strong>Notes :</strong> {doc.notes}
          </p>
        )}
      </div>

      {estContrat && (
        <div className="panel">
          <h2>
            Visites du contrat{" "}
            <Link to="/calendrier" style={{ fontSize: 13, fontWeight: 500 }}>
              Ouvrir le calendrier →
            </Link>
          </h2>
          {visites.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Aucune visite liée à ce contrat.</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Service</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {visites.map((v) => (
                    <tr key={v.id}>
                      <td>{v.scheduledAt.slice(0, 10)}</td>
                      <td>{v.services}</td>
                      <td>
                        <span className="chip">{v.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Ces visites ont été proposées automatiquement à la création du contrat —
            déplacez-les librement dans le calendrier.
          </p>
        </div>
      )}
    </>
  );
}
