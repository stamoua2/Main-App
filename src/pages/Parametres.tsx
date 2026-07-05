import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Parametres as ParametresType, type Utilisateur } from "../api";
import ChampMotDePasse from "../components/ChampMotDePasse";

export default function Parametres() {
  const [parametres, setParametres] = useState<ParametresType | null>(null);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [messageTaxes, setMessageTaxes] = useState("");
  const [erreurTaxes, setErreurTaxes] = useState("");

  const [nouvelUtilisateur, setNouvelUtilisateur] = useState({ name: "", username: "", email: "", password: "" });
  const [messageUtil, setMessageUtil] = useState("");
  const [erreurUtil, setErreurUtil] = useState("");
  const [edition, setEdition] = useState<{
    id: number;
    name: string;
    username: string;
    email: string;
    password: string;
  } | null>(null);

  async function chargerUtilisateurs() {
    const r = await api.get<{ utilisateurs: Utilisateur[] }>("/api/users");
    setUtilisateurs(r.utilisateurs);
  }

  useEffect(() => {
    api.get<{ parametres: ParametresType }>("/api/settings").then((r) => setParametres(r.parametres));
    chargerUtilisateurs();
  }, []);

  async function sauvegarderUtilisateur(e: FormEvent) {
    e.preventDefault();
    if (!edition) return;
    setMessageUtil("");
    setErreurUtil("");
    try {
      const payload: Record<string, string> = {
        name: edition.name,
        username: edition.username,
        email: edition.email,
      };
      if (edition.password) payload.password = edition.password;
      await api.put(`/api/users/${edition.id}`, payload);
      setMessageUtil(
        `Compte de ${edition.name} mis à jour${edition.password ? " (nouveau mot de passe actif)" : ""}.`,
      );
      setEdition(null);
      await chargerUtilisateurs();
    } catch (err) {
      setErreurUtil(err instanceof ApiError ? err.message : "Erreur lors de la mise à jour.");
    }
  }

  async function sauvegarderTaxes(e: FormEvent) {
    e.preventDefault();
    if (!parametres) return;
    setMessageTaxes("");
    setErreurTaxes("");
    try {
      const r = await api.put<{ parametres: ParametresType }>("/api/settings", {
        taxesEnabled: parametres.taxesEnabled,
        tpsNumber: parametres.tpsNumber,
        tvqNumber: parametres.tvqNumber,
        companyPhone: parametres.companyPhone,
        companyEmail: parametres.companyEmail,
        companyWebsite: parametres.companyWebsite,
        companyAddress: parametres.companyAddress,
      });
      setParametres(r.parametres);
      setMessageTaxes("Paramètres sauvegardés.");
    } catch (err) {
      setErreurTaxes(err instanceof ApiError ? err.message : "Erreur de sauvegarde.");
    }
  }

  async function creerUtilisateur(e: FormEvent) {
    e.preventDefault();
    setMessageUtil("");
    setErreurUtil("");
    try {
      await api.post("/api/users", nouvelUtilisateur);
      setMessageUtil(`Compte créé pour ${nouvelUtilisateur.name} (nom d'utilisateur : ${nouvelUtilisateur.username}).`);
      setNouvelUtilisateur({ name: "", username: "", email: "", password: "" });
      await chargerUtilisateurs();
    } catch (err) {
      setErreurUtil(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    }
  }

  if (!parametres) return <p>Chargement…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Paramètres</h1>
        </div>
      </div>

      <div className="panel">
        <h2>Entreprise & taxes</h2>
        <form onSubmit={sauvegarderTaxes}>
          <div className="form-grid">
            <label className="field">
              Adresse
              <input
                value={parametres.companyAddress}
                onChange={(e) => setParametres({ ...parametres, companyAddress: e.target.value })}
              />
            </label>
            <label className="field">
              Téléphone
              <input
                value={parametres.companyPhone}
                onChange={(e) => setParametres({ ...parametres, companyPhone: e.target.value })}
              />
            </label>
            <label className="field">
              Courriel
              <input
                value={parametres.companyEmail}
                onChange={(e) => setParametres({ ...parametres, companyEmail: e.target.value })}
              />
            </label>
            <label className="field">
              Site web
              <input
                value={parametres.companyWebsite}
                onChange={(e) => setParametres({ ...parametres, companyWebsite: e.target.value })}
                placeholder="www.stamourduvert.com"
              />
            </label>
            <label className="field check" style={{ alignSelf: "end" }}>
              <input
                type="checkbox"
                checked={parametres.taxesEnabled}
                onChange={(e) => setParametres({ ...parametres, taxesEnabled: e.target.checked })}
              />
              Appliquer les taxes TPS/TVQ par défaut
            </label>
            <label className="field">
              Numéro de TPS
              <input
                value={parametres.tpsNumber}
                onChange={(e) => setParametres({ ...parametres, tpsNumber: e.target.value })}
                placeholder="123456789 RT0001"
              />
            </label>
            <label className="field">
              Numéro de TVQ
              <input
                value={parametres.tvqNumber}
                onChange={(e) => setParametres({ ...parametres, tvqNumber: e.target.value })}
                placeholder="1234567890 TQ0001"
              />
            </label>
          </div>
          {messageTaxes && <div className="ok-text">{messageTaxes}</div>}
          {erreurTaxes && <div className="error-text">{erreurTaxes}</div>}
          <button className="btn" type="submit" style={{ marginTop: 14 }}>
            Sauvegarder
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
          Taux appliqués : TPS 5 % · TVQ 9,975 % (calculée sur le sous-total). Les
          taxes peuvent aussi être activées ou désactivées estimation par estimation.
        </p>
      </div>

      <div className="panel">
        <h2>Utilisateurs</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          La connexion se fait par nom d'utilisateur (le courriel fonctionne aussi).
        </p>
        <table className="data" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Nom d'utilisateur</th>
              <th>Courriel</th>
              <th>Rôle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>
                  <strong>{u.username}</strong>
                </td>
                <td>{u.email || "—"}</td>
                <td>
                  <span className="chip">{u.role}</span>
                </td>
                <td>
                  <button
                    className="btn secondary small"
                    onClick={() =>
                      setEdition({
                        id: u.id,
                        name: u.name,
                        username: u.username,
                        email: u.email,
                        password: "",
                      })
                    }
                  >
                    Modifier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {edition && (
          <>
            <h2>Modifier le compte — {edition.name}</h2>
            <form onSubmit={sauvegarderUtilisateur}>
              <div className="form-grid">
                <label className="field">
                  Nom
                  <input
                    value={edition.name}
                    onChange={(e) => setEdition({ ...edition, name: e.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  Nom d'utilisateur
                  <input
                    value={edition.username}
                    onChange={(e) => setEdition({ ...edition, username: e.target.value })}
                    minLength={3}
                    required
                  />
                </label>
                <label className="field">
                  Courriel
                  <input
                    type="email"
                    value={edition.email}
                    onChange={(e) => setEdition({ ...edition, email: e.target.value })}
                  />
                </label>
                <label className="field">
                  Nouveau mot de passe (laisser vide pour conserver)
                  <ChampMotDePasse
                    value={edition.password}
                    onChange={(v) => setEdition({ ...edition, password: v })}
                    minLength={8}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
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
          </>
        )}

        <h2 style={{ marginTop: 18 }}>Ajouter un utilisateur</h2>
        <form onSubmit={creerUtilisateur}>
          <div className="form-grid">
            <label className="field">
              Nom
              <input
                value={nouvelUtilisateur.name}
                onChange={(e) => setNouvelUtilisateur({ ...nouvelUtilisateur, name: e.target.value })}
                required
              />
            </label>
            <label className="field">
              Nom d'utilisateur
              <input
                value={nouvelUtilisateur.username}
                onChange={(e) => setNouvelUtilisateur({ ...nouvelUtilisateur, username: e.target.value })}
                minLength={3}
                placeholder="ex. : cindy"
                required
              />
            </label>
            <label className="field">
              Courriel (optionnel)
              <input
                type="email"
                value={nouvelUtilisateur.email}
                onChange={(e) => setNouvelUtilisateur({ ...nouvelUtilisateur, email: e.target.value })}
              />
            </label>
            <label className="field">
              Mot de passe (8 caractères min.)
              <ChampMotDePasse
                value={nouvelUtilisateur.password}
                onChange={(v) => setNouvelUtilisateur({ ...nouvelUtilisateur, password: v })}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
          </div>
          {messageUtil && <div className="ok-text">{messageUtil}</div>}
          {erreurUtil && <div className="error-text">{erreurUtil}</div>}
          <button className="btn" type="submit" style={{ marginTop: 14 }}>
            Créer le compte
          </button>
        </form>
      </div>
    </>
  );
}
