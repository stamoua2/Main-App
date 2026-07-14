import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentFacturation, type Tache } from "../api";
import { formatCad } from "../../shared/money";
import { classeStatut } from "../statut";

interface Dashboard {
  clientsActifs: number;
  prospects: number;
  estimationsEnCours: number;
  contratsActifs: number;
  facturesImpayees: number;
  visitesAujourdhui: number;
  tachesEnRetard: number;
  tachesAujourdhui: number;
  prochainesTaches: Tache[];
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

interface EtapePipeline {
  cle: string;
  titre: string;
  count: number;
  totalCents: number;
}

const ACCENTS_ETAPE: Record<string, string> = {
  estimation: "#8a6d3b",
  contrat: "#2f6d9e",
  facture: "#b06a1f",
  paye: "#2e8255",
  perdu: "#a33b2a",
};

function CarteStat({
  label,
  valeur,
  to,
  couleur,
  sousTexte,
}: {
  label: string;
  valeur: React.ReactNode;
  to: string;
  couleur?: string;
  sousTexte?: React.ReactNode;
}) {
  return (
    <Link className="panel stat stat-link" to={to}>
      <div className="label">{label}</div>
      <div className="value" style={couleur ? { color: couleur } : undefined}>
        {valeur}
      </div>
      {sousTexte && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{sousTexte}</div>}
    </Link>
  );
}

export default function TableauDeBord() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [pipeline, setPipeline] = useState<EtapePipeline[] | null>(null);

  useEffect(() => {
    api.get<Dashboard>("/api/dashboard").then(setData).catch(() => setData(null));
    api
      .get<{ stages: EtapePipeline[] }>("/api/pipeline")
      .then((r) => setPipeline(r.stages))
      .catch(() => setPipeline([]));
  }, []);

  if (!data) return <p>Chargement…</p>;

  const maxPipeline = pipeline
    ? Math.max(1, ...pipeline.map((s) => s.totalCents))
    : 1;

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

      {data.tachesEnRetard > 0 && (
        <Link to="/taches" className="alert-relance">
          <span className="alert-ico">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <strong>
            {data.tachesEnRetard} relance{data.tachesEnRetard > 1 ? "s" : ""} en retard
          </strong>
          {data.tachesAujourdhui > 0 && <span> · {data.tachesAujourdhui} à faire aujourd'hui</span>}
          <span className="alert-fleche">Voir →</span>
        </Link>
      )}

      <div className="grid cols-3">
        <CarteStat label="Clients actifs" valeur={data.clientsActifs} to="/clients" />
        <CarteStat label="Prospects" valeur={data.prospects} to="/clients" />
        <CarteStat label="Estimations en cours" valeur={data.estimationsEnCours} to="/pipeline" />
        <CarteStat label="Contrats actifs" valeur={data.contratsActifs} to="/pipeline" />
        <CarteStat label="Factures impayées" valeur={data.facturesImpayees} to="/pipeline" />
        <CarteStat label="Visites aujourd'hui" valeur={data.visitesAujourdhui} to="/calendrier" />
        <CarteStat
          label="Marge du mois"
          valeur={formatCad(data.margeMoisCents)}
          to="/finances"
          couleur={data.margeMoisCents < 0 ? "#a33b2a" : undefined}
          sousTexte={
            <>
              Revenus {formatCad(data.revenusMoisCents)} − dépenses {formatCad(data.depensesMoisCents)}
            </>
          }
        />
      </div>

      {pipeline && pipeline.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>
            Pipeline de vente{" "}
            <Link to="/pipeline" style={{ fontSize: 13, fontWeight: 500 }}>
              Ouvrir →
            </Link>
          </h2>
          <div className="funnel">
            {pipeline.map((s) => (
              <Link className="funnel-row" to="/pipeline" key={s.cle}>
                <span className="funnel-label">{s.titre}</span>
                <span className="funnel-track">
                  <span
                    className="funnel-fill"
                    style={{
                      width: `${Math.max(3, (s.totalCents / maxPipeline) * 100)}%`,
                      background: ACCENTS_ETAPE[s.cle],
                    }}
                  />
                </span>
                <span className="funnel-meta">
                  <strong>{s.count}</strong> · {formatCad(s.totalCents)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.prochainesTaches.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>
            Relances à venir{" "}
            <Link to="/taches" style={{ fontSize: 13, fontWeight: 500 }}>
              Toutes les tâches →
            </Link>
          </h2>
          <ul className="relance-list">
            {data.prochainesTaches.map((t) => {
              const auj = new Date().toISOString().slice(0, 10);
              const classe =
                t.dueOn && t.dueOn < auj
                  ? "chip danger"
                  : t.dueOn === auj
                    ? "chip warn"
                    : t.dueOn
                      ? "chip info"
                      : "chip";
              return (
                <li key={t.id}>
                  <span className={classe}>
                    {t.dueOn ? (t.dueOn < auj ? `En retard · ${t.dueOn}` : t.dueOn === auj ? "Aujourd'hui" : t.dueOn) : "Sans date"}
                  </span>
                  <span className="relance-titre">{t.title}</span>
                  {t.clientName && (
                    <Link to={`/clients/${t.clientId}`} style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {t.clientName}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
                      <span className={classeStatut(d.status)}>{d.status}</span>
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
