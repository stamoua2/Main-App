// Montants monétaires : stockés en cents (entiers) pour éviter les erreurs de
// virgule flottante, affichés au format canadien-français « 1 234,56 $ ».
// On utilise l'espace insécable U+00A0 (compatible WinAnsi pour les PDF).

const NBSP = "\u00A0";

export function formatCad(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? "-" : ""}${grouped},${rest}${NBSP}$`;
}

export function parseCadToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input
    .replace(/[\s $]/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Format d'un pourcentage à la québécoise : 9.975 → « 9,975 % » */
export function formatPct(rate: number): string {
  const pct = rate * 100;
  const text = pct
    .toFixed(3)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
  return `${text}${NBSP}%`;
}
