import { useEffect, useState } from "react";
import { api, type Forfait } from "../api";

export default function Forfaits() {
  const [forfaits, setForfaits] = useState<Forfait[]>([]);

  useEffect(() => {
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Nos forfaits</div>
          <h1>Forfaits d'entretien</h1>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: -10, marginBottom: 22 }}>
        Tels qu'affichés sur stamourduvert.com — chaque forfait est personnalisé au
        terrain du client; le prix est établi à la soumission.
      </p>
      <div className="pkg-grid">
        {forfaits.map((f) => (
          <div key={f.id} className={`pkg-card${f.popular ? " popular" : ""}`}>
            {f.popular && <span className="flag">Le plus populaire</span>}
            <h3>{f.name}</h3>
            <div>
              <span className="visits">{f.visits}</span>
            </div>
            <p className="tagline">{f.tagline}</p>
            <ul>
              {f.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
