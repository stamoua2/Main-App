import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, type Utilisateur } from "./api";
import { Icone } from "./icons";
import Connexion from "./pages/Connexion";
import TableauDeBord from "./pages/TableauDeBord";
import Clients from "./pages/Clients";
import FicheClient from "./pages/FicheClient";
import Forfaits from "./pages/Forfaits";
import Superficie from "./pages/Superficie";
import Documents from "./pages/Documents";
import NouveauDocument from "./pages/NouveauDocument";
import DetailDocument from "./pages/DetailDocument";
import Parametres from "./pages/Parametres";
import Calendrier from "./pages/Calendrier";
import Soumissions from "./pages/Soumissions";
import Inventaire from "./pages/Inventaire";
import Commandes from "./pages/Commandes";
import Finances from "./pages/Finances";
import Marketing from "./pages/Marketing";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: "tableau" },
  { to: "/clients", label: "Clients", icon: "clients" },
  { to: "/forfaits", label: "Forfaits", icon: "forfaits" },
  { to: "/superficie", label: "Superficie", icon: "superficie" },
  { to: "/calendrier", label: "Calendrier & routes", icon: "calendrier" },
  { to: "/soumissions", label: "Soumissions web", icon: "soumissions" },
  { to: "/documents", label: "Estimations & factures", icon: "documents" },
  { to: "/inventaire", label: "Inventaire", icon: "inventaire" },
  { to: "/commandes", label: "Commandes", icon: "commandes" },
  { to: "/finances", label: "Finances", icon: "finances" },
  { to: "/marketing", label: "Marketing", icon: "marketing" },
  { to: "/parametres", label: "Paramètres", icon: "parametres" },
];

export default function App() {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ utilisateur: Utilisateur }>("/api/auth/me")
      .then((r) => setUtilisateur(r.utilisateur))
      .catch(() => setUtilisateur(null))
      .finally(() => setChargement(false));
  }, []);

  const deconnexion = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUtilisateur(null);
    navigate("/connexion");
  }, [navigate]);

  if (chargement) {
    return <div className="login-wrap">Chargement…</div>;
  }

  if (!utilisateur) {
    return (
      <Routes>
        <Route path="/connexion" element={<Connexion onConnecte={setUtilisateur} />} />
        <Route path="*" element={<Navigate to="/connexion" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${menuOuvert ? " menu-open" : ""}`}>
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
          </span>
          <div>
            <div className="brand">St-Amour du Vert</div>
            <div className="brand-sub">Gestionnaire</div>
          </div>
        </div>
        <button
          className="nav-toggle"
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setMenuOuvert((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOuvert ? (
              <>
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMenuOuvert(false)}>
              <span className="nav-ico"><Icone nom={item.icon} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="session">
          Connecté : <strong>{utilisateur.name}</strong>
          <br />
          <button onClick={deconnexion}>Se déconnecter</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<TableauDeBord />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<FicheClient />} />
          <Route path="/forfaits" element={<Forfaits />} />
          <Route path="/superficie" element={<Superficie />} />
          <Route path="/calendrier" element={<Calendrier />} />
          <Route path="/soumissions" element={<Soumissions />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/nouveau" element={<NouveauDocument />} />
          <Route path="/documents/:id/modifier" element={<NouveauDocument />} />
          <Route path="/documents/:id" element={<DetailDocument />} />
          <Route path="/inventaire" element={<Inventaire />} />
          <Route path="/commandes" element={<Commandes />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="/connexion" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
