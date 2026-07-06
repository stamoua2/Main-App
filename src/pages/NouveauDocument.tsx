import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  const { id: editId } = useParams();
  const enEdition = Boolean(editId);
  const [clients, setClients] = useState<Client[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [clientId, setClientId] = useState(searchParams.get("client") ?? "");
  const [kind, setKind] = useState<"estimation" | "contrat" | "facture">(
    searchParams.get("type") === "facture" ? "facture" : "estimation",
  );
  const [numero, setNumero] = useState("");
  const [aFactureSquare, setAFactureSquare] = useState(false);
  const [taxesActives, setTaxesActives] = useState<boolean | null>(null);
  const [acompte, setAcompte] = useState("");
  // L'acompte suit automatiquement le % des paramètres tant qu'il n'a pas
  // été modifié à la main (toujours ajustable).
  const [acompteManuel, setAcompteManuel] = useState(false);
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneEdition[]>([{ ...LIGNE_VIDE }]);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.get<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients));
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
    api.get<{ parametres: Parametres }>("/api/settings").then((r) => setParametres(r.parametres));
  }, []);

  // Mode édition : préremplir le formulaire avec le document existant.
  useEffect(() => {
    if (!editId) return;
    api
      .get<{ document: DocumentFacturation }>(`/api/documents/${editId}`)
      .then((r) => {
        const d = r.document;
        setKind(d.kind);
        setClientId(String(d.clientId));
        setNumero(d.number);
        setAFactureSquare(Boolean(d.squareInvoiceId));
        setTaxesActives(d.taxesEnabled);
        setNotes(d.notes ?? "");
        setAcompte(d.depositCents > 0 ? (d.depositCents / 100).toFixed(2).replace(".", ",") : "");
        setAcompteManuel(true); // conserve l'acompte enregistré
        setLignes(
          (d.lines ?? []).map((l) => ({
            description: l.description,
            quantite: String(l.quantity).replace(".", ","),
            prixUnitaire: (l.unitPriceCents / 100).toFixed(2).replace(".", ","),
          })),
        );
      })
      .catch(() => setErreur("Document introuvable."));
  }, [editId]);

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

  const pctAcompte = parametres?.depositPct ?? 50;
  const acompteAutoCents = Math.round((totaux.totalCents * pctAcompte) / 100 / 100) * 100;

  useEffect(() => {
    if (!acompteManuel) {
      setAcompte(acompteAutoCents > 0 ? (acompteAutoCents / 100).toFixed(2).replace(".", ",") : "");
    }
  }, [acompteAutoCents, acompteManuel]);

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
      if (enEdition) {
        const r = await api.put<{ document: DocumentFacturation }>(`/api/documents/${editId}`, {
          taxesEnabled: taxes,
          depositCents: parseCadToCents(acompte || "0"),
          notes,
          lines: lignesValides,
        });
        navigate(`/documents/${r.document.id}`);
      } else {
        const r = await api.post<{ document: DocumentFacturation }>("/api/documents", {
          kind,
          clientId: Number(clientId),
          taxesEnabled: taxes,
          depositCents: parseCadToCents(acompte || "0"),
          notes,
          lines: lignesValides,
        });
        navigate(`/documents/${r.document.id}`);
      }
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Facturation</div>
          <h1>
            {enEdition
              ? `Modifier ${numero || (kind === "facture" ? "la facture" : kind === "contrat" ? "le contrat" : "l'estimation")}`
              : kind === "facture"
                ? "Nouvelle facture"
                : "Nouvelle estimation"}
          </h1>
        </div>
      </div>

      {enEdition && aFactureSquare && (
        <p className="ok-text" style={{ marginTop: -8 }}>
          Ce document existe dans Square : à l'enregistrement, sa facture Square sera
          mise à jour automatiquement avec les modifications.
        </p>
      )}

      <form onSubmit={soumettre}>
        <div className="panel">
          <div className="form-grid">
            <label className="field">
              Client
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                disabled={enEdition}
              >
                <option value="">— Choisir un client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} — {c.addressLine}, {c.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Type de document
              {enEdition ? (
                <input
                  value={kind === "facture" ? "Facture" : kind === "contrat" ? "Contrat" : "Estimation"}
                  disabled
                />
              ) : (
                <select value={kind} onChange={(e) => setKind(e.target.value as "estimation" | "facture")}>
                  <option value="estimation">Estimation</option>
                  <option value="facture">Facture (ex. : service supplémentaire)</option>
                </select>
              )}
            </label>
            <label className="field">
              Acompte demandé ($) — auto : {pctAcompte.toLocaleString("fr-CA")} % du total
              <input
                value={acompte}
                onChange={(e) => {
                  setAcompteManuel(true);
                  setAcompte(e.target.value);
                }}
                placeholder="0,00"
                inputMode="decimal"
              />
              {acompteManuel && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setAcompteManuel(false)}
                >
                  Revenir au calcul automatique ({pctAcompte.toLocaleString("fr-CA")} %)
                </button>
              )}
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
              {enCours
                ? "Enregistrement…"
                : enEdition
                  ? "Enregistrer les modifications"
                  : kind === "facture"
                    ? "Créer la facture"
                    : "Créer l'estimation"}
            </button>
            {enEdition && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => navigate(`/documents/${editId}`)}
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
