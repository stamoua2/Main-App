import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type ProduitInventaire } from "../api";
import { formatCad, parseCadToCents } from "../../shared/money";
import { classeStatut } from "../statut";

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

// Unités de mesure contrôlées (vraies unités seulement — évite le texte libre).
// Minuscules et cohérentes, comme le recommandent les outils de référence
// (Sortly, inFlow). L'utilisateur ne peut plus saisir n'importe quoi.
const UNITES = [
  "unité",
  "sac",
  "boîte",
  "caisse",
  "bouteille",
  "contenant",
  "rouleau",
  "paquet",
  "L",
  "ml",
  "kg",
  "g",
  "lb",
];

const PRODUIT_VIDE: FormProduit = {
  name: "",
  category: "",
  format: "",
  unit: "unité",
  quantity: "0",
  cost: "",
  notes: "",
};

// Format lisible d'un produit : « 25 kg », « 2 x 10 L », ou l'unité seule.
// Un format purement numérique (produits manuels) reçoit l'unité; un format
// libre déjà rédigé (catalogue OJ) est affiché tel quel.
function formatComplet(p: ProduitInventaire): string {
  const f = (p.format || "").trim();
  if (!f) return p.unit || "—";
  if (/^[\d.,\s x×]+$/i.test(f)) return `${f} ${p.unit}`.trim();
  return f;
}

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
  // Ajustement de stock « bulk » (quantité + raison) affiché en ligne sous le
  // produit concerné — jamais en haut de la page.
  const [ajuste, setAjuste] = useState<{ id: number; delta: string; reason: string } | null>(null);
  const [stockEnCours, setStockEnCours] = useState<number | null>(null);
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
        format: nouveau.format.trim(),
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
        format: edition.format.trim(),
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

  // Ajustement rapide : applique un mouvement de stock et met à jour la ligne
  // sur place (pas de rechargement complet ni de défilement).
  async function ajusterStock(p: ProduitInventaire, delta: number, reason: string) {
    if (delta === 0) return;
    if (p.quantity + delta < 0) {
      setErreur(`Stock insuffisant pour ${p.name} : ${p.quantity} ${p.unit} en stock.`);
      return;
    }
    setErreur("");
    setStockEnCours(p.id);
    try {
      const r = await api.post<{ quantiteApres: number }>(`/api/inventory/${p.id}/movement`, {
        delta,
        reason: reason || "Ajustement rapide",
      });
      setProduits((prev) => prev.map((x) => (x.id === p.id ? { ...x, quantity: r.quantiteApres } : x)));
      setMessage(`${p.name} : ${p.quantity} → ${r.quantiteApres} ${p.unit}.`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Mouvement impossible.");
    } finally {
      setStockEnCours(null);
    }
  }

  async function appliquerAjustement(e: FormEvent, p: ProduitInventaire) {
    e.preventDefault();
    if (!ajuste) return;
    const delta = Number(ajuste.delta.replace(",", "."));
    if (!Number.isFinite(delta) || delta === 0) {
      setErreur("Entrez une quantité différente de 0 (négatif = sortie).");
      return;
    }
    await ajusterStock(p, delta, ajuste.reason);
    setAjuste(null);
  }

  // Sélecteur d'unité : liste contrôlée + conserve une valeur héritée hors liste
  // (ex. : unité d'un produit OJ) pour ne pas la perdre à l'édition.
  const selecteurUnite = (valeur: string, onChange: (v: string) => void) => (
    <select value={valeur} onChange={(e) => onChange(e.target.value)}>
      {UNITES.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
      {valeur && !UNITES.includes(valeur) && <option value={valeur}>{valeur}</option>}
    </select>
  );

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
        Unité de mesure
        {selecteurUnite(valeurs.unit, (v) => setValeurs({ ...valeurs, unit: v }))}
        <span className="field-hint">Comment le stock est compté.</span>
      </label>
      <label className="field">
        Format
        <input
          value={valeurs.format}
          onChange={(e) =>
            setValeurs({ ...valeurs, format: e.target.value.replace(/[^\d.,\s x×]/gi, "") })
          }
          inputMode="decimal"
          placeholder="ex. : 25"
        />
        <span className="field-hint">
          Taille d'une unité — aperçu : <strong>{valeurs.format.trim() ? `${valeurs.format.trim()} ${valeurs.unit}` : valeurs.unit}</strong>
        </span>
      </label>
      {avecQuantite && (
        <label className="field">
          Quantité initiale
          <input
            value={valeurs.quantity}
            onChange={(e) => setValeurs({ ...valeurs, quantity: e.target.value.replace(/[^\d.,]/g, "") })}
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
        {comptes.manuel ?? 0} produits ajoutés manuellement. Ajustez le stock avec les
        boutons +/− à côté de chaque article.
      </p>

      {gererCategories && (
        <div className="panel">
          <h2>Catégories du menu déroulant</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {categories.map((c) => (
              <span key={c.id} className="chip plain" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
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

        {nomsGroupes.length === 0 && (
          <div className="empty-state">
            <span className="empty-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </span>
            <p>Aucun produit trouvé. Ajustez la recherche ou ajoutez un produit.</p>
          </div>
        )}

        {nomsGroupes.map((nom) => (
          <section key={nom} style={{ marginTop: 18 }}>
            <h2 style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              {nom}
              <span className="chip plain">{groupes.get(nom)!.length}</span>
            </h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Format</th>
                    <th>SKU</th>
                    <th className="num">Coût</th>
                    <th style={{ textAlign: "center" }}>En stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groupes.get(nom)!.flatMap((p) => {
                    const enCours = stockEnCours === p.id;
                    const lignes = [
                      <tr key={p.id}>
                        <td>
                          {p.name}{" "}
                          {p.source === "manuel" && <span className={classeStatut(p.source)}>manuel</span>}
                        </td>
                        <td>{formatComplet(p)}</td>
                        <td>{p.sku || "—"}</td>
                        <td className="num">{formatCad(p.costCents)}</td>
                        <td>
                          <div className="stepper">
                            <button
                              type="button"
                              aria-label={`Retirer 1 ${p.unit}`}
                              onClick={() => ajusterStock(p, -1, "Retrait rapide (−1)")}
                              disabled={enCours || p.quantity <= 0}
                            >
                              −
                            </button>
                            <span className="qty">
                              {p.quantity} <span className="qty-unit">{p.unit}</span>
                            </span>
                            <button
                              type="button"
                              aria-label={`Ajouter 1 ${p.unit}`}
                              onClick={() => ajusterStock(p, 1, "Ajout rapide (+1)")}
                              disabled={enCours}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn secondary small"
                              title="Entrée/sortie de stock (quantité + raison)"
                              onClick={() =>
                                setAjuste(
                                  ajuste?.id === p.id ? null : { id: p.id, delta: "", reason: "" },
                                )
                              }
                            >
                              Ajuster le stock
                            </button>
                            <button
                              className="btn secondary small"
                              title="Modifier la fiche du produit (nom, unité, format, coût…)"
                              onClick={() => ouvrirEdition(p)}
                            >
                              Modifier la fiche
                            </button>
                            <button className="btn danger small" onClick={() => supprimer(p)}>
                              Retirer
                            </button>
                          </div>
                        </td>
                      </tr>,
                    ];
                    if (ajuste?.id === p.id) {
                      lignes.push(
                        <tr key={`${p.id}-ajuste`} className="inline-edit-row">
                          <td colSpan={6}>
                            <form className="toolbar" onSubmit={(e) => appliquerAjustement(e, p)}>
                              <label className="field" style={{ flex: "0 0 160px" }}>
                                Quantité (± )
                                <input
                                  value={ajuste.delta}
                                  onChange={(e) =>
                                    setAjuste({ ...ajuste, delta: e.target.value.replace(/[^\d.,-]/g, "") })
                                  }
                                  inputMode="numeric"
                                  placeholder="ex. : 10 ou -3"
                                  autoFocus
                                />
                              </label>
                              <label className="field" style={{ flex: "1 1 240px" }}>
                                Raison (optionnel)
                                <input
                                  value={ajuste.reason}
                                  onChange={(e) => setAjuste({ ...ajuste, reason: e.target.value })}
                                  placeholder="ex. : réception commande, visite client…"
                                />
                              </label>
                              <button className="btn" type="submit" disabled={enCours}>
                                Appliquer
                              </button>
                              <button className="btn secondary" type="button" onClick={() => setAjuste(null)}>
                                Annuler
                              </button>
                            </form>
                          </td>
                        </tr>,
                      );
                    }
                    return lignes;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
