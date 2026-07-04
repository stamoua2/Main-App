// Données de départ.
// Les forfaits et services sont copiés VERBATIM du code source de
// stamourduvert.com (bloc JS `packages` / `services` de la page d'accueil,
// instantané du 2026-07-04). Le script scripts/compare-forfaits.ts re-télécharge
// la page en direct et vérifie la correspondance service par service.

export interface SeedPackage {
  slug: string;
  name: string;
  visits: string;
  tagline: string;
  items: string[];
  popular: boolean;
}

export const SITE_PACKAGES: SeedPackage[] = [
  {
    slug: "essentiel",
    name: "Essentiel",
    visits: "3 visites par saison",
    tagline: "Les bases pour une pelouse en santé.",
    items: [
      "2 contrôles des mauvaises herbes",
      "3 fertilisations (printemps, été, automne)",
      "Fertilisation de printemps pour réveiller le gazon",
      "Fertilisation d'été pour soutenir le gazon à passer les mois chauds d'été",
      "Fertilisation d'automne riche en potassium",
    ],
    popular: false,
  },
  {
    slug: "regulier",
    name: "Régulier",
    visits: "4 visites par saison",
    tagline: "Notre programme le plus populaire.",
    items: [
      "3 contrôles des mauvaises herbes",
      "3 fertilisations (printemps, été, automne)",
      "Fondation — biostimulant de sol (acides humiques et fulviques)",
      "25 % de rabais sur le sursemis",
      "25 % de rabais sur les traitements anti-parasitaires",
    ],
    popular: true,
  },
  {
    slug: "elite",
    name: "Élite",
    visits: "5 visites par saison",
    tagline: "La totale, sans compromis.",
    items: [
      "3 contrôles des mauvaises herbes",
      "4 fertilisations (printemps, été 2x, automne)",
      "Fondation — biostimulant de sol (acides humiques et fulviques)",
      "Engrais enracineur (pour sursemis)",
      "Sursemis",
      "50 % de rabais sur les traitements anti-parasitaires",
    ],
    popular: false,
  },
];

export const SITE_SERVICES: { name: string; description: string }[] = [
  { name: "Contrôle des mauvaises herbes", description: "Aide le gazon à se densifier naturellement et augmente la qualité de votre pelouse." },
  { name: "Contrôle de la digitaire", description: "On élimine cette mauvaise herbe tenace, envahissante, de couleur vert fluo, de la même famille que le gazon." },
  { name: "Fertilisation", description: "Fournit les nutriments nécessaires au gazon et stimule une croissance uniforme et une couleur riche." },
  { name: "Sursemis", description: "Ajout de semences à gazon pour densifier la pelouse et combler les zones clairsemées." },
  { name: "Contrôle des vers blancs et insectes nuisibles", description: "Protège les racines contre les insectes qui détruisent la pelouse de l'intérieur." },
  { name: "Aération", description: "Décompacte le terrain pour que l'eau, l'air et les nutriments circulent librement jusqu'aux racines." },
  { name: "Gestion du sol (pH, micro-nutriments)", description: "Équilibre le pH et enrichit le sol pour une pelouse durablement en santé." },
  { name: "Traitement anti-parasitaire du périmètre", description: "Crée une barrière protectrice autour de la maison contre les insectes nuisibles." },
  { name: "Biostimulant", description: "Stimule naturellement la croissance des racines et la vie microbienne du sol pour une pelouse plus résistante, plus dense et plus vigoureuse." },
];

export const SEED_ALEX = {
  email: "alex@stamourduvert.com",
  name: "Alex St-Amour",
};

// Adresse réelle de la région : hôtel de ville de L'Ange-Gardien (Outaouais).
export const SEED_TEST_CLIENT = {
  first_name: "Denis",
  last_name: "Ouellet",
  email: "denis.ouellet@example.com",
  phone: "819-555-0142",
  address_line: "1177, route 315",
  city: "L'Ange-Gardien",
  province: "QC",
  postal_code: "J8L 0G1",
  status: "actif",
  notes: "Client de démonstration créé par la donnée de départ.",
};
