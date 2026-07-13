import { Link } from "react-router-dom";

// Lien de retour cohérent, placé au-dessus du titre d'une page de détail/édition
// pour toujours offrir un chemin de retour clair (navigation intuitive).
export function Retour({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="retour-lien">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
      {children}
    </Link>
  );
}
