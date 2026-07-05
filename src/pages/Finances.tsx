import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { formatCad, parseCadToCents } from "../../shared/money";

interface Rapport {
  du: string;
  au: string;
  revenus: { facturesPayees: number; revenusManuels: number; total: number };
  couts: { depenses: number; parCategorie: { category: string; total: number }[] };
  marge: number;
  margePct: number | null;
}

interface Depense {
  id: number;
  label: string;
  category: string;
  amountCents: number;
  spentOn: string;
}

interface Revenu {
  id: number;
  label: string;
  amountCents: number;
  receivedOn: string;
}

function debutDuMois(): string {
  return new Date().toISOString().slice(0, 8) + "01";
}

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Finances() {
  const [du, setDu] = useState(debutDuMois());
  const [au, setAu] = useState(aujourdhui());
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [revenus, setRevenus] = useState<Revenu[]>([]);
  const [erreur, setErreur] = useState("");
  const [nouvelleDepense, setNouvelleDepense] = useState({ label: "", category: "produits", montant: "", date: aujourdhui() });
  const [nouveauRevenu, setNouveauRevenu] = useState({ label: "", montant: "", date: aujourdhui() });

  const charger = useCallback(async () => {
    const [r, d, rev] = await Promise.all([
      api.get<Rapport>(`/api/finances/report?du=${du}&au=${au}`),
      api.get<{ depenses: Depense[] }>("/api/expenses"),
      api.get<{ revenus: Revenu[] }>("/api/revenues"),
    ]);
    setRapport(r);
    setDepenses(d.depenses);
    setRevenus(rev.revenus);
  }, [du, au]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterDepense(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    try {
      await api.post("/api/expenses", {
        label: nouvelleDepense.label,
        category: nouvelleDepense.category,
        amountCents: parseCadToCents(nouvelleDepense.montant),
        spentOn: nouvelleDepense.date,
      });
      setNouvelleDepense({ ...nouvelleDepense, label: "", montant: "" });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur.");
    }
  }

  async function ajouterRevenu(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    try {
      await api.post("/api/revenues", {
        label: nouveauRevenu.label,
        amountCents: parseCadToCents(nouveauRevenu.montant),
        receivedOn: nouveauRevenu.date,
      });
      setNouveauRevenu({ ...nouveauRevenu, label: "", montant: "" });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur.");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Opérations</div>
          <h1>Finances & marges</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="field">
            Du
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
          </label>
          <label className="field">
            Au
            <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
          </label>
        </div>
      </div>

      {erreur && <div className="error-text">{erreur}</div>}

      {rapport && (
        <div className="grid cols-3">
          <div className="panel stat">
            <div className="label">Revenus (période)</div>
            <div className="value">{formatCad(rapport.revenus.total)}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              Factures payées {formatCad(rapport.revenus.facturesPayees)} · manuels{" "}
              {formatCad(rapport.revenus.revenusManuels)}
            </div>
          </div>
          <div className="panel stat">
            <div className="label">Coûts (période)</div>
            <div className="value">{formatCad(rapport.couts.depenses)}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {rapport.couts.parCategorie.map((c) => `${c.category} ${formatCad(c.total)}`).join(" · ") || "—"}
            </div>
          </div>
          <div className="panel stat">
            <div className="label">Marge de profit</div>
            <div className="value" style={{ color: rapport.marge >= 0 ? undefined : "#a33b2a" }}>
              {formatCad(rapport.marge)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {rapport.margePct !== null ? `${String(rapport.margePct).replace(".", ",")} % des revenus` : "aucun revenu sur la période"}
            </div>
          </div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>Dépenses & coûts</h2>
          <form onSubmit={ajouterDepense} style={{ marginBottom: 14 }}>
            <div className="form-grid">
              <label className="field" style={{ gridColumn: "span 2" }}>
                Description
                <input value={nouvelleDepense.label} onChange={(e) => setNouvelleDepense({ ...nouvelleDepense, label: e.target.value })} required />
              </label>
              <label className="field">
                Catégorie
                <select value={nouvelleDepense.category} onChange={(e) => setNouvelleDepense({ ...nouvelleDepense, category: e.target.value })}>
                  <option value="produits">Produits</option>
                  <option value="véhicule">Véhicule</option>
                  <option value="équipement">Équipement</option>
                  <option value="salaires">Salaires</option>
                  <option value="général">Général</option>
                </select>
              </label>
              <label className="field">
                Montant ($)
                <input value={nouvelleDepense.montant} onChange={(e) => setNouvelleDepense({ ...nouvelleDepense, montant: e.target.value })} inputMode="decimal" required />
              </label>
              <label className="field">
                Date
                <input type="date" value={nouvelleDepense.date} onChange={(e) => setNouvelleDepense({ ...nouvelleDepense, date: e.target.value })} />
              </label>
            </div>
            <button className="btn small" type="submit" style={{ marginTop: 10 }}>
              + Ajouter la dépense
            </button>
          </form>
          <table className="data">
            <tbody>
              {depenses.slice(0, 12).map((d) => (
                <tr key={d.id}>
                  <td>{d.spentOn}</td>
                  <td>
                    {d.label} <span className="chip muted">{d.category}</span>
                  </td>
                  <td className="num">{formatCad(d.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Revenus manuels</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Les factures payées comptent automatiquement comme revenus; ajoutez ici les
            encaissements hors facturation.
          </p>
          <form onSubmit={ajouterRevenu} style={{ marginBottom: 14 }}>
            <div className="form-grid">
              <label className="field" style={{ gridColumn: "span 2" }}>
                Description
                <input value={nouveauRevenu.label} onChange={(e) => setNouveauRevenu({ ...nouveauRevenu, label: e.target.value })} required />
              </label>
              <label className="field">
                Montant ($)
                <input value={nouveauRevenu.montant} onChange={(e) => setNouveauRevenu({ ...nouveauRevenu, montant: e.target.value })} inputMode="decimal" required />
              </label>
              <label className="field">
                Date
                <input type="date" value={nouveauRevenu.date} onChange={(e) => setNouveauRevenu({ ...nouveauRevenu, date: e.target.value })} />
              </label>
            </div>
            <button className="btn small" type="submit" style={{ marginTop: 10 }}>
              + Ajouter le revenu
            </button>
          </form>
          <table className="data">
            <tbody>
              {revenus.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td>{r.receivedOn}</td>
                  <td>{r.label}</td>
                  <td className="num">{formatCad(r.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
