import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  type Client,
  type Cotation,
  type CotationForfait,
  type Forfait,
  type ProduitForfait,
  type ProduitInventaire,
} from "../api";
import { formatCad, parseCadToCents } from "../../shared/money";
import { M2_TO_FT2 } from "../../shared/area";
import { margeDepuisPrix, prixDepuisMarge } from "../../shared/pricing";

// Réglage local (marge/prix) par forfait — les deux champs restent synchronisés.
interface Reglage {
  margeStr: string;
  prixStr: string;
}

function centsToDollarsStr(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default function Forfaits() {
  const navigate = useNavigate();
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // --- Calculateur ---
  const [m2Str, setM2Str] = useState("500");
  const [ft2Str, setFt2Str] = useState(Math.round(500 * M2_TO_FT2).toString());
  const [clientId, setClientId] = useState("");
  const [cotation, setCotation] = useState<Cotation | null>(null);
  const [reglages, setReglages] = useState<Record<number, Reglage>>({});
  const [messageCalc, setMessageCalc] = useState("");
  const [erreurCalc, setErreurCalc] = useState("");
  const debounceRef = useRef<number>();

  // --- Éditeur de produits d'un forfait ---
  const [editionId, setEditionId] = useState<number | null>(null);
  const [produits, setProduits] = useState<ProduitForfait[]>([]);
  const [visitCountStr, setVisitCountStr] = useState("");
  const [visitCostStr, setVisitCostStr] = useState("");
  const [inventaire, setInventaire] = useState<ProduitInventaire[]>([]);
  const [messageEdit, setMessageEdit] = useState("");
  const [erreurEdit, setErreurEdit] = useState("");

  const areaM2 = useMemo(() => Number(m2Str.replace(",", ".")) || 0, [m2Str]);

  useEffect(() => {
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
    api.get<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients));
  }, []);

  // Cotation serveur (coûts + prix à la marge sauvegardée), avec anti-rebond.
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (!(areaM2 > 0)) {
      setCotation(null);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await api.get<Cotation>(`/api/pricing/quote?areaM2=${areaM2}`);
        setErreurCalc("");
        setCotation(r);
        // Conserve les marges ajustées localement; recalcule les prix.
        setReglages((prev) => {
          const next: Record<number, Reglage> = {};
          for (const f of r.forfaits) {
            const marge = prev[f.id] ? Number(prev[f.id].margeStr.replace(",", ".")) : f.marginPct;
            const margeOk = Number.isFinite(marge) ? marge : f.marginPct;
            next[f.id] = {
              margeStr: prev[f.id]?.margeStr ?? String(f.marginPct),
              prixStr: centsToDollarsStr(prixDepuisMarge(f.couts.totalCents, margeOk)),
            };
          }
          return next;
        });
      } catch (err) {
        setErreurCalc(err instanceof ApiError ? err.message : "Erreur de calcul.");
      }
    }, 300);
    return () => window.clearTimeout(debounceRef.current);
  }, [areaM2]);

  function changerM2(v: string) {
    setM2Str(v);
    const n = Number(v.replace(",", "."));
    setFt2Str(n > 0 ? String(Math.round(n * M2_TO_FT2)) : "");
  }

  function changerFt2(v: string) {
    setFt2Str(v);
    const n = Number(v.replace(",", "."));
    setM2Str(n > 0 ? String(Math.round((n / M2_TO_FT2) * 10) / 10) : "");
  }

  function choisirClient(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === Number(id));
    if (c?.lotAreaM2) changerM2(String(Math.round(c.lotAreaM2 * 10) / 10));
  }

  function changerMarge(f: CotationForfait, v: string) {
    const marge = Number(v.replace(",", "."));
    setReglages((prev) => ({
      ...prev,
      [f.id]: {
        margeStr: v,
        prixStr: Number.isFinite(marge)
          ? centsToDollarsStr(prixDepuisMarge(f.couts.totalCents, marge))
          : prev[f.id]?.prixStr ?? "",
      },
    }));
  }

  function changerPrix(f: CotationForfait, v: string) {
    const cents = parseCadToCents(v);
    setReglages((prev) => ({
      ...prev,
      [f.id]: {
        margeStr: cents > 0 ? margeDepuisPrix(f.couts.totalCents, cents).toFixed(1) : prev[f.id]?.margeStr ?? "",
        prixStr: v,
      },
    }));
  }

  async function sauvegarderMarge(f: CotationForfait) {
    setMessageCalc("");
    setErreurCalc("");
    const marge = Number((reglages[f.id]?.margeStr ?? "").replace(",", "."));
    if (!Number.isFinite(marge) || marge < 0 || marge > 95) {
      setErreurCalc("Marge invalide (entre 0 et 95 %).");
      return;
    }
    try {
      await api.put(`/api/packages/${f.id}`, { marginPct: Math.round(marge * 100) / 100 });
      setMessageCalc(`Marge du forfait ${f.name} sauvegardée (${marge.toLocaleString("fr-CA")} %).`);
      setForfaits((prev) => prev.map((p) => (p.id === f.id ? { ...p, marginPct: marge } : p)));
    } catch (err) {
      setErreurCalc(err instanceof ApiError ? err.message : "Erreur de sauvegarde.");
    }
  }

  async function creerSoumission(f: CotationForfait) {
    setErreurCalc("");
    const prixCents = parseCadToCents(reglages[f.id]?.prixStr ?? "");
    if (!clientId) {
      setErreurCalc("Choisissez un client pour créer la soumission.");
      return;
    }
    if (prixCents <= 0) {
      setErreurCalc("Prix invalide.");
      return;
    }
    try {
      const m2 = Math.round(areaM2 * 10) / 10;
      const ft2 = Math.round(areaM2 * M2_TO_FT2);
      const r = await api.post<{ document: { id: number } }>("/api/documents", {
        kind: "estimation",
        clientId: Number(clientId),
        lines: [
          {
            description: `Forfait ${f.name} — programme d'entretien de pelouse, ${f.visitCount} visites par saison (superficie ${String(m2).replace(".", ",")} m² / ${ft2} pi²)`,
            quantity: 1,
            unitPriceCents: prixCents,
          },
        ],
      });
      navigate(`/documents/${r.document.id}`);
    } catch (err) {
      setErreurCalc(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    }
  }

  // --- Éditeur de produits ---

  async function ouvrirEdition(f: CotationForfait | Forfait) {
    setMessageEdit("");
    setErreurEdit("");
    setEditionId(f.id);
    setVisitCountStr(String(f.visitCount));
    setVisitCostStr(centsToDollarsStr(f.visitCostCents));
    const r = await api.get<{ produits: ProduitForfait[] }>(`/api/packages/${f.id}/products`);
    setProduits(r.produits);
    if (!inventaire.length) {
      const inv = await api.get<{ produits: ProduitInventaire[] }>("/api/inventory");
      setInventaire(inv.produits);
    }
  }

  function modifierProduit(index: number, patch: Partial<ProduitForfait>) {
    setProduits((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function lierInventaire(index: number, itemIdStr: string) {
    const itemId = Number(itemIdStr) || null;
    const item = inventaire.find((i) => i.id === itemId);
    modifierProduit(index, {
      itemId,
      itemName: item?.name ?? null,
      itemFormat: item?.format ?? null,
      formatCostCents: item ? item.costCents : produits[index].unitCostCents ?? 0,
      label: produits[index].label || item?.name || "",
    });
  }

  async function sauvegarderProduits(e: React.FormEvent) {
    e.preventDefault();
    if (editionId === null) return;
    setMessageEdit("");
    setErreurEdit("");
    try {
      await api.put(`/api/packages/${editionId}/products`, {
        produits: produits.map((p) => ({
          itemId: p.itemId,
          label: p.label,
          dosePer100m2: p.dosePer100m2,
          doseUnit: p.doseUnit,
          formatQuantity: p.formatQuantity,
          applications: p.applications,
          unitCostCents: p.itemId ? null : p.unitCostCents ?? p.formatCostCents,
        })),
      });
      const visitCount = Number(visitCountStr);
      const visitCostCents = parseCadToCents(visitCostStr);
      await api.put(`/api/packages/${editionId}`, {
        visitCount: Number.isFinite(visitCount) ? Math.max(0, Math.round(visitCount)) : undefined,
        visitCostCents: visitCostCents >= 0 ? visitCostCents : undefined,
      });
      setMessageEdit("Produits et paramètres du forfait sauvegardés.");
      // Rafraîchit la cotation avec les nouveaux coûts.
      if (areaM2 > 0) {
        const r = await api.get<Cotation>(`/api/pricing/quote?areaM2=${areaM2}`);
        setCotation(r);
        setReglages((prev) => {
          const next = { ...prev };
          for (const f of r.forfaits) {
            const marge = Number((prev[f.id]?.margeStr ?? String(f.marginPct)).replace(",", "."));
            next[f.id] = {
              margeStr: prev[f.id]?.margeStr ?? String(f.marginPct),
              prixStr: centsToDollarsStr(
                prixDepuisMarge(f.couts.totalCents, Number.isFinite(marge) ? marge : f.marginPct),
              ),
            };
          }
          return next;
        });
      }
      const pkgs = await api.get<{ forfaits: Forfait[] }>("/api/packages");
      setForfaits(pkgs.forfaits);
    } catch (err) {
      setErreurEdit(err instanceof ApiError ? err.message : "Erreur de sauvegarde.");
    }
  }

  const forfaitEnEdition = forfaits.find((f) => f.id === editionId);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Nos forfaits</div>
          <h1>Forfaits & calculateur de prix</h1>
        </div>
      </div>

      <div className="panel">
        <h2>Calculateur de soumission</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          Entrez la superficie du terrain (ou choisissez un client mesuré avec l'outil
          Superficie) : le coût des produits et des visites est calculé pour chaque
          forfait, puis le prix suggéré selon la marge de profit — ajustez la marge ou
          le prix, l'autre suit.
        </p>
        <div className="form-grid">
          <label className="field">
            Superficie (m²)
            <input value={m2Str} onChange={(e) => changerM2(e.target.value)} inputMode="decimal" />
          </label>
          <label className="field">
            Superficie (pi²)
            <input value={ft2Str} onChange={(e) => changerFt2(e.target.value)} inputMode="decimal" />
          </label>
          <label className="field">
            Client (optionnel — pour créer la soumission)
            <select value={clientId} onChange={(e) => choisirClient(e.target.value)}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                  {c.lotAreaM2 ? ` (${Math.round(c.lotAreaM2)} m² mesurés)` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {messageCalc && <div className="ok-text">{messageCalc}</div>}
        {erreurCalc && <div className="error-text">{erreurCalc}</div>}
      </div>

      {cotation && (
        <div className="pkg-grid">
          {cotation.forfaits.map((f) => {
            const reglage = reglages[f.id] ?? { margeStr: String(f.marginPct), prixStr: "" };
            const prixCents = parseCadToCents(reglage.prixStr);
            const margeNum = Number(reglage.margeStr.replace(",", "."));
            return (
              <div key={f.id} className={`pkg-card${f.popular ? " popular" : ""}`}>
                {f.popular && <span className="flag">Le plus populaire</span>}
                <h3>{f.name}</h3>
                <div>
                  <span className="visits">{f.visits}</span>
                </div>

                <table className="data" style={{ marginTop: 12, fontSize: 13 }}>
                  <tbody>
                    {f.produits.map((p, i) => (
                      <tr key={i}>
                        <td>
                          {p.label}
                          <span style={{ color: "var(--muted)" }}>
                            {" "}
                            — {p.applications}× ·{" "}
                            {p.quantiteTotale.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}{" "}
                            {p.doseUnit}
                          </span>
                        </td>
                        <td className="num">{formatCad(p.coutCents)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        Visites ({f.visitCount} × {formatCad(f.visitCostCents)})
                      </td>
                      <td className="num">{formatCad(f.couts.visitesCents)}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Coût total</strong>
                      </td>
                      <td className="num">
                        <strong>{formatCad(f.couts.totalCents)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label className="field">
                    Marge de profit (%)
                    <input
                      value={reglage.margeStr}
                      onChange={(e) => changerMarge(f, e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="field">
                    Prix de la soumission ($)
                    <input
                      value={reglage.prixStr}
                      onChange={(e) => changerPrix(f, e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
                  {prixCents > 0 && (
                    <>
                      Profit : <strong>{formatCad(prixCents - f.couts.totalCents)}</strong>
                      {Number.isFinite(margeNum) && <> ({margeNum.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %)</>}
                      {" · "}
                      {formatCad(f.visitCount > 0 ? Math.round(prixCents / f.visitCount) : prixCents)} / visite
                    </>
                  )}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <button className="btn secondary small" onClick={() => sauvegarderMarge(f)}>
                    Sauvegarder la marge
                  </button>
                  <button className="btn secondary small" onClick={() => ouvrirEdition(f)}>
                    Ajuster les produits
                  </button>
                  <button className="btn small" onClick={() => creerSoumission(f)} disabled={!clientId}>
                    Créer la soumission
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {forfaitEnEdition && (
        <div className="panel">
          <h2>Produits appliqués — forfait {forfaitEnEdition.name}</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Dose par 100 m² pour une application; la contenance est la quantité du
            format acheté (ex. sac de 25 kg → 25, caisse « 2 x 10 L » → 20). Le coût
            du format vient de l'inventaire quand un produit est lié.
          </p>
          <form onSubmit={sauvegarderProduits}>
            <div style={{ overflowX: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Produit d'inventaire</th>
                    <th>Libellé</th>
                    <th>Dose / 100 m²</th>
                    <th>Unité</th>
                    <th>Contenance</th>
                    <th>Applications</th>
                    <th>Coût du format</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {produits.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <select value={p.itemId ?? ""} onChange={(e) => lierInventaire(i, e.target.value)}>
                          <option value="">— coût manuel —</option>
                          {inventaire.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.format})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={p.label}
                          onChange={(e) => modifierProduit(i, { label: e.target.value })}
                          required
                        />
                      </td>
                      <td>
                        <input
                          style={{ width: 80 }}
                          value={String(p.dosePer100m2)}
                          onChange={(e) =>
                            modifierProduit(i, { dosePer100m2: Number(e.target.value.replace(",", ".")) || 0 })
                          }
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          style={{ width: 60 }}
                          value={p.doseUnit}
                          onChange={(e) => modifierProduit(i, { doseUnit: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          style={{ width: 80 }}
                          value={String(p.formatQuantity)}
                          onChange={(e) =>
                            modifierProduit(i, { formatQuantity: Number(e.target.value.replace(",", ".")) || 0 })
                          }
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          style={{ width: 60 }}
                          value={String(p.applications)}
                          onChange={(e) =>
                            modifierProduit(i, { applications: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                          }
                          inputMode="numeric"
                        />
                      </td>
                      <td>
                        {p.itemId ? (
                          <span className="num">{formatCad(p.formatCostCents)}</span>
                        ) : (
                          <input
                            style={{ width: 90 }}
                            value={centsToDollarsStr(p.unitCostCents ?? p.formatCostCents)}
                            onChange={(e) =>
                              modifierProduit(i, {
                                unitCostCents: parseCadToCents(e.target.value),
                                formatCostCents: parseCadToCents(e.target.value),
                              })
                            }
                            inputMode="decimal"
                          />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => setProduits((prev) => prev.filter((_, j) => j !== i))}
                        >
                          Retirer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn secondary small"
              style={{ marginTop: 10 }}
              onClick={() =>
                setProduits((prev) => [
                  ...prev,
                  {
                    itemId: null,
                    label: "",
                    dosePer100m2: 1,
                    doseUnit: "kg",
                    formatQuantity: 1,
                    applications: 1,
                    unitCostCents: 0,
                    formatCostCents: 0,
                  },
                ])
              }
            >
              + Ajouter un produit
            </button>

            <div className="form-grid" style={{ marginTop: 14 }}>
              <label className="field">
                Nombre de visites par saison
                <input value={visitCountStr} onChange={(e) => setVisitCountStr(e.target.value)} inputMode="numeric" />
              </label>
              <label className="field">
                Coût par visite ($ — déplacement, main-d'œuvre)
                <input value={visitCostStr} onChange={(e) => setVisitCostStr(e.target.value)} inputMode="decimal" />
              </label>
            </div>

            {messageEdit && <div className="ok-text">{messageEdit}</div>}
            {erreurEdit && <div className="error-text">{erreurEdit}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="submit">
                Sauvegarder
              </button>
              <button className="btn secondary" type="button" onClick={() => setEditionId(null)}>
                Fermer
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel" style={{ marginTop: 8 }}>
        <h2>Forfaits tels qu'affichés sur stamourduvert.com</h2>
        <p style={{ color: "var(--muted)", marginTop: 4, marginBottom: 18, fontSize: 13 }}>
          Le contenu des cartes reste conforme au site vitrine; chaque forfait est
          personnalisé au terrain du client — le prix est établi à la soumission.
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
      </div>
    </>
  );
}
