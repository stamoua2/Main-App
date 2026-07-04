import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Client, type Forfait } from "../api";
import { m2ToFt2 } from "../../shared/area";

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
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  function champ<K extends keyof FormulaireClient>(key: K, value: FormulaireClient[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [recherche, setRecherche] = useState("");
  const [formVisible, setFormVisible] = useState(false);

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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Clientèle</div>
          <h1>Clients</h1>
        </div>
        <button className="btn" onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? "Fermer" : "+ Nouveau client"}
        </button>
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
        <table className="data">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Adresse</th>
              <th>Forfait</th>
              <th className="num">Superficie</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
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
                  <span className={`chip${c.status === "prospect" ? " warn" : c.status === "inactif" ? " muted" : ""}`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Aucun client trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
