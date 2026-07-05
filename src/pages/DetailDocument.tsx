import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type DocumentFacturation } from "../api";
import { formatCad, formatPct } from "../../shared/money";

export default function DetailDocument() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentFacturation | null>(null);
  const [erreur, setErreur] = useState("");
  const [squareEnCours, setSquareEnCours] = useState(false);

  useEffect(() => {
    api
      .get<{ document: DocumentFacturation }>(`/api/documents/${id}`)
      .then((r) => setDoc(r.document))
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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{estEstimation ? "Estimation" : "Facture"}</div>
          <h1>{doc.number}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer">
            Télécharger le PDF
          </a>
          {estEstimation && (
            <button className="btn secondary" onClick={convertir}>
              Convertir en facture
            </button>
          )}
          {!estEstimation && !doc.squareInvoiceId && (
            <button className="btn secondary" onClick={envoyerSquare} disabled={squareEnCours}>
              {squareEnCours ? "Envoi…" : "Envoyer vers Square"}
            </button>
          )}
          {!estEstimation && doc.squareInvoiceId && (
            <button className="btn secondary" onClick={synchroniserSquare} disabled={squareEnCours}>
              {squareEnCours ? "Synchronisation…" : "Synchroniser le paiement Square"}
            </button>
          )}
          <button className="btn danger" onClick={supprimer}>
            Supprimer
          </button>
        </div>
      </div>

      {erreur && <div className="error-text">{erreur}</div>}

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
    </>
  );
}
