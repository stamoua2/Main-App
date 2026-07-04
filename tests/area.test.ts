// Critère 4 — calcul de superficie : validation sur des polygones de
// superficie connue, en m² et pi².

import { describe, expect, it } from "vitest";
import { ft2ToM2, m2ToFt2, polygonAreaM2 } from "../shared/area.js";

// Construit un rectangle de dimensions métriques connues centré sur une
// latitude donnée (conversion mètres → degrés localement exacte).
function metricRectangle(latCenter: number, lngCenter: number, widthM: number, heightM: number) {
  const mPerDegLat = 111320; // ~ mètres par degré de latitude
  const mPerDegLng = 111320 * Math.cos((latCenter * Math.PI) / 180);
  const dLat = heightM / 2 / mPerDegLat;
  const dLng = widthM / 2 / mPerDegLng;
  return [
    { lat: latCenter - dLat, lng: lngCenter - dLng },
    { lat: latCenter - dLat, lng: lngCenter + dLng },
    { lat: latCenter + dLat, lng: lngCenter + dLng },
    { lat: latCenter + dLat, lng: lngCenter - dLng },
  ];
}

describe("polygonAreaM2", () => {
  it("retourne ~10 000 m² pour un carré de 100 m × 100 m à Gatineau", () => {
    // Latitude de la région de L'Ange-Gardien / Gatineau (~45,55° N)
    const square = metricRectangle(45.55, -75.55, 100, 100);
    const area = polygonAreaM2(square);
    expect(area).toBeGreaterThan(10000 * 0.995);
    expect(area).toBeLessThan(10000 * 1.005);
  });

  it("retourne ~600 m² pour un terrain résidentiel de 20 m × 30 m", () => {
    const lot = metricRectangle(45.5586, -75.4735, 20, 30); // L'Ange-Gardien
    const area = polygonAreaM2(lot);
    expect(area).toBeGreaterThan(600 * 0.995);
    expect(area).toBeLessThan(600 * 1.005);
  });

  it("est insensible à l'ordre des sommets (horaire vs anti-horaire)", () => {
    const square = metricRectangle(45.55, -75.55, 50, 50);
    const reversed = [...square].reverse();
    expect(polygonAreaM2(reversed)).toBeCloseTo(polygonAreaM2(square), 6);
  });

  it("retourne 0 pour moins de 3 sommets", () => {
    expect(polygonAreaM2([])).toBe(0);
    expect(polygonAreaM2([{ lat: 45, lng: -75 }, { lat: 45.001, lng: -75 }])).toBe(0);
  });

  it("un triangle vaut la moitié du rectangle correspondant", () => {
    const [a, b, c, d] = metricRectangle(45.55, -75.55, 80, 60);
    const rectangle = polygonAreaM2([a, b, c, d]);
    const triangle = polygonAreaM2([a, b, c]);
    expect(triangle).toBeCloseTo(rectangle / 2, 0);
  });
});

describe("conversions m² ↔ pi²", () => {
  it("convertit 10 000 m² en ~107 639 pi²", () => {
    expect(m2ToFt2(10000)).toBeCloseTo(107639.104, 2);
  });

  it("est réversible", () => {
    expect(ft2ToM2(m2ToFt2(4500))).toBeCloseTo(4500, 8);
  });
});
