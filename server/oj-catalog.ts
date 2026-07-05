// Catalogue OJ Compagnie — Liste de prix espaces verts 2026 (français).
// Transcrit du PDF fourni (Liste_de_prix_espaces_verts_2026_Fr.pdf, daté du
// 19/05/2026, F.O.B. Sherrington, net 30 jours, sujet à TPS & TVQ).
// Prix en cents CAD. `sku` = code produit OJ lorsque présent au catalogue.

export interface OjProduct {
  name: string;
  category: string;
  format: string;
  sku?: string;
  priceCents: number;
}

export const OJ_CATALOG: OjProduct[] = [
  // ---- Insecticides ----
  { name: "Acecap capsule 3/8", category: "Insecticides", format: "300 / boîte", priceCents: 45000 },
  { name: "Acelepryn", category: "Insecticides", format: "4 x 1,89 L", priceCents: 199500 },
  { name: "Acelepryn G", category: "Insecticides", format: "10 kg", priceCents: 12500 },
  { name: "BioTitan GR", category: "Insecticides", format: "10 kg", priceCents: 13500 },
  { name: "BioTitan WP", category: "Insecticides", format: "4 kg", priceCents: 44900 },
  { name: "BioTitan WP", category: "Insecticides", format: "12 x 500 g", priceCents: 9900 },
  { name: "DeltaGard", category: "Insecticides", format: "4 x 1 L", priceCents: 23000 },
  { name: "Huile Supérieure", category: "Insecticides", format: "2 x 10 L", priceCents: 13900 },
  { name: "Ground Force", category: "Insecticides", format: "10 kg", priceCents: 13000 },
  { name: "Nématodes Nemagard", category: "Insecticides", format: "250 millions", priceCents: 11200 },
  { name: "Savon Safer's", category: "Insecticides", format: "2 x 10 L", priceCents: 11500 },
  { name: "Savon Safer's", category: "Insecticides", format: "120 L", priceCents: 110000 },
  { name: "Suspend Poly Z", category: "Insecticides", format: "8 x 900 ml", priceCents: 20298 },
  { name: "Suspend Poly Z", category: "Insecticides", format: "2 x 4 L", priceCents: 89250 },
  { name: "Trounce", category: "Insecticides", format: "2 x 10 L", priceCents: 17000 },
  { name: "Trounce", category: "Insecticides", format: "120 L", priceCents: 150100 },

  // ---- Herbicides ----
  { name: "Finalsan", category: "Herbicides", format: "2 x 10 L", priceCents: 12800 },
  { name: "Fiesta", category: "Herbicides", format: "2 x 10 L", priceCents: 18400 },
  { name: "Fiesta", category: "Herbicides", format: "800 L", priceCents: 859500 },
  { name: "Fiesta granulaire", category: "Herbicides", format: "20 kg (44 lbs)", priceCents: 28340 },
  { name: "AG 10-0-0 Gluten de maïs", category: "Herbicides", format: "18,2 kg (40 lbs)", priceCents: 4120 },
  { name: "Mad Dog (Glyphosate)", category: "Herbicides", format: "2 x 10 L", priceCents: 9400 },
  { name: "Vinaigre Munger", category: "Herbicides", format: "2 x 10 L", priceCents: 9000 },
  { name: "Weed Out Ultra Professional", category: "Herbicides", format: "2 x 10 L", priceCents: 63000 },
  { name: "Vanquish", category: "Herbicides", format: "2 x 10 L", priceCents: 34000 },

  // ---- Agents mouillants ----
  { name: "Aqueduct Flex", category: "Agents mouillants", format: "20 kg", priceCents: 27300 },
  { name: "Dispatch", category: "Agents mouillants", format: "2 x 10 L", priceCents: 46500 },
  { name: "Duplex", category: "Agents mouillants", format: "75,6 L", priceCents: 92500 },

  // ---- Autres produits ----
  { name: "Disclose pH (BB5)", category: "Autres produits", format: "2 x 10 L", priceCents: 26900 },
  { name: "Incide Out (nettoyeur de citerne)", category: "Autres produits", format: "12 x 946 ml", priceCents: 26900 },
  { name: "Knock Down (anti-mousse)", category: "Autres produits", format: "12 x 946 ml", priceCents: 40100 },
  { name: "LI 700", category: "Autres produits", format: "2 x 10 L", priceCents: 15900 },
  { name: "Liberate", category: "Autres produits", format: "2 x 10 L", priceCents: 14900 },
  { name: "Acide citrique", category: "Autres produits", format: "25 kg (55 lbs)", priceCents: 15000 },
  { name: "Odour Mask", category: "Autres produits", format: "1 L", priceCents: 9200 },
  { name: "Border 2", category: "Autres produits", format: "2 x 9,46 L", priceCents: 17500 },
  { name: "Super Spreader Sticker", category: "Autres produits", format: "4 x 3,78 L", priceCents: 10300 },
  { name: "Stick N Stay", category: "Autres produits", format: "9,46 L", priceCents: 34500 },
  { name: "Par", category: "Autres produits", format: "3,78 L", priceCents: 21000 },
  { name: "Net +", category: "Autres produits", format: "4 x 3,78 L", priceCents: 6300 },

  // ---- OJ Biostimulants ----
  { name: "AGTIV REACH G Gazon", category: "OJ Biostimulants", format: "20 kg (44 lbs)", priceCents: 16900 },
  { name: "Stimul-8", category: "OJ Biostimulants", format: "2 x 9,46 L", priceCents: 53900 },
  { name: "Matrix 1-0-4 algues marines", category: "OJ Biostimulants", format: "2 x 10 L", priceCents: 8600 },
  { name: "Fondation, mélange d'acides organiques", category: "OJ Biostimulants", format: "2 x 10 L", priceCents: 6000 },
  { name: "Aerifier Plus 15-0-0", category: "OJ Biostimulants", format: "2 x 10 L", priceCents: 10400 },
  { name: "Vitalis Aeration Liquide", category: "OJ Biostimulants", format: "2 x 10 L", priceCents: 9500 },
  { name: "Vitalis Aeration Liquide", category: "OJ Biostimulants", format: "205 L", priceCents: 137500 },
  { name: "Vitalis Aeration Liquide", category: "OJ Biostimulants", format: "1000 L", priceCents: 620000 },
  { name: "Soil Builder 35g", category: "OJ Biostimulants", format: "18,15 kg (40 lbs)", priceCents: 5655 },
  { name: "Vermicast compost", category: "OJ Biostimulants", format: "2 x 10 L", priceCents: 10500 },
  { name: "Vermicast compost", category: "OJ Biostimulants", format: "1000 L", priceCents: 320000 },

  // ---- Engrais granulaires naturels ----
  { name: "OJ Performance 9-2-2 100 % Naturel", category: "Engrais granulaires naturels", format: "20 kg (44 lbs)", sku: "R532070", priceCents: 4244 },

  // ---- Engrais granulaires ----
  { name: "OJ Performance 44-0-0 35 % Nutryon-S 35 % Polyon (90 jours)", category: "Engrais granulaires", format: "20 kg (44 lbs)", sku: "R540820", priceCents: 4669 },
  { name: "OJ Performance 43-0-0 Polyon (90 jours)", category: "Engrais granulaires", format: "20 kg (44 lbs)", sku: "R543963", priceCents: 6119 },
  { name: "OJ Performance 30-0-10 40 % Nutryon-S 35 % Polyon", category: "Engrais granulaires", format: "25 kg (55 lbs)", sku: "R802189", priceCents: 4619 },
  { name: "OJ Performance 30-0-4 30 % Umaxx", category: "Engrais granulaires", format: "25 kg (55 lbs)", sku: "R543949", priceCents: 3881 },
  { name: "OJ Performance 24-0-6 50 % Umaxx", category: "Engrais granulaires", format: "25 kg (55 lbs)", sku: "R546147", priceCents: 3688 },
  { name: "OJ Performance 21-3-7 25 % Nutryon-S 40 % DefeNd", category: "Engrais granulaires", format: "25 kg (55 lbs)", sku: "R801293", priceCents: 2906 },
  { name: "OJ Performance 21-3-10 50 % Nutryon-S", category: "Engrais granulaires", format: "25 kg (55 lbs)", sku: "R801300", priceCents: 3313 },
  { name: "OJ Performance 16-32-6 25 % Nutryon-S", category: "Engrais granulaires", format: "25 kg (55 lbs)", sku: "R537460", priceCents: 4031 },

  // ---- Engrais granulaires horticoles ----
  { name: "14-14-14 dégagement Polyon", category: "Engrais granulaires horticoles", format: "25 kg (55 lbs)", sku: "R530866", priceCents: 11925 },
  { name: "14-7-14 Arbres et conifères", category: "Engrais granulaires horticoles", format: "10 kg", sku: "R533309", priceCents: 2312 },
  { name: "8-10-10 Vivaces et annuelles", category: "Engrais granulaires horticoles", format: "10 kg", sku: "R538230", priceCents: 1744 },
  { name: "5-4-3 Naturel avec fer", category: "Engrais granulaires horticoles", format: "20 kg (44 lbs)", sku: "R526141", priceCents: 1756 },
  { name: "4-10-0 Farine d'os", category: "Engrais granulaires horticoles", format: "10 kg", sku: "R533281", priceCents: 2419 },

  // ---- Engrais solubles ----
  { name: "OJ Performance 42-0-5 50 % Umaxx", category: "Engrais solubles", format: "15 kg (33 lbs)", sku: "S062373", priceCents: 4994 },
  { name: "46-0-0 urée", category: "Engrais solubles", format: "25 kg (55 lbs)", sku: "F4600TECH", priceCents: 4994 },
  { name: "OJ Performance 35-2-10 30 % Umaxx 1,5 % Mg", category: "Engrais solubles", format: "15 kg (33 lbs)", sku: "S064655", priceCents: 5369 },
  { name: "Sulfate ammoniaque 21-0-0", category: "Engrais solubles", format: "22,68 kg (50 lbs)", sku: "2100SA51LB", priceCents: 3744 },
  { name: "20-20-20", category: "Engrais solubles", format: "15 kg (33 lbs)", sku: "S060182", priceCents: 6965 },
  { name: "15-30-15", category: "Engrais solubles", format: "15 kg (33 lbs)", sku: "S060091", priceCents: 6965 },
  { name: "10-52-10", category: "Engrais solubles", format: "15 kg (33 lbs)", sku: "S060021", priceCents: 8037 },
  { name: "Yara 13,2 % Fe", category: "Engrais solubles", format: "25 kg (55 lbs)", sku: "EDTAFE25K", priceCents: 36875 },

  // ---- Engrais liquides ----
  { name: "OJ Performance 12-0-0 6 % Fe", category: "Engrais liquides", format: "2 x 10 L", priceCents: 6100 },
  { name: "OJ Performance 30-0-0 50 % Triazone", category: "Engrais liquides", format: "2 x 10 L", priceCents: 5275 },
  { name: "OJ Performance 30-0-0 50 % Triazone", category: "Engrais liquides", format: "205 L", priceCents: 76800 },
  { name: "OJ Performance 30-0-0 50 % Triazone", category: "Engrais liquides", format: "1000 L", priceCents: 357500 },

  // ---- Amendements de sol ----
  { name: "OJ Performance Chaux Dolomitique", category: "Amendements de sol", format: "25 kg (55 lbs)", priceCents: 1369 },
  { name: "OJ Performance Chaux Calcitique", category: "Amendements de sol", format: "25 kg (55 lbs)", priceCents: 1194 },
  { name: "OJ Performance Gypse", category: "Amendements de sol", format: "25 kg (55 lbs)", priceCents: 1619 },

  // ---- Semences ----
  { name: "OJ Mélange Tout Usage (40-40-20) — 40 % Pâturin, 40 % Fétuque, 20 % Raygrass", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 12500 },
  { name: "OJ Extreme Green — 30 % Pâturin, 40 % Fétuque, 30 % Raygrass", category: "Semences", format: "2 kg (4,4 lbs)", priceCents: 1120 },
  { name: "OJ Extreme Green — 30 % Pâturin, 40 % Fétuque, 30 % Raygrass", category: "Semences", format: "10 kg (22 lbs)", priceCents: 5600 },
  { name: "OJ Extreme Green Rapide — 10 % Pâturin, 10 % Fétuque, 80 % Raygrass", category: "Semences", format: "10 kg (22 lbs)", priceCents: 5600 },
  { name: "OJ Extreme Green Ombre — 10 % Pâturin, 50 % Fétuque, 20 % Fét. Chewing, 20 % Raygrass", category: "Semences", format: "10 kg (22 lbs)", priceCents: 5550 },
  { name: "OJ Mélange 60-40 — 60 % Pâturin, 40 % Raygrass", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 10300 },
  { name: "OJ Mélange 20-80 — 20 % Pâturin, 80 % Raygrass", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 9700 },
  { name: "OJ Raygrass Commun no 1 Vivace", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 8750 },
  { name: "Champion GQ Raygrass", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 13750 },
  { name: "OJ Mélange Ombre — 30 % Pâturin, 50 % Fétuque, 20 % Raygrass", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 10500 },
  { name: "Shadow Nook — 30 % Pâturin rude, 50 % Fétuque, 20 % Raygrass", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 18750 },
  { name: "OJ Mélange Terrain Sportif", category: "Semences", format: "22,68 kg (50 lbs)", priceCents: 21250 },
];
