import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  type Client,
  type DocumentFacturation,
  type Forfait,
  type Parametres,
} from "../api";
import { formatCad, formatPct, parseCadToCents } from "../../shared/money";
import { computeTotals } from "../../shared/taxes";

interface LigneEdition {
  description: string;
  quantite: string;
  prixUnitaire: string; // en dollars, saisie libre
}

const LIGNE_VIDE: LigneEdition = { description: "", quantite: "1", prixUnitaire: "" };

export default function NouveauDocument() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [clientId, setClientId] = useState(searchParams.get("client") ?? "");
  const [taxesActives, setTaxesActives] = useState<boolean | null>(null);
  const [acompte, setAcompte] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneEdition[]>([{ ...LIGNE_VIDE }]);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.get<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients));
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
    api.get<{ parametres: Parametres }>("/api/settings").then((r) => setParametres(r.parametres));
  }, []);

  const taxes = taxesActives ?? parametres?.taxesEnabled ?? false;

  const lignesValides = useMemo(
    () =>
      lignes
        .filter((l) => l.description.trim() && Number(l.quantite.replace(",", ".")) > 0)
        .map((l) => ({
          description: l.description.trim(),
          quantity: Number(l.quantite.replace(",", ".")),
          unitPriceCents: parseCadToCents(l.prixUnitaire),
        })),
    [lignes],
  );

  const totaux = useMemo(
    () =>
      computeTotals(lignesValides, {
        taxesEnabled: taxes,
        tpsRate: parametres?.tpsRate,
        tvqRate: parametres?.tvqRate,
        depositCents: parseCadToCents(acompte || "0"),
      }),
    [lignesValides, taxes, parametres, acompte],
  );

  function modifierLigne(i: number, patch: Partial<LigneEdition>) {
    setLignes((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function ajouterForfait(f: Forfait) {
    setLignes((prev) => [
      ...prev.filter((l) => l.description.trim() || l.prixUnitaire),
      {
        description: `Forfait ${f.name} — ${f.visits}`,
        quantite: "1",
        prixUnitaire: "",
      },
    ]);
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    if (!clientId) {
      setErreur("Choisissez un client.");
      return;
    }
    if (lignesValides.length === 0) {
      setErreur("Ajoutez au moins une ligne avec description et quantité.");
      return;
    }
    setEnCours(true);
    try {
      const r = await api.post<{ document: DocumentFacturation }>("/api/documents", {
        kind: "estimation",
        clientId: Number(clientId),
        taxesEnabled: taxes,
        depositCents: parseCadToCents(acompte || "0"),
        notes,
        lines: lignesValides,
      });
      navigate(`/documents/${r.document.id}`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Facturation</div>
          <h1>Nouvelle estimation</h1>
        </div>
      </div>

      <form onSubmit={soumettre}>
        <div className="panel">
          <div className="form-grid">
            <label className="field">
              Client
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">— Choisir un client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} — {c.addressLine}, {c.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Acompte demandé ($)
              <input
                value={acompte}
                onChange={(e) => setAcompte(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </label>
            <label className="field check" style={{ alignSelf: "end" }}>
              <input
                type="checkbox"
                checked={taxes}
                onChange={(e) => setTaxesActives(e.target.checked)}
              />
              Appliquer TPS/TVQ
            </label>
          </div>
        </div>

        <div className="panel lines-editor">
          <h2>Lignes de services</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {forfaits.map((f) => (
              <button key={f.id} type="button" className="btn secondary small" onClick={() => ajouterForfait(f)}>
                + Forfait {f.name}
              </button>
            ))}
          </div>
          <div className="line-row" style={{ fontSize: 12, color: "var(--muted-2)", fontWeight: 600 }}>
            <span>Description</span>
            <span>Qté</span>
            <span>Prix unitaire ($)</span>
            <span style={{ textAlign: "right" }}>Montant</span>
            <span />
          </div>
          {lignes.map((l, i) => {
            const montant = Math.round(
              Number(l.quantite.replace(",", ".") || "0") * parseCadToCents(l.prixUnitaire || "0"),
            );
            return (
              <div className="line-row" key={i}>
                <input
                  value={l.description}
                  onChange={(e) => modifierLigne(i, { description: e.target.value })}
                  placeholder="Ex. : Aération du sol"
                />
                <input
                  value={l.quantite}
                  onChange={(e) => modifierLigne(i, { quantite: e.target.value })}
                  inputMode="decimal"
                />
                <input
                  value={l.prixUnitaire}
                  onChange={(e) => modifierLigne(i, { prixUnitaire: e.target.value })}
                  placeholder="0,00"
                  inputMode="decimal"
                />
                <span className="amount">{formatCad(montant)}</span>
                <button
                  type="button"
                  className="remove"
                  title="Retirer la ligne"
                  onClick={() => setLignes((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="btn secondary small"
            onClick={() => setLignes((prev) => [...prev, { ...LIGNE_VIDE }])}
          >
            + Ajouter une ligne
          </button>
        </div>

        <div className="panel">
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              Notes (affichées sur le PDF)
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="totals-box">
            <div className="row">
              <span>Sous-total</span>
              <span className="num">{formatCad(totaux.subtotalCents)}</span>
            </div>
            {taxes && parametres && (
              <>
                <div className="row">
                  <span>TPS ({formatPct(parametres.tpsRate)})</span>
                  <span className="num">{formatCad(totaux.tpsCents)}</span>
                </div>
                <div className="row">
                  <span>TVQ ({formatPct(parametres.tvqRate)})</span>
                  <span className="num">{formatCad(totaux.tvqCents)}</span>
                </div>
              </>
            )}
            <div className="row total">
              <span>Total (CAD)</span>
              <span className="num">{formatCad(totaux.totalCents)}</span>
            </div>
            {totaux.depositCents > 0 && (
              <>
                <div className="row">
                  <span>Acompte requis</span>
                  <span className="num">−{formatCad(totaux.depositCents)}</span>
                </div>
                <div className="row">
                  <span>Solde à payer</span>
                  <span className="num">{formatCad(totaux.balanceCents)}</span>
                </div>
              </>
            )}
          </div>
          {erreur && <div className="error-text">{erreur}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn" type="submit" disabled={enCours}>
              {enCours ? "Création…" : "Créer l'estimation"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
