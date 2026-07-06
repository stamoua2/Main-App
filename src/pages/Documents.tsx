import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentFacturation } from "../api";
import { formatCad } from "../../shared/money";
import { classeStatut } from "../statut";

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentFacturation[]>([]);
  const [filtre, setFiltre] = useState<"" | "estimation" | "contrat" | "facture">("");

  useEffect(() => {
    api
      .get<{ documents: DocumentFacturation[] }>(
        filtre ? `/api/documents?type=${filtre}` : "/api/documents",
      )
      .then((r) => setDocuments(r.documents));
  }, [filtre]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Facturation</div>
          <h1>Estimations, contrats & factures</h1>
        </div>
        <Link className="btn" to="/documents/nouveau">
          + Nouvelle estimation
        </Link>
      </div>

      <div className="panel">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([
            ["", "Tous"],
            ["estimation", "Estimations"],
            ["contrat", "Contrats"],
            ["facture", "Factures"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={`btn small ${filtre === value ? "" : "secondary"}`}
              onClick={() => setFiltre(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>No</th>
              <th>Type</th>
              <th>Client</th>
              <th>Date</th>
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
                <td>{d.kind === "estimation" ? "Estimation" : d.kind === "contrat" ? "Contrat" : "Facture"}</td>
                <td>{d.clientName}</td>
                <td>{d.issuedOn}</td>
                <td>
                  <span className={classeStatut(d.status)}>{d.status}</span>
                </td>
                <td className="num">{formatCad(d.totalCents)}</td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <span className="empty-ico">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      </svg>
                    </span>
                    <p>Aucun document pour l'instant. Créez votre première estimation !</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
