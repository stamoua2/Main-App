import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentFacturation } from "../api";
import { formatCad } from "../../shared/money";
import { classeStatut } from "../statut";
import { SkeletonTable } from "../components/Skeleton";

interface Etape {
  cle: string;
  titre: string;
  count: number;
  totalCents: number;
  deals: DocumentFacturation[];
}

// Accent de couleur par étape (repris de la charte verte, ambre pour l'attente,
// rouge pour le perdu) — donne au tableau une lecture d'entonnoir immédiate.
const ACCENTS: Record<string, string> = {
  estimation: "#8a6d3b",
  contrat: "#2f6d9e",
  facture: "#b06a1f",
  paye: "#2e8255",
  perdu: "#a33b2a",
};

export default function Pipeline() {
  const [stages, setStages] = useState<Etape[] | null>(null);

  useEffect(() => {
    api.get<{ stages: Etape[] }>("/api/pipeline").then((r) => setStages(r.stages));
  }, []);

  const totalActif = stages
    ? stages
        .filter((s) => s.cle !== "perdu")
        .reduce((acc, s) => acc + s.totalCents, 0)
    : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Cycle de vente</div>
          <h1>Pipeline</h1>
        </div>
        <Link className="btn" to="/documents/nouveau">
          + Nouvelle estimation
        </Link>
      </div>

      {stages === null ? (
        <div className="panel">
          <SkeletonTable lignes={5} colonnes={4} />
        </div>
      ) : (
        <>
          <p style={{ color: "var(--muted)", marginTop: -6, marginBottom: 16 }}>
            Suivi des dossiers du premier contact au paiement. Valeur active en cours (hors refusés) :{" "}
            <strong>{formatCad(totalActif)}</strong>.
          </p>
          <div className="pipeline-board">
            {stages.map((s) => (
              <section className="pipeline-col" key={s.cle} style={{ ["--accent" as string]: ACCENTS[s.cle] }}>
                <header className="pipeline-col-head">
                  <div className="pipeline-col-titre">
                    {s.titre}
                    <span className="pipeline-count">{s.count}</span>
                  </div>
                  <div className="pipeline-col-total">{formatCad(s.totalCents)}</div>
                </header>
                <div className="pipeline-cards">
                  {s.deals.length === 0 ? (
                    <p className="pipeline-vide">Aucun dossier.</p>
                  ) : (
                    s.deals.map((d) => (
                      <Link to={`/documents/${d.id}`} className="pipeline-card" key={d.id}>
                        <div className="pipeline-card-haut">
                          <span className="pipeline-num">{d.number}</span>
                          <span className={classeStatut(d.status)}>{d.status}</span>
                        </div>
                        <div className="pipeline-client">{d.clientName}</div>
                        <div className="pipeline-card-bas">
                          <span className="pipeline-date">{d.issuedOn}</span>
                          <span className="pipeline-montant">{formatCad(d.totalCents)}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
