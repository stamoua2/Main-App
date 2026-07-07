import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type DocumentFacturation, type Visite } from "../api";
import { formatCad, formatPct } from "../../shared/money";
import { classeStatut } from "../statut";

const KIND_LABELS = { estimation: "Estimation", contrat: "Contrat", facture: "Facture" } as const;

function estPaye(statut: string): boolean {
  return ["payé", "payée"].includes(statut.toLowerCase());
}

export default function DetailDocument() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [doc, setDoc] = useState<DocumentFacturation | null>(null);
  const [visites, setVisites] = useState<Visite[]>([]);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [squareEnCours, setSquareEnCours] = useState(false);

  function recharger() {
    return api
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
  }

  useEffect(() => {
    // Message transmis par une action précédente (ex. : contrat créé).
    setMessage((location.state as { message?: string } | null)?.message ?? "");
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Estimation acceptée → contrat (+ visites; le contrat part vers Square auto).
  async function creerContrat() {
    if (!doc) return;
    try {
      const r = await api.post<{ document: DocumentFacturation; visitesGenerees: number; squareError?: string | null }>(
        `/api/documents/${doc.id}/contract`,
      );
      const base = `Contrat créé — ${r.visitesGenerees} visites proposées au calendrier (ajustables).`;
      navigate(`/documents/${r.document.id}`, {
        state: {
          message: r.squareError
            ? `${base} L'envoi vers Square a échoué (${r.squareError}) — utilisez « Réessayer l'envoi Square ».`
            : `${base} La facture a été envoyée à Square automatiquement.`,
        },
      });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Création du contrat impossible.");
    }
  }

  async function convertir() {
    if (!doc) return;
    try {
      const r = await api.post<{ document: DocumentFacturation; squareError?: string | null }>(
        `/api/documents/${doc.id}/convert`,
      );
      navigate(`/documents/${r.document.id}`, {
        state: {
          message: r.squareError
            ? `Facture créée. L'envoi vers Square a échoué (${r.squareError}) — utilisez « Réessayer l'envoi Square ».`
            : "Facture créée et envoyée à Square automatiquement.",
        },
      });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Conversion impossible.");
    }
  }

  // Filet de secours : ré-envoi vers Square si l'envoi automatique a échoué.
  async function reessayerSquare() {
    if (!doc) return;
    setErreur("");
    setSquareEnCours(true);
    try {
      await api.post(`/api/documents/${doc.id}/square`);
      await recharger();
      setMessage("Envoyé à Square.");
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Envoi vers Square impossible.");
    } finally {
      setSquareEnCours(false);
    }
  }

  async function refuser() {
    if (!doc) return;
    if (
      !window.confirm(
        `Marquer ${doc.number} comme refusée ?${doc.squareInvoiceId ? " La facture liée sera retirée de Square." : ""}`,
      )
    )
      return;
    setErreur("");
    setSquareEnCours(true);
    try {
      const r = await api.post<{ document: DocumentFacturation }>(`/api/documents/${doc.id}/refuse`);
      setDoc(r.document);
      setMessage("Estimation refusée." + (doc.squareInvoiceId ? " Facture retirée de Square." : ""));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de refuser l'estimation.");
    } finally {
      setSquareEnCours(false);
    }
  }

  async function supprimer() {
    if (!doc) return;
    if (
      !window.confirm(
        `Supprimer ${doc.number} ?${doc.squareInvoiceId ? " La facture liée sera aussi retirée de Square." : ""}`,
      )
    )
      return;
    setErreur("");
    try {
      await api.delete(`/api/documents/${doc.id}`);
      navigate("/documents");
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Suppression impossible.");
    }
  }

  if (erreur && !doc) return <p className="error-text">{erreur}</p>;
  if (!doc) return <p>Chargement…</p>;

  const estEstimation = doc.kind === "estimation";
  const estContrat = doc.kind === "contrat";
  const peutModifier = !estPaye(doc.status) && doc.status !== "refusée";
  // Contrat/facture qui devrait être dans Square mais n'y est pas (envoi auto
  // échoué) → on propose de réessayer.
  const envoiSquareARefaire = !estEstimation && !doc.squareInvoiceId && doc.status !== "refusée";

  // Parcours : le document courant + les documents de la même lignée.
  const lignee = [
    { id: doc.id, kind: doc.kind, number: doc.number, status: doc.status },
    ...(doc.related ?? []),
  ];
  const paye = lignee.some((d) => estPaye(d.status));
  const etapes: { kind: "estimation" | "contrat" | "facture"; label: string }[] = [
    { kind: "estimation", label: "Estimation" },
    { kind: "contrat", label: "Contrat" },
    { kind: "facture", label: "Facture" },
  ];

  const prochaineAction = estEstimation
    ? doc.status === "refusée"
      ? "Estimation refusée — aucune action requise."
      : "Prochaine étape : « Accepter » pour créer le contrat (envoyé à Square avec acompte), ou « Convertir en facture »."
    : estContrat
      ? paye
        ? "Acompte payé — contrat signé. Ajoutez des factures supplémentaires au besoin."
        : "En attente du paiement de l'acompte dans Square. Le paiement confirme la signature automatiquement."
      : paye
        ? "Facture payée."
        : "En attente du paiement dans Square. Le statut se met à jour automatiquement (aucune action requise).";

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
          {estEstimation && doc.status !== "refusée" && (
            <button className="btn secondary" onClick={creerContrat}>
              Accepter → créer le contrat
            </button>
          )}
          {estEstimation && doc.status !== "refusée" && (
            <button className="btn secondary" onClick={convertir}>
              Convertir en facture
            </button>
          )}
          {estContrat && (
            <Link className="btn secondary" to={`/documents/nouveau?client=${doc.clientId}&type=facture`}>
              + Facture supplémentaire
            </Link>
          )}
          {peutModifier && (
            <Link className="btn secondary" to={`/documents/${doc.id}/modifier`}>
              Modifier
            </Link>
          )}
          {envoiSquareARefaire && (
            <button className="btn secondary" onClick={reessayerSquare} disabled={squareEnCours}>
              {squareEnCours ? "Envoi…" : "Réessayer l'envoi Square"}
            </button>
          )}
          {estEstimation && doc.status !== "refusée" && (
            <button className="btn danger" onClick={refuser} disabled={squareEnCours}>
              {squareEnCours ? "…" : "Refuser"}
            </button>
          )}
          <button className="btn danger" onClick={supprimer}>
            Supprimer
          </button>
        </div>
      </div>

      {message && <div className="ok-text">{message}</div>}
      {erreur && <div className="error-text">{erreur}</div>}

      {/* Parcours du dossier : Estimation → Contrat → Facture → Payé */}
      <div className="panel">
        <div className="lifecycle">
          {etapes.map((e) => {
            const docs = lignee.filter((d) => d.kind === e.kind);
            const present = docs.length > 0;
            const courant = doc.kind === e.kind;
            return (
              <div key={e.kind} className={`step ${courant ? "current" : present ? "done" : "todo"}`}>
                <span className="dot" />
                <div className="step-body">
                  <span className="step-label">{e.label}</span>
                  <span className="step-doc">
                    {present
                      ? docs.map((d, i) => (
                          <span key={d.id}>
                            {i > 0 && ", "}
                            {d.id === doc.id ? <strong>{d.number}</strong> : <Link to={`/documents/${d.id}`}>{d.number}</Link>}
                          </span>
                        ))
                      : "—"}
                  </span>
                </div>
              </div>
            );
          })}
          <div className={`step ${paye ? "current done" : "todo"}`}>
            <span className="dot" />
            <div className="step-body">
              <span className="step-label">Payé</span>
              <span className="step-doc">{paye ? "Reçu" : "En attente"}</span>
            </div>
          </div>
        </div>
        <p className="next-action">{prochaineAction}</p>
      </div>

      <div className="doc-meta">
        <span>
          <strong>Client :</strong> <Link to={`/clients/${doc.clientId}`}>{doc.clientName}</Link>
        </span>
        <span>
          <strong>Date :</strong> {doc.issuedOn}
        </span>
        <span>
          <strong>Statut :</strong> <span className={classeStatut(doc.status)}>{doc.status}</span>
        </span>
        <span>
          <strong>Taxes :</strong> {doc.taxesEnabled ? "TPS/TVQ appliquées" : "non applicables"}
        </span>
        {doc.squareInvoiceId ? (
          <span>
            <strong>Square :</strong> <span className="chip plain">{doc.squarePaymentStatus ?? "envoyée"}</span>{" "}
            {doc.squarePublicUrl && (
              <a href={doc.squarePublicUrl} target="_blank" rel="noreferrer">
                page de paiement
              </a>
            )}
          </span>
        ) : (
          !estEstimation && (
            <span>
              <strong>Square :</strong> <span className="chip warn">non envoyée</span>
            </span>
          )
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
                        <span className={classeStatut(v.status)}>{v.status}</span>
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
