import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Client, type Forfait } from "../api";
import { ft2ToM2, m2ToFt2 } from "../../shared/area";
import { classeStatut } from "../statut";
import { useFeedback } from "../components/Feedback";
import { SkeletonTable } from "../components/Skeleton";
import { exporterCsv } from "../lib/csv";

const CLIENT_VIDE = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine: "",
  city: "",
  province: "QC",
  postalCode: "",
  status: "actif",
  notes: "",
  packageId: null as number | null,
  lotAreaM2: null as number | null,
};

export type FormulaireClient = typeof CLIENT_VIDE;

export function FormClient({
  initial,
  forfaits,
  onSauvegarde,
  onAnnule,
}: {
  initial: FormulaireClient;
  forfaits: Forfait[];
  onSauvegarde: (data: FormulaireClient) => Promise<void>;
  onAnnule?: () => void;
}) {
  const [form, setForm] = useState(initial);
  // Superficie saisie/affichée en pi² (la base garde le métrique à l'interne).
  const [superficiePi2, setSuperficiePi2] = useState(
    initial.lotAreaM2 ? String(Math.round(m2ToFt2(initial.lotAreaM2))) : "",
  );
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  function champ<K extends keyof FormulaireClient>(key: K, value: FormulaireClient[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function changerSuperficie(valeur: string) {
    setSuperficiePi2(valeur);
    const pi2 = Number(valeur.replace(/[^\d.,]/g, "").replace(",", "."));
    champ("lotAreaM2", valeur.trim() && pi2 > 0 ? Math.round(ft2ToM2(pi2) * 100) / 100 : null);
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      await onSauvegarde(form);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <div className="form-grid">
        <label className="field">
          Prénom
          <input value={form.firstName} onChange={(e) => champ("firstName", e.target.value)} required />
        </label>
        <label className="field">
          Nom
          <input value={form.lastName} onChange={(e) => champ("lastName", e.target.value)} required />
        </label>
        <label className="field">
          Courriel
          <input type="email" value={form.email} onChange={(e) => champ("email", e.target.value)} />
        </label>
        <label className="field">
          Téléphone
          <input value={form.phone} onChange={(e) => champ("phone", e.target.value)} />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          Adresse
          <input
            value={form.addressLine}
            onChange={(e) => champ("addressLine", e.target.value)}
            placeholder="1177, route 315"
            required
          />
        </label>
        <label className="field">
          Ville
          <input value={form.city} onChange={(e) => champ("city", e.target.value)} required />
        </label>
        <label className="field">
          Province
          <input value={form.province} onChange={(e) => champ("province", e.target.value)} />
        </label>
        <label className="field">
          Code postal
          <input value={form.postalCode} onChange={(e) => champ("postalCode", e.target.value)} />
        </label>
        <label className="field">
          Forfait
          <select
            value={form.packageId ?? ""}
            onChange={(e) => champ("packageId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Aucun —</option>
            {forfaits.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.visits})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Statut
          <select value={form.status} onChange={(e) => champ("status", e.target.value)}>
            <option value="prospect">Prospect</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </select>
        </label>
        <label className="field">
          Superficie du terrain (pi²)
          <input
            value={superficiePi2}
            onChange={(e) => changerSuperficie(e.target.value)}
            inputMode="numeric"
            placeholder="Ex. : 5 000"
          />
          <span className="field-hint">Saisie manuelle. Ou mesurez-la sur la carte (page Superficie).</span>
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          Notes
          <textarea rows={2} value={form.notes} onChange={(e) => champ("notes", e.target.value)} />
        </label>
      </div>
      {erreur && <div className="error-text">{erreur}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn" type="submit" disabled={enCours}>
          {enCours ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        {onAnnule && (
          <button className="btn secondary" type="button" onClick={onAnnule}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

type CleTri = "fullName" | "city" | "packageName" | "lotAreaM2" | "status";

export default function Clients() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [recherche, setRecherche] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [tri, setTri] = useState<{ cle: CleTri; sens: 1 | -1 }>({ cle: "fullName", sens: 1 });
  const { toast, confirmer } = useFeedback();
  const navigate = useNavigate();

  async function charger(q = "") {
    const r = await api.get<{ clients: Client[] }>(
      q ? `/api/clients?q=${encodeURIComponent(q)}` : "/api/clients",
    );
    setClients(r.clients);
  }

  useEffect(() => {
    charger();
    api.get<{ forfaits: Forfait[] }>("/api/packages").then((r) => setForfaits(r.forfaits));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => charger(recherche), 250);
    return () => clearTimeout(t);
  }, [recherche]);

  function trierPar(cle: CleTri) {
    setTri((t) => (t.cle === cle ? { cle, sens: t.sens === 1 ? -1 : 1 } : { cle, sens: 1 }));
  }

  const clientsTries = useMemo(() => {
    if (!clients) return [];
    const val = (c: Client) => {
      if (tri.cle === "lotAreaM2") return c.lotAreaM2 ?? -1;
      const v = (c[tri.cle] as string | null) ?? "";
      return v.toLocaleLowerCase("fr-CA");
    };
    return [...clients].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * tri.sens;
      if (va > vb) return 1 * tri.sens;
      return 0;
    });
  }, [clients, tri]);

  async function supprimerClient(c: Client) {
    const ok = await confirmer({
      titre: `Supprimer ${c.fullName} ?`,
      message: "Cette action est définitive. Un client rattaché à des documents ne peut pas être supprimé.",
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/clients/${c.id}`);
      toast(`${c.fullName} supprimé.`);
      await charger(recherche);
    } catch (err) {
      toast(
        err instanceof ApiError ? err.message : "Erreur lors de la suppression.",
        "error",
      );
    }
  }

  function exporter() {
    exporterCsv(
      `clients-${new Date().toISOString().slice(0, 10)}`,
      [
        { cle: "fullName", titre: "Nom" },
        { cle: "email", titre: "Courriel" },
        { cle: "phone", titre: "Téléphone" },
        { cle: "addressLine", titre: "Adresse" },
        { cle: "city", titre: "Ville" },
        { cle: "postalCode", titre: "Code postal" },
        { cle: "packageName", titre: "Forfait" },
        { cle: "superficiePi2", titre: "Superficie (pi²)" },
        { cle: "status", titre: "Statut" },
      ],
      clientsTries.map((c) => ({
        ...c,
        packageName: c.packageName ?? "",
        superficiePi2: c.lotAreaM2 ? Math.round(m2ToFt2(c.lotAreaM2)) : "",
      })),
    );
    toast(`${clientsTries.length} client(s) exporté(s) en CSV.`, "info");
  }

  function EnteteTri({ cle, children, num }: { cle: CleTri; children: React.ReactNode; num?: boolean }) {
    const actif = tri.cle === cle;
    return (
      <th className={`triable${num ? " num" : ""}`} onClick={() => trierPar(cle)}>
        {children}
        <span className={`tri-fleche${actif ? "" : " tri-inactif"}`}>{actif && tri.sens === -1 ? "▼" : "▲"}</span>
      </th>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Clientèle</div>
          <h1>Clients</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn secondary" onClick={exporter} disabled={!clients?.length}>
            Exporter CSV
          </button>
          <button className="btn" onClick={() => setFormVisible((v) => !v)}>
            {formVisible ? "Fermer" : "+ Nouveau client"}
          </button>
        </div>
      </div>

      {formVisible && (
        <div className="panel">
          <h2>Nouveau client</h2>
          <FormClient
            initial={CLIENT_VIDE}
            forfaits={forfaits}
            onSauvegarde={async (data) => {
              await api.post("/api/clients", data);
              setFormVisible(false);
              toast("Client ajouté.");
              await charger(recherche);
            }}
            onAnnule={() => setFormVisible(false)}
          />
        </div>
      )}

      <div className="panel">
        <label className="field" style={{ maxWidth: 340, marginBottom: 14 }}>
          Rechercher
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, ville ou courriel…"
          />
        </label>
        {clients === null ? (
          <SkeletonTable lignes={6} colonnes={6} />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <EnteteTri cle="fullName">Nom</EnteteTri>
                  <EnteteTri cle="city">Adresse</EnteteTri>
                  <EnteteTri cle="packageName">Forfait</EnteteTri>
                  <EnteteTri cle="lotAreaM2" num>Superficie</EnteteTri>
                  <EnteteTri cle="status">Statut</EnteteTri>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clientsTries.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/clients/${c.id}`}>{c.fullName}</Link>
                    </td>
                    <td>
                      {c.addressLine}, {c.city}
                    </td>
                    <td>{c.packageName ?? "—"}</td>
                    <td className="num">
                      {c.lotAreaM2
                        ? `${Math.round(m2ToFt2(c.lotAreaM2)).toLocaleString("fr-CA")} pi²`
                        : "—"}
                    </td>
                    <td>
                      <span className={classeStatut(c.status)}>{c.status}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn secondary small" onClick={() => navigate(`/clients/${c.id}?edit=1`)}>
                          Modifier
                        </button>
                        <button className="btn danger small" onClick={() => supprimerClient(c)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientsTries.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <span className="empty-ico">
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </span>
                        <p>Aucun client trouvé.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
