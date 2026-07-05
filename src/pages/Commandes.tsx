import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { formatCad, parseCadToCents } from "../../shared/money";

interface LigneCommande {
  id?: number;
  itemId: number | null;
  description: string;
  quantity: number;
  unitCostCents: number;
  amountCents?: number;
}

interface Commande {
  id: number;
  supplier: string;
  status: string;
  orderedOn: string | null;
  receivedOn: string | null;
  subtotalCents: number;
  shippingCents: number;
  taxesEnabled: boolean;
  tpsCents: number;
  tvqCents: number;
  totalCents: number;
  notes: string;
  lines: LigneCommande[];
}

interface ProduitOption {
  id: number;
  name: string;
  format: string;
  costCents: number;
}

interface LigneEdition {
  itemId: string;
  description: string;
  quantite: string;
  cout: string;
}

const LIGNE_VIDE: LigneEdition = { itemId: "", description: "", quantite: "1", cout: "" };
const LIVRAISON_DEFAUT = "45,00";

function totauxCommande(subtotalCents: number, shippingCents: number, taxes: boolean) {
  const taxable = subtotalCents + shippingCents;
  const tps = taxes ? Math.round(taxable * 0.05) : 0;
  const tvq = taxes ? Math.round(taxable * 0.09975) : 0;
  return { tps, tvq, total: taxable + tps + tvq };
}

export default function Commandes() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [produits, setProduits] = useState<ProduitOption[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [fournisseur, setFournisseur] = useState("OJ Compagnie");
  const [livraison, setLivraison] = useState(LIVRAISON_DEFAUT);
  const [taxes, setTaxes] = useState(true);
  const [lignes, setLignes] = useState<LigneEdition[]>([{ ...LIGNE_VIDE }]);
  const [edition, setEdition] = useState<{
    id: number;
    supplier: string;
    status: string;
    notes: string;
    livraison: string;
    taxes: boolean;
  } | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    const r = await api.get<{ commandes: Commande[] }>("/api/orders");
    setCommandes(r.commandes);
  }, []);

  useEffect(() => {
    charger();
    api
      .get<{ produits: ProduitOption[] }>("/api/inventory")
      .then((r) => setProduits(r.produits));
  }, [charger]);

  function choisirProduit(i: number, itemId: string) {
    const produit = produits.find((p) => p.id === Number(itemId));
    setLignes((prev) =>
      prev.map((l, j) =>
        j === i
          ? {
              ...l,
              itemId,
              description: produit ? `${produit.name} (${produit.format})` : l.description,
              cout: produit ? (produit.costCents / 100).toFixed(2).replace(".", ",") : l.cout,
            }
          : l,
      ),
    );
  }

  const sousTotalCents = useMemo(
    () =>
      lignes
        .filter((l) => l.description.trim())
        .reduce(
          (s, l) => s + Math.round((Number(l.quantite.replace(",", ".")) || 1) * parseCadToCents(l.cout || "0")),
          0,
        ),
    [lignes],
  );
  const livraisonCents = parseCadToCents(livraison || "0");
  const apercu = totauxCommande(sousTotalCents, livraisonCents, taxes);

  async function creer(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    const lines = lignes
      .filter((l) => l.description.trim())
      .map((l) => ({
        itemId: l.itemId ? Number(l.itemId) : null,
        description: l.description.trim(),
        quantity: Number(l.quantite.replace(",", ".")) || 1,
        unitCostCents: parseCadToCents(l.cout || "0"),
      }));
    if (!lines.length) {
      setErreur("Ajoutez au moins une ligne.");
      return;
    }
    try {
      await api.post("/api/orders", {
        supplier: fournisseur,
        shippingCents: livraisonCents,
        taxesEnabled: taxes,
        lines,
      });
      setFormVisible(false);
      setLignes([{ ...LIGNE_VIDE }]);
      setLivraison(LIVRAISON_DEFAUT);
      setTaxes(true);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    }
  }

  async function recevoir(id: number) {
    setErreur("");
    setMessage("");
    try {
      const r = await api.post<{ stockIncremente: { itemId: number; delta: number }[] }>(
        `/api/orders/${id}/receive`,
      );
      setMessage(
        `Commande #${id} reçue — stock incrémenté pour ${r.stockIncremente.length} produit(s).`,
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Réception impossible.");
    }
  }

  async function sauvegarderEdition(e: FormEvent) {
    e.preventDefault();
    if (!edition) return;
    setErreur("");
    try {
      await api.put(`/api/orders/${edition.id}`, {
        supplier: edition.supplier,
        status: edition.status,
        notes: edition.notes,
        shippingCents: parseCadToCents(edition.livraison || "0"),
        taxesEnabled: edition.taxes,
      });
      setMessage(`Commande #${edition.id} mise à jour.`);
      setEdition(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Mise à jour impossible.");
    }
  }

  async function supprimer(c: Commande) {
    if (!window.confirm(`Supprimer la commande #${c.id} (${c.supplier}) ?`)) return;
    setErreur("");
    try {
      await api.delete(`/api/orders/${c.id}`);
      setMessage(`Commande #${c.id} supprimée.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Suppression impossible.");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Opérations</div>
          <h1>Commandes fournisseurs</h1>
        </div>
        <button className="btn" onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? "Fermer" : "+ Nouvelle commande"}
        </button>
      </div>

      {formVisible && (
        <div className="panel lines-editor">
          <h2>Nouvelle commande</h2>
          <form onSubmit={creer}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <label className="field">
                Fournisseur
                <input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required />
              </label>
              <label className="field">
                Frais de livraison ($)
                <input
                  value={livraison}
                  onChange={(e) => setLivraison(e.target.value)}
                  inputMode="decimal"
                  placeholder="45,00"
                />
              </label>
              <label className="field check" style={{ alignSelf: "end" }}>
                <input type="checkbox" checked={taxes} onChange={(e) => setTaxes(e.target.checked)} />
                Appliquer TPS/TVQ
              </label>
            </div>
            {lignes.map((l, i) => (
              <div key={i} className="line-row" style={{ gridTemplateColumns: "220px 1fr 80px 110px 40px" }}>
                <select value={l.itemId} onChange={(e) => choisirProduit(i, e.target.value)}>
                  <option value="">— Produit libre —</option>
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.format})
                    </option>
                  ))}
                </select>
                <input
                  value={l.description}
                  onChange={(e) => setLignes((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  placeholder="Description"
                />
                <input
                  value={l.quantite}
                  onChange={(e) => setLignes((prev) => prev.map((x, j) => (j === i ? { ...x, quantite: e.target.value } : x)))}
                  inputMode="decimal"
                />
                <input
                  value={l.cout}
                  onChange={(e) => setLignes((prev) => prev.map((x, j) => (j === i ? { ...x, cout: e.target.value } : x)))}
                  placeholder="Coût unitaire"
                  inputMode="decimal"
                />
                <button type="button" className="remove" onClick={() => setLignes((prev) => prev.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setLignes((prev) => [...prev, { ...LIGNE_VIDE }])}>
              + Ligne
            </button>
            <div className="totals-box" style={{ marginTop: 14 }}>
              <div className="row">
                <span>Sous-total</span>
                <span className="num">{formatCad(sousTotalCents)}</span>
              </div>
              <div className="row">
                <span>Livraison</span>
                <span className="num">{formatCad(livraisonCents)}</span>
              </div>
              {taxes && (
                <>
                  <div className="row">
                    <span>TPS (5 %)</span>
                    <span className="num">{formatCad(apercu.tps)}</span>
                  </div>
                  <div className="row">
                    <span>TVQ (9,975 %)</span>
                    <span className="num">{formatCad(apercu.tvq)}</span>
                  </div>
                </>
              )}
              <div className="row total">
                <span>Total</span>
                <span className="num">{formatCad(apercu.total)}</span>
              </div>
            </div>
            <button className="btn" type="submit" style={{ marginTop: 14 }}>
              Créer la commande
            </button>
          </form>
        </div>
      )}

      {edition && (
        <div className="panel">
          <h2>Modifier la commande #{edition.id}</h2>
          <form onSubmit={sauvegarderEdition}>
            <div className="form-grid">
              <label className="field">
                Fournisseur
                <input
                  value={edition.supplier}
                  onChange={(e) => setEdition({ ...edition, supplier: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                Statut
                <select value={edition.status} onChange={(e) => setEdition({ ...edition, status: e.target.value })}>
                  <option value="brouillon">brouillon</option>
                  <option value="commandée">commandée</option>
                  <option value="annulée">annulée</option>
                </select>
              </label>
              <label className="field">
                Frais de livraison ($)
                <input
                  value={edition.livraison}
                  onChange={(e) => setEdition({ ...edition, livraison: e.target.value })}
                  inputMode="decimal"
                />
              </label>
              <label className="field check" style={{ alignSelf: "end" }}>
                <input
                  type="checkbox"
                  checked={edition.taxes}
                  onChange={(e) => setEdition({ ...edition, taxes: e.target.checked })}
                />
                Appliquer TPS/TVQ
              </label>
              <label className="field" style={{ gridColumn: "span 2" }}>
                Notes
                <input value={edition.notes} onChange={(e) => setEdition({ ...edition, notes: e.target.value })} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="submit">
                Sauvegarder
              </button>
              <button className="btn secondary" type="button" onClick={() => setEdition(null)}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {erreur && <div className="error-text">{erreur}</div>}
      {message && <div className="ok-text">{message}</div>}

      {commandes.map((c) => (
        <div className="panel" key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ marginBottom: 0 }}>
              #{c.id} — {c.supplier}{" "}
              <span className={`chip${c.status === "reçue" ? "" : " warn"}`}>{c.status}</span>
            </h2>
            <div className="row-actions">
              <strong style={{ marginRight: 6 }}>{formatCad(c.totalCents)}</strong>
              {c.status !== "reçue" && c.status !== "annulée" && (
                <button className="btn small" onClick={() => recevoir(c.id)}>
                  Marquer reçue (+ stock)
                </button>
              )}
              {c.status !== "reçue" && (
                <>
                  <button
                    className="btn secondary small"
                    onClick={() =>
                      setEdition({
                        id: c.id,
                        supplier: c.supplier,
                        status: c.status,
                        notes: c.notes,
                        livraison: (c.shippingCents / 100).toFixed(2).replace(".", ","),
                        taxes: c.taxesEnabled,
                      })
                    }
                  >
                    Modifier
                  </button>
                  <button className="btn danger small" onClick={() => supprimer(c)}>
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </div>
          <p style={{ color: "var(--muted)", margin: "6px 0 10px" }}>
            Commandée le {c.orderedOn ?? "—"}
            {c.receivedOn ? ` · reçue le ${c.receivedOn}` : ""}
            {c.notes ? ` · ${c.notes}` : ""}
          </p>
          <div className="table-scroll">
            <table className="data">
              <tbody>
                {c.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.description}</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{formatCad(l.unitCostCents)}</td>
                    <td className="num">{formatCad(l.amountCents ?? 0)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} style={{ color: "var(--muted)" }}>
                    Livraison
                  </td>
                  <td className="num">{formatCad(c.shippingCents)}</td>
                </tr>
                {c.taxesEnabled && (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>
                      TPS + TVQ
                    </td>
                    <td className="num">{formatCad(c.tpsCents + c.tvqCents)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td className="num">
                    <strong>{formatCad(c.totalCents)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {commandes.length === 0 && (
        <div className="panel" style={{ color: "var(--muted)" }}>
          Aucune commande fournisseur.
        </div>
      )}
    </>
  );
}
