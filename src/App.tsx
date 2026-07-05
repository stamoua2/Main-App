import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, type Utilisateur } from "./api";
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
  { to: "/", label: "Tableau de bord", num: "01" },
  { to: "/clients", label: "Clients", num: "02" },
  { to: "/forfaits", label: "Forfaits", num: "03" },
  { to: "/superficie", label: "Superficie", num: "04" },
  { to: "/calendrier", label: "Calendrier & routes", num: "05" },
  { to: "/soumissions", label: "Soumissions web", num: "06" },
  { to: "/documents", label: "Estimations & factures", num: "07" },
  { to: "/inventaire", label: "Inventaire", num: "08" },
  { to: "/commandes", label: "Commandes", num: "09" },
  { to: "/finances", label: "Finances", num: "10" },
  { to: "/marketing", label: "Marketing", num: "11" },
  { to: "/parametres", label: "Paramètres", num: "12" },
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
        <div>
          <div className="brand">St-Amour du Vert</div>
          <div className="brand-sub">Gestionnaire</div>
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
              <span className="num">{item.num}</span>
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
