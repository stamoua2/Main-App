import { useState, type FormEvent } from "react";
import { api, ApiError, type Utilisateur } from "../api";
import ChampMotDePasse from "../components/ChampMotDePasse";

export default function Connexion({ onConnecte }: { onConnecte: (u: Utilisateur) => void }) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const r = await api.post<{ utilisateur: Utilisateur }>("/api/auth/login", {
        identifiant,
        password: motDePasse,
      });
      onConnecte(r.utilisateur);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur de connexion.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="login-mark" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        </span>
        <div className="brand">St-Amour du Vert</div>
        <div className="brand-sub">Gestionnaire d'entreprise</div>
        <form onSubmit={soumettre}>
          <label className="field">
            Nom d'utilisateur
            <input
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              autoComplete="username"
              placeholder="ex. : alex"
              required
            />
          </label>
          <label className="field">
            Mot de passe
            <ChampMotDePasse
              value={motDePasse}
              onChange={setMotDePasse}
              autoComplete="current-password"
              required
            />
          </label>
          {erreur && <div className="error-text">{erreur}</div>}
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
