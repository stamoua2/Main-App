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
      <aside className="sidebar">
        <div className="brand">St-Amour du Vert</div>
        <div className="brand-sub">Gestionnaire</div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
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
