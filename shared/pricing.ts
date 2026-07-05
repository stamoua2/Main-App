// Calcul des prix de contrat par forfait : coût des produits appliqués selon
// la superficie + coût des visites, puis prix suggéré selon la marge de profit.
//
// Définitions :
//  - dose : quantité de produit appliquée par 100 m² pour UNE application;
//  - contenance (formatQuantity) : quantité contenue dans le format acheté
//    (ex. sac de 25 kg → 25; caisse « 2 x 10 L » → 20);
//  - coût du format (formatCostCents) : prix payé pour un format complet;
//  - marge : marge sur le prix de vente → marge = (prix − coût) / prix.

export interface ProduitApplique {
  label: string;
  dosePer100m2: number;
  doseUnit: string;
  formatQuantity: number;
  formatCostCents: number;
  applications: number;
}

export interface DetailProduit extends ProduitApplique {
  /** Quantité totale de produit pour la saison (dose × superficie × applications). */
  quantiteTotale: number;
  /** Nombre de formats (fraction) nécessaires. */
  formats: number;
  coutCents: number;
}

export interface CoutForfait {
  details: DetailProduit[];
  produitsCents: number;
  visitesCents: number;
  totalCents: number;
}

export function detailProduit(p: ProduitApplique, areaM2: number): DetailProduit {
  const quantiteTotale = p.dosePer100m2 * (areaM2 / 100) * p.applications;
  const formats = p.formatQuantity > 0 ? quantiteTotale / p.formatQuantity : 0;
  const coutCents = Math.round(formats * p.formatCostCents);
  return { ...p, quantiteTotale, formats, coutCents };
}

export function coutForfait(
  produits: ProduitApplique[],
  areaM2: number,
  visitCount: number,
  visitCostCents: number,
): CoutForfait {
  const details = produits.map((p) => detailProduit(p, areaM2));
  const produitsCents = details.reduce((sum, d) => sum + d.coutCents, 0);
  const visitesCents = Math.round(visitCount * visitCostCents);
  return { details, produitsCents, visitesCents, totalCents: produitsCents + visitesCents };
}

/**
 * Prix de vente suggéré pour une marge donnée (marge sur le prix de vente),
 * arrondi au dollar supérieur. prix = coût / (1 − marge).
 */
export function prixDepuisMarge(coutCents: number, margePct: number): number {
  if (coutCents <= 0) return 0;
  const marge = Math.min(Math.max(margePct, 0), 95) / 100;
  return Math.ceil(coutCents / (1 - marge) / 100) * 100;
}

/** Marge (%) obtenue pour un prix donné. Peut être négative si prix < coût. */
export function margeDepuisPrix(coutCents: number, prixCents: number): number {
  if (prixCents <= 0) return 0;
  return ((prixCents - coutCents) / prixCents) * 100;
}
