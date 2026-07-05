import { useCallback, useEffect, useState, type FormEvent } from "react";
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

export default function Commandes() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [produits, setProduits] = useState<ProduitOption[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [fournisseur, setFournisseur] = useState("OJ Compagnie");
  const [lignes, setLignes] = useState<LigneEdition[]>([{ ...LIGNE_VIDE }]);
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
      await api.post("/api/orders", { supplier: fournisseur, lines });
      setFormVisible(false);
      setLignes([{ ...LIGNE_VIDE }]);
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
            <label className="field" style={{ maxWidth: 300, marginBottom: 14 }}>
              Fournisseur
              <input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required />
            </label>
            {lignes.map((l, i) => (
              <div key={i} className="line-row" style={{ gridTemplateColumns: "220px 1fr 80px 110px 40px" }}>
                <select value={l.itemId} onChange={(e) => choisirProduit(i, e.target.value)} style={{ font: "inherit", padding: "8px", borderRadius: 9 }}>
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
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="button" className="btn secondary small" onClick={() => setLignes((prev) => [...prev, { ...LIGNE_VIDE }])}>
                + Ligne
              </button>
              <button className="btn" type="submit">
                Créer la commande
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
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <strong>{formatCad(c.totalCents)}</strong>
              {c.status !== "reçue" && (
                <button className="btn small" onClick={() => recevoir(c.id)}>
                  Marquer reçue (+ stock)
                </button>
              )}
            </div>
          </div>
          <p style={{ color: "var(--muted)", margin: "6px 0 10px" }}>
            Commandée le {c.orderedOn ?? "—"}
            {c.receivedOn ? ` · reçue le ${c.receivedOn}` : ""}
          </p>
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
            </tbody>
          </table>
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
