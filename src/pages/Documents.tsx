import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentFacturation } from "../api";
import { formatCad } from "../../shared/money";

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentFacturation[]>([]);
  const [filtre, setFiltre] = useState<"" | "estimation" | "facture">("");

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
          <h1>Estimations & factures</h1>
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
                <td>{d.kind === "estimation" ? "Estimation" : "Facture"}</td>
                <td>{d.clientName}</td>
                <td>{d.issuedOn}</td>
                <td>
                  <span className="chip">{d.status}</span>
                </td>
                <td className="num">{formatCad(d.totalCents)}</td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  Aucun document.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
