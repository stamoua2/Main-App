import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentFacturation } from "../api";
import { formatCad } from "../../shared/money";

interface Dashboard {
  clientsActifs: number;
  prospects: number;
  estimationsEnCours: number;
  facturesImpayees: number;
  visitesAujourdhui: number;
  notificationsNonLues: number;
  soumissionsNouvelles: {
    id: number;
    fullName: string;
    address: string;
    sector: string;
    message: string;
    createdAt: string;
  }[];
  documentsRecents: DocumentFacturation[];
  repartitionForfaits: { name: string; clients: number }[];
}

export default function TableauDeBord() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api.get<Dashboard>("/api/dashboard").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <p>Chargement…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Vue d'ensemble</div>
          <h1>Tableau de bord</h1>
        </div>
        <Link className="btn" to="/documents/nouveau">
          + Nouvelle estimation
        </Link>
      </div>

      <div className="grid cols-3">
        <div className="panel stat">
          <div className="label">Clients actifs</div>
          <div className="value">{data.clientsActifs}</div>
        </div>
        <div className="panel stat">
          <div className="label">Prospects</div>
          <div className="value">{data.prospects}</div>
        </div>
        <div className="panel stat">
          <div className="label">Estimations en cours</div>
          <div className="value">{data.estimationsEnCours}</div>
        </div>
        <div className="panel stat">
          <div className="label">Factures impayées</div>
          <div className="value">{data.facturesImpayees}</div>
        </div>
        <div className="panel stat">
          <div className="label">Visites aujourd'hui</div>
          <div className="value">{data.visitesAujourdhui}</div>
        </div>
      </div>

      {data.soumissionsNouvelles.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>
            Nouvelles demandes du site web{" "}
            <Link to="/soumissions" style={{ fontSize: 13, fontWeight: 500 }}>
              Tout voir →
            </Link>
          </h2>
          <table className="data">
            <tbody>
              {data.soumissionsNouvelles.map((s) => (
                <tr key={s.id}>
                  <td>{String(s.createdAt).slice(0, 10)}</td>
                  <td>
                    <strong>{s.fullName}</strong>
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {[s.address, s.sector, s.message].filter(Boolean).join(" · ").slice(0, 120)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>Documents récents</h2>
          {data.documentsRecents.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              Aucun document pour l'instant. Créez votre première estimation !
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Client</th>
                  <th>Statut</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.documentsRecents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/documents/${d.id}`}>{d.number}</Link>
                    </td>
                    <td>{d.clientName}</td>
                    <td>
                      <span className="chip">{d.status}</span>
                    </td>
                    <td className="num">{formatCad(d.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h2>Clients par forfait</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Forfait</th>
                <th className="num">Clients</th>
              </tr>
            </thead>
            <tbody>
              {data.repartitionForfaits.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r.clients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
