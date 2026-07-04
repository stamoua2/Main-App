// Calcul de superficie d'un polygone tracé sur la carte (coordonnées géographiques).
// Formule de l'excès sphérique (même approche que Turf.js / Google Maps geometry).

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371008.8; // rayon moyen de la Terre (m)

export const M2_TO_FT2 = 10.7639104167097;

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Superficie d'un anneau polygonal en m² sur la sphère terrestre.
 * Les sommets sont donnés dans n'importe quel ordre (horaire ou anti-horaire);
 * le résultat est toujours positif. Le polygone n'a pas besoin d'être fermé
 * (le dernier sommet est relié automatiquement au premier).
 */
export function polygonAreaM2(path: LatLng[]): number {
  if (path.length < 3) return 0;
  let total = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p1 = path[i];
    const p2 = path[(i + 1) % n];
    const p3 = path[(i + 2) % n];
    total += (rad(p3.lng) - rad(p1.lng)) * Math.sin(rad(p2.lat));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function m2ToFt2(m2: number): number {
  return m2 * M2_TO_FT2;
}

export function ft2ToM2(ft2: number): number {
  return ft2 / M2_TO_FT2;
}
