import { useState, type FormEvent } from "react";
import { api, ApiError, type Utilisateur } from "../api";

export default function Connexion({ onConnecte }: { onConnecte: (u: Utilisateur) => void }) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const r = await api.post<{ utilisateur: Utilisateur }>("/api/auth/login", {
        email,
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
        <div className="brand">St-Amour du Vert</div>
        <div className="brand-sub">Gestionnaire d'entreprise</div>
        <form onSubmit={soumettre}>
          <label className="field">
            Courriel
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            Mot de passe
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
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
