import { useState } from "react";

// Icônes « œil » au trait (style Lucide, 2 px), conformes au système de
// design du site (pas d'émoji, pas de police d'icônes).
function OeilOuvert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OeilBarre() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  autoComplete?: string;
}

/** Champ mot de passe avec bouton « œil » pour afficher/masquer le texte. */
export default function ChampMotDePasse({
  value,
  onChange,
  placeholder,
  minLength,
  required,
  autoComplete = "current-password",
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="pw-wrap">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <OeilBarre /> : <OeilOuvert />}
      </button>
    </span>
  );
}
