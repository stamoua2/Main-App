// Formats monétaires canadiens-français et calcul TPS/TVQ.

import { describe, expect, it } from "vitest";
import { formatCad, formatPct, parseCadToCents } from "../shared/money.js";
import { computeTotals } from "../shared/taxes.js";

const NBSP = "\u00A0";

describe("formatCad", () => {
  it("formate au style québécois", () => {
    expect(formatCad(123456)).toBe(`1${NBSP}234,56${NBSP}$`);
    expect(formatCad(500)).toBe(`5,00${NBSP}$`);
    expect(formatCad(0)).toBe(`0,00${NBSP}$`);
    expect(formatCad(-7550)).toBe(`-75,50${NBSP}$`);
    expect(formatCad(109000)).toBe(`1${NBSP}090,00${NBSP}$`);
  });
});

describe("parseCadToCents", () => {
  it("accepte les formats usuels", () => {
    expect(parseCadToCents("1 234,56 $")).toBe(123456);
    expect(parseCadToCents("449")).toBe(44900);
    expect(parseCadToCents(749.5)).toBe(74950);
  });
});

describe("formatPct", () => {
  it("formate les taux de taxes", () => {
    expect(formatPct(0.05)).toBe(`5${NBSP}%`);
    expect(formatPct(0.09975)).toBe(`9,975${NBSP}%`);
  });
});

describe("computeTotals — TPS/TVQ optionnelles", () => {
  const lines = [
    { quantity: 1, unitPriceCents: 44900 }, // Forfait Essentiel 449,00 $
    { quantity: 2, unitPriceCents: 9500 },  // 2 × sursemis 95,00 $
  ];
  // Sous-total attendu : 449,00 + 190,00 = 639,00 $

  it("taxes désactivées : total = sous-total", () => {
    const t = computeTotals(lines, { taxesEnabled: false });
    expect(t.subtotalCents).toBe(63900);
    expect(t.tpsCents).toBe(0);
    expect(t.tvqCents).toBe(0);
    expect(t.totalCents).toBe(63900);
  });

  it("taxes activées : TPS 5 % et TVQ 9,975 % sur le sous-total", () => {
    const t = computeTotals(lines, { taxesEnabled: true });
    // TPS = 639,00 × 5 % = 31,95 $ ; TVQ = 639,00 × 9,975 % = 63,74025 → 63,74 $
    expect(t.tpsCents).toBe(3195);
    expect(t.tvqCents).toBe(6374);
    expect(t.totalCents).toBe(63900 + 3195 + 6374); // 734,69 $
  });

  it("acompte : borné au total, solde = total − acompte", () => {
    const t = computeTotals(lines, { taxesEnabled: false, depositCents: 20000 });
    expect(t.depositCents).toBe(20000);
    expect(t.balanceCents).toBe(43900);
    const capped = computeTotals(lines, { taxesEnabled: false, depositCents: 999999 });
    expect(capped.depositCents).toBe(63900);
    expect(capped.balanceCents).toBe(0);
  });

  it("arrondit chaque taxe au cent près", () => {
    const t = computeTotals([{ quantity: 1, unitPriceCents: 10001 }], { taxesEnabled: true });
    expect(t.tpsCents).toBe(500);  // 100,01 × 5 % = 5,0005 → 5,00
    expect(t.tvqCents).toBe(998);  // 100,01 × 9,975 % = 9,97599... → 9,98
  });
});
