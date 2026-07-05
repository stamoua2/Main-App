import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { formatCad } from "../../shared/money";

interface Produit {
  id: number;
  sku: string;
  name: string;
  source: string;
  category: string;
  format: string;
  unit: string;
  quantity: number;
  costCents: number;
  notes: string;
}

const PRODUIT_VIDE = { name: "", category: "", format: "", unit: "unité", quantity: "0", cost: "" };

export default function Inventaire() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [recherche, setRecherche] = useState("");
  const [source, setSource] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [nouveau, setNouveau] = useState(PRODUIT_VIDE);
  const [mouvement, setMouvement] = useState<{ produit: Produit; delta: string; reason: string } | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    const params = new URLSearchParams();
    if (recherche) params.set("q", recherche);
    if (source) params.set("source", source);
    const r = await api.get<{ produits: Produit[]; comptes: Record<string, number> }>(
      `/api/inventory?${params}`,
    );
    setProduits(r.produits);
    setComptes(r.comptes);
  }, [recherche, source]);

  useEffect(() => {
    const t = setTimeout(charger, 200);
    return () => clearTimeout(t);
  }, [charger]);

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    try {
      await api.post("/api/inventory", {
        name: nouveau.name,
        category: nouveau.category,
        format: nouveau.format,
        unit: nouveau.unit,
        quantity: Number(nouveau.quantity.replace(",", ".")) || 0,
        costCents: Math.round(Number(nouveau.cost.replace(",", ".") || "0") * 100),
      });
      setFormVisible(false);
      setNouveau(PRODUIT_VIDE);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de l'ajout.");
    }
  }

  async function appliquerMouvement(e: FormEvent) {
    e.preventDefault();
    if (!mouvement) return;
    setErreur("");
    try {
      const r = await api.post<{ quantiteAvant: number; quantiteApres: number }>(
        `/api/inventory/${mouvement.produit.id}/movement`,
        { delta: Number(mouvement.delta.replace(",", ".")), reason: mouvement.reason },
      );
      setMessage(
        `${mouvement.produit.name} : ${r.quantiteAvant} → ${r.quantiteApres} ${mouvement.produit.unit}.`,
      );
      setMouvement(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Mouvement impossible.");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Opérations</div>
          <h1>Inventaire</h1>
        </div>
        <button className="btn" onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? "Fermer" : "+ Ajouter un produit manuel"}
        </button>
      </div>
      <p style={{ color: "var(--muted)", marginTop: -10 }}>
        {comptes.oj ?? 0} produits du catalogue OJ Compagnie (liste de prix 2026) ·{" "}
        {comptes.manuel ?? 0} produits ajoutés manuellement.
      </p>

      {formVisible && (
        <div className="panel">
          <h2>Nouveau produit (hors catalogue)</h2>
          <form onSubmit={ajouter}>
            <div className="form-grid">
              <label className="field" style={{ gridColumn: "span 2" }}>
                Nom
                <input value={nouveau.name} onChange={(e) => setNouveau({ ...nouveau, name: e.target.value })} required />
              </label>
              <label className="field">
                Catégorie
                <input value={nouveau.category} onChange={(e) => setNouveau({ ...nouveau, category: e.target.value })} />
              </label>
              <label className="field">
                Format
                <input value={nouveau.format} onChange={(e) => setNouveau({ ...nouveau, format: e.target.value })} placeholder="Sac 25 kg" />
              </label>
              <label className="field">
                Unité
                <input value={nouveau.unit} onChange={(e) => setNouveau({ ...nouveau, unit: e.target.value })} />
              </label>
              <label className="field">
                Quantité initiale
                <input value={nouveau.quantity} onChange={(e) => setNouveau({ ...nouveau, quantity: e.target.value })} inputMode="decimal" />
              </label>
              <label className="field">
                Coût unitaire ($)
                <input value={nouveau.cost} onChange={(e) => setNouveau({ ...nouveau, cost: e.target.value })} inputMode="decimal" placeholder="0,00" />
              </label>
            </div>
            <button className="btn" type="submit" style={{ marginTop: 14 }}>
              Ajouter
            </button>
          </form>
        </div>
      )}

      {mouvement && (
        <div className="panel">
          <h2>Mouvement de stock — {mouvement.produit.name}</h2>
          <form onSubmit={appliquerMouvement}>
            <div className="form-grid">
              <label className="field">
                Quantité (négatif = sortie)
                <input
                  value={mouvement.delta}
                  onChange={(e) => setMouvement({ ...mouvement, delta: e.target.value })}
                  inputMode="numeric"
                  placeholder="-1"
                  required
                />
              </label>
              <label className="field" style={{ gridColumn: "span 2" }}>
                Raison
                <input
                  value={mouvement.reason}
                  onChange={(e) => setMouvement({ ...mouvement, reason: e.target.value })}
                  placeholder="Ex. : visite chez Denis Ouellet"
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="submit">
                Appliquer
              </button>
              <button className="btn secondary" type="button" onClick={() => setMouvement(null)}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {erreur && <div className="error-text">{erreur}</div>}
      {message && <div className="ok-text">{message}</div>}

      <div className="panel">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <label className="field" style={{ minWidth: 260 }}>
            Rechercher
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, SKU ou catégorie…" />
          </label>
          <label className="field">
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Toutes</option>
              <option value="oj">Catalogue OJ</option>
              <option value="manuel">Manuel</option>
            </select>
          </label>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Catégorie</th>
              <th>Format</th>
              <th>SKU</th>
              <th className="num">Coût</th>
              <th className="num">En stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}{" "}
                  {p.source === "manuel" && <span className="chip warn">manuel</span>}
                </td>
                <td>{p.category || "—"}</td>
                <td>{p.format || "—"}</td>
                <td>{p.sku || "—"}</td>
                <td className="num">{formatCad(p.costCents)}</td>
                <td className="num">
                  {p.quantity} {p.unit}
                </td>
                <td>
                  <button
                    className="btn secondary small"
                    onClick={() => setMouvement({ produit: p, delta: "-1", reason: "" })}
                  >
                    Stock ±
                  </button>
                </td>
              </tr>
            ))}
            {produits.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
                  Aucun produit trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
