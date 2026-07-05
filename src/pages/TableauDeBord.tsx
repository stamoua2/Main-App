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
  margeMoisCents: number;
  revenusMoisCents: number;
  depensesMoisCents: number;
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
        <div className="panel stat">
          <div className="label">Marge du mois</div>
          <div className="value" style={{ color: data.margeMoisCents < 0 ? "#a33b2a" : undefined }}>
            {formatCad(data.margeMoisCents)}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Revenus {formatCad(data.revenusMoisCents)} − dépenses {formatCad(data.depensesMoisCents)}
          </div>
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

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>État des déploiements Netlify</h2>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13.5 }}>Site vitrine (stamourduvert.com) :</span>
            <a href="https://app.netlify.com/projects/stamourduvert/deploys" target="_blank" rel="noreferrer">
              <img
                src="https://api.netlify.com/api/v1/badges/c69739ef-f7a7-4886-8997-12d00c4cd883/deploy-status"
                alt="Statut du déploiement du site vitrine"
                height={20}
              />
            </a>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13.5 }}>Gestionnaire (cette application) :</span>
            <a href="https://app.netlify.com/projects/mainappsav/deploys" target="_blank" rel="noreferrer">
              <img
                src="https://api.netlify.com/api/v1/badges/b5ef1f7c-c8bf-4e55-a515-4bc19199b933/deploy-status"
                alt="Statut du déploiement du gestionnaire"
                height={20}
              />
            </a>
          </div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
          Les badges se mettent à jour automatiquement selon le dernier déploiement de
          production; cliquez pour ouvrir la liste des déploiements dans Netlify.
        </p>
      </div>

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
