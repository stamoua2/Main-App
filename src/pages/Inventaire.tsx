import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type ProduitInventaire } from "../api";
import { formatCad, parseCadToCents } from "../../shared/money";

interface Categorie {
  id: number;
  name: string;
}

interface FormProduit {
  name: string;
  category: string;
  format: string;
  unit: string;
  quantity: string;
  cost: string;
  notes: string;
}

const PRODUIT_VIDE: FormProduit = {
  name: "",
  category: "",
  format: "",
  unit: "unité",
  quantity: "0",
  cost: "",
  notes: "",
};

export default function Inventaire() {
  const [produits, setProduits] = useState<ProduitInventaire[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [recherche, setRecherche] = useState("");
  const [source, setSource] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [nouveau, setNouveau] = useState(PRODUIT_VIDE);
  const [editionId, setEditionId] = useState<number | null>(null);
  const [edition, setEdition] = useState<FormProduit>(PRODUIT_VIDE);
  const [gererCategories, setGererCategories] = useState(false);
  const [nouvelleCategorie, setNouvelleCategorie] = useState("");
  const [mouvement, setMouvement] = useState<{ produit: ProduitInventaire; delta: string; reason: string } | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    const params = new URLSearchParams();
    if (recherche) params.set("q", recherche);
    if (source) params.set("source", source);
    const r = await api.get<{ produits: ProduitInventaire[]; comptes: Record<string, number> }>(
      `/api/inventory?${params}`,
    );
    setProduits(r.produits);
    setComptes(r.comptes);
  }, [recherche, source]);

  const chargerCategories = useCallback(async () => {
    const r = await api.get<{ categories: Categorie[] }>("/api/inventory/categories");
    setCategories(r.categories);
  }, []);

  useEffect(() => {
    const t = setTimeout(charger, 200);
    return () => clearTimeout(t);
  }, [charger]);

  useEffect(() => {
    chargerCategories();
  }, [chargerCategories]);

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
        costCents: parseCadToCents(nouveau.cost || "0"),
        notes: nouveau.notes,
      });
      setFormVisible(false);
      setNouveau(PRODUIT_VIDE);
      setMessage("Produit ajouté.");
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de l'ajout.");
    }
  }

  function ouvrirEdition(p: ProduitInventaire) {
    setEditionId(p.id);
    setEdition({
      name: p.name,
      category: p.category,
      format: p.format,
      unit: p.unit,
      quantity: String(p.quantity),
      cost: (p.costCents / 100).toFixed(2).replace(".", ","),
      notes: p.notes,
    });
    setFormVisible(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function sauvegarderEdition(e: FormEvent) {
    e.preventDefault();
    if (editionId === null) return;
    setErreur("");
    try {
      await api.put(`/api/inventory/${editionId}`, {
        name: edition.name,
        category: edition.category,
        format: edition.format,
        unit: edition.unit,
        costCents: parseCadToCents(edition.cost || "0"),
        notes: edition.notes,
      });
      setMessage(`${edition.name} mis à jour.`);
      setEditionId(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la mise à jour.");
    }
  }

  async function supprimer(p: ProduitInventaire) {
    if (!window.confirm(`Retirer « ${p.name} » de l'inventaire ?`)) return;
    setErreur("");
    try {
      await api.delete(`/api/inventory/${p.id}`);
      setMessage(`${p.name} retiré de l'inventaire.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Suppression impossible.");
    }
  }

  async function ajouterCategorie(e: FormEvent) {
    e.preventDefault();
    if (!nouvelleCategorie.trim()) return;
    await api.post("/api/inventory/categories", { name: nouvelleCategorie.trim() });
    setNouvelleCategorie("");
    await chargerCategories();
  }

  async function retirerCategorie(c: Categorie) {
    if (!window.confirm(`Retirer la catégorie « ${c.name} » du menu ? (les produits la conservent)`)) return;
    await api.delete(`/api/inventory/categories/${c.id}`);
    await chargerCategories();
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

  const selecteurCategorie = (valeur: string, onChange: (v: string) => void) => (
    <select value={valeur} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Sans catégorie —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
      {valeur && !categories.some((c) => c.name === valeur) && (
        <option value={valeur}>{valeur}</option>
      )}
    </select>
  );

  // Regroupement par catégorie (après filtre), catégories en ordre alphabétique.
  const filtres = filtreCategorie
    ? produits.filter((p) => (p.category || "Sans catégorie") === filtreCategorie)
    : produits;
  const groupes = new Map<string, ProduitInventaire[]>();
  for (const p of filtres) {
    const cle = p.category || "Sans catégorie";
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(p);
  }
  const nomsGroupes = Array.from(groupes.keys()).sort((a, b) => a.localeCompare(b, "fr"));
  const categoriesPresentes = Array.from(
    new Set(produits.map((p) => p.category || "Sans catégorie")),
  ).sort((a, b) => a.localeCompare(b, "fr"));

  const formulaire = (
    valeurs: FormProduit,
    setValeurs: (v: FormProduit) => void,
    avecQuantite: boolean,
  ) => (
    <div className="form-grid">
      <label className="field" style={{ gridColumn: "span 2" }}>
        Nom
        <input value={valeurs.name} onChange={(e) => setValeurs({ ...valeurs, name: e.target.value })} required />
      </label>
      <label className="field">
        Catégorie
        {selecteurCategorie(valeurs.category, (v) => setValeurs({ ...valeurs, category: v }))}
      </label>
      <label className="field">
        Format
        <input
          value={valeurs.format}
          onChange={(e) => setValeurs({ ...valeurs, format: e.target.value })}
          placeholder="Sac 25 kg"
        />
      </label>
      <label className="field">
        Unité
        <input value={valeurs.unit} onChange={(e) => setValeurs({ ...valeurs, unit: e.target.value })} />
      </label>
      {avecQuantite && (
        <label className="field">
          Quantité initiale
          <input
            value={valeurs.quantity}
            onChange={(e) => setValeurs({ ...valeurs, quantity: e.target.value })}
            inputMode="decimal"
          />
        </label>
      )}
      <label className="field">
        Coût unitaire ($)
        <input
          value={valeurs.cost}
          onChange={(e) => setValeurs({ ...valeurs, cost: e.target.value })}
          inputMode="decimal"
          placeholder="0,00"
        />
      </label>
      <label className="field" style={{ gridColumn: "span 2" }}>
        Notes
        <input value={valeurs.notes} onChange={(e) => setValeurs({ ...valeurs, notes: e.target.value })} />
      </label>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Opérations</div>
          <h1>Inventaire</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={() => setGererCategories((v) => !v)}>
            {gererCategories ? "Fermer les catégories" : "Gérer les catégories"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setFormVisible((v) => !v);
              setEditionId(null);
            }}
          >
            {formVisible ? "Fermer" : "+ Ajouter un produit"}
          </button>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: -10 }}>
        {comptes.oj ?? 0} produits du catalogue OJ Compagnie (liste de prix 2026) ·{" "}
        {comptes.manuel ?? 0} produits ajoutés manuellement. Tous les produits sont
        modifiables et retirables.
      </p>

      {gererCategories && (
        <div className="panel">
          <h2>Catégories du menu déroulant</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {categories.map((c) => (
              <span key={c.id} className="chip" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                {c.name}
                <button type="button" className="chip-x" aria-label={`Retirer ${c.name}`} onClick={() => retirerCategorie(c)}>
                  ×
                </button>
              </span>
            ))}
            {categories.length === 0 && <span style={{ color: "var(--muted)" }}>Aucune catégorie.</span>}
          </div>
          <form onSubmit={ajouterCategorie} className="toolbar">
            <label className="field" style={{ flex: "1 1 240px" }}>
              Nouvelle catégorie
              <input
                value={nouvelleCategorie}
                onChange={(e) => setNouvelleCategorie(e.target.value)}
                placeholder="ex. : Équipement"
              />
            </label>
            <button className="btn secondary" type="submit">
              Ajouter la catégorie
            </button>
          </form>
        </div>
      )}

      {formVisible && (
        <div className="panel">
          <h2>Nouveau produit</h2>
          <form onSubmit={ajouter}>
            {formulaire(nouveau, setNouveau, true)}
            <button className="btn" type="submit" style={{ marginTop: 14 }}>
              Ajouter
            </button>
          </form>
        </div>
      )}

      {editionId !== null && (
        <div className="panel">
          <h2>Modifier — {edition.name}</h2>
          <form onSubmit={sauvegarderEdition}>
            {formulaire(edition, setEdition, false)}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="submit">
                Sauvegarder
              </button>
              <button className="btn secondary" type="button" onClick={() => setEditionId(null)}>
                Annuler
              </button>
            </div>
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
        <div className="toolbar" style={{ marginBottom: 6 }}>
          <label className="field" style={{ flex: "1 1 220px" }}>
            Rechercher
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, SKU ou catégorie…" />
          </label>
          <label className="field">
            Catégorie
            <select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)}>
              <option value="">Toutes</option>
              {categoriesPresentes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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

        {nomsGroupes.length === 0 && <p style={{ color: "var(--muted)" }}>Aucun produit trouvé.</p>}

        {nomsGroupes.map((nom) => (
          <section key={nom} style={{ marginTop: 18 }}>
            <h2 style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              {nom}
              <span className="chip">{groupes.get(nom)!.length}</span>
            </h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Format</th>
                    <th>SKU</th>
                    <th className="num">Coût</th>
                    <th className="num">En stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groupes.get(nom)!.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.name} {p.source === "manuel" && <span className="chip warn">manuel</span>}
                      </td>
                      <td>{p.format || "—"}</td>
                      <td>{p.sku || "—"}</td>
                      <td className="num">{formatCad(p.costCents)}</td>
                      <td className="num">
                        {p.quantity} {p.unit}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn secondary small"
                            onClick={() => setMouvement({ produit: p, delta: "-1", reason: "" })}
                          >
                            Stock ±
                          </button>
                          <button className="btn secondary small" onClick={() => ouvrirEdition(p)}>
                            Modifier
                          </button>
                          <button className="btn danger small" onClick={() => supprimer(p)}>
                            Retirer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
