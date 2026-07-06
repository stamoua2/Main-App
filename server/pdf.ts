// Génération des PDF d'estimations et de factures — français, CAD,
// TPS/TVQ selon la configuration, acompte. Polices standard (Helvetica),
// encodage WinAnsi (accents français pris en charge).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatCad, formatPct } from "../shared/money.js";

const GREEN_FOREST = rgb(0x17 / 255, 0x4a / 255, 0x2d / 255);
const GREEN_PRAIRIE = rgb(0x2e / 255, 0x82 / 255, 0x55 / 255);
const GREEN_PALE = rgb(0xea / 255, 0xf1 / 255, 0xe6 / 255);
const MINT = rgb(0xa6 / 255, 0xe2 / 255, 0xbc / 255);
const INK = rgb(0x23 / 255, 0x27 / 255, 0x1f / 255);
const MUTED = rgb(0x4a / 255, 0x52 / 255, 0x47 / 255);
const BORDER = rgb(0xe7 / 255, 0xe3 / 255, 0xd8 / 255);
const WHITE = rgb(1, 1, 1);
const CREAM = rgb(0xfa / 255, 0xf8 / 255, 0xf3 / 255);

const PAGE_W = 612; // Lettre US
const PAGE_H = 792;
const MARGIN = 44;

export interface PdfDocumentData {
  kind: "estimation" | "contrat" | "facture";
  number: string;
  issuedOn: string; // AAAA-MM-JJ
  status: string;
  taxesEnabled: boolean;
  tpsRate: number;
  tvqRate: number;
  subtotalCents: number;
  tpsCents: number;
  tvqCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  notes: string;
  client: {
    name: string;
    addressLine: string;
    city: string;
    province: string;
    postalCode: string;
    email: string;
    phone: string;
  };
  lines: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
  }[];
  company: {
    name: string;
    address: string;
    email: string;
    phone: string;
    website: string;
    tpsNumber: string;
    tvqNumber: string;
    estimateValidityDays: number;
  };
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function formatDateFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const day = d === 1 ? "1er" : String(d);
  return `${day} ${MONTHS_FR[m - 1]} ${y}`;
}

// WinAnsi ne couvre pas tout l'Unicode : on remplace les espaces fines et
// tout caractère hors Latin-1/WinAnsi avant d'écrire dans le PDF.
function sanitize(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/[‐-‒]/g, "-")
    .replace(/…/g, "...")
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code <= 0xff) return ch;
      if ("’‘“”–—«»€".includes(ch)) return ch; // présents dans WinAnsi
      return "?";
    })
    .join("");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function drawRight(ctx: Ctx, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  const t = sanitize(text);
  ctx.page.drawText(t, { x: x - font.widthOfTextAtSize(t, size), y, size, font, color });
}

function drawLeft(ctx: Ctx, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  ctx.page.drawText(sanitize(text), { x, y, size, font, color });
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

export async function generateDocumentPdf(data: PdfDocumentData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, page, font, bold, y: 0 };

  const title =
    data.kind === "estimation" ? "ESTIMATION" : data.kind === "contrat" ? "CONTRAT" : "FACTURE";
  doc.setTitle(`${title} ${data.number} — ${data.company.name}`);
  doc.setLanguage("fr-CA");

  // ---- Bandeau d'en-tête ----
  const bandH = 104;
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - bandH, width: PAGE_W, height: bandH, color: GREEN_FOREST });
  drawLeft(ctx, data.company.name, MARGIN, PAGE_H - 44, 21, bold, WHITE);
  drawLeft(ctx, "Entretien de pelouse — L'Ange-Gardien (Outaouais)", MARGIN, PAGE_H - 60, 9.5, font, MINT);
  drawLeft(
    ctx,
    [data.company.phone, data.company.email, data.company.website].filter(Boolean).join("  ·  "),
    MARGIN, PAGE_H - 74, 9.5, font, WHITE,
  );
  drawLeft(ctx, data.company.address, MARGIN, PAGE_H - 87, 9.5, font, MINT);
  drawRight(ctx, title, PAGE_W - MARGIN, PAGE_H - 46, 19, bold, WHITE);
  drawRight(ctx, `No ${data.number}`, PAGE_W - MARGIN, PAGE_H - 63, 10.5, font, WHITE);
  drawRight(ctx, `Date : ${formatDateFr(data.issuedOn)}`, PAGE_W - MARGIN, PAGE_H - 77, 9.5, font, MINT);

  ctx.y = PAGE_H - bandH - 34;

  // ---- Bloc client + mentions ----
  const blockTop = ctx.y;
  drawLeft(ctx, data.kind === "estimation" ? "PRÉPARÉ POUR" : "FACTURÉ À", MARGIN, ctx.y, 8.5, bold, GREEN_PRAIRIE);
  ctx.y -= 15;
  drawLeft(ctx, data.client.name, MARGIN, ctx.y, 12, bold, INK);
  ctx.y -= 14;
  const addressParts = [
    data.client.addressLine,
    [data.client.city, data.client.province].filter(Boolean).join(" ("),
  ];
  if (data.client.city) addressParts[1] += ")";
  const cityLine = [addressParts[1], data.client.postalCode].filter(Boolean).join("  ");
  for (const line of [addressParts[0], cityLine].filter(Boolean)) {
    drawLeft(ctx, line, MARGIN, ctx.y, 10, font, MUTED);
    ctx.y -= 13;
  }
  for (const line of [data.client.email, data.client.phone].filter(Boolean)) {
    drawLeft(ctx, line, MARGIN, ctx.y, 10, font, MUTED);
    ctx.y -= 13;
  }

  // Mentions à droite
  let metaY = blockTop;
  if (data.kind === "estimation") {
    drawRight(ctx, "VALIDITÉ", PAGE_W - MARGIN, metaY, 8.5, bold, GREEN_PRAIRIE);
    metaY -= 14;
    drawRight(
      ctx,
      `Cette estimation est valide ${data.company.estimateValidityDays} jours.`,
      PAGE_W - MARGIN, metaY, 9.5, font, MUTED,
    );
  } else {
    drawRight(ctx, "MODALITÉS", PAGE_W - MARGIN, metaY, 8.5, bold, GREEN_PRAIRIE);
    metaY -= 14;
    drawRight(ctx, "Paiement dû sur réception.", PAGE_W - MARGIN, metaY, 9.5, font, MUTED);
  }
  metaY -= 14;
  drawRight(ctx, `Statut : ${data.status}`, PAGE_W - MARGIN, metaY, 9.5, font, MUTED);

  ctx.y = Math.min(ctx.y, metaY) - 26;

  // ---- Tableau des lignes ----
  const colDesc = MARGIN + 10;
  const colQty = 388;
  const colUnit = 480;
  const colAmount = PAGE_W - MARGIN - 8;
  const descWidth = colQty - colDesc - 40;

  const drawTableHeader = () => {
    ctx.page.drawRectangle({
      x: MARGIN, y: ctx.y - 8, width: PAGE_W - 2 * MARGIN, height: 24,
      color: GREEN_PALE,
    });
    drawLeft(ctx, "Description", colDesc, ctx.y, 9, ctx.bold, GREEN_FOREST);
    drawRight(ctx, "Qté", colQty, ctx.y, 9, ctx.bold, GREEN_FOREST);
    drawRight(ctx, "Prix unitaire", colUnit, ctx.y, 9, ctx.bold, GREEN_FOREST);
    drawRight(ctx, "Montant", colAmount, ctx.y, 9, ctx.bold, GREEN_FOREST);
    ctx.y -= 26;
  };
  drawTableHeader();

  for (const line of data.lines) {
    const wrapped = wrapText(line.description, font, 10, descWidth);
    const rowHeight = wrapped.length * 13 + 8;
    if (ctx.y - rowHeight < 170) {
      newPage(ctx);
      drawTableHeader();
    }
    let textY = ctx.y;
    for (const part of wrapped) {
      drawLeft(ctx, part, colDesc, textY, 10, font, INK);
      textY -= 13;
    }
    const qty = Number.isInteger(line.quantity)
      ? String(line.quantity)
      : String(line.quantity).replace(".", ",");
    drawRight(ctx, qty, colQty, ctx.y, 10, font, INK);
    drawRight(ctx, formatCad(line.unitPriceCents), colUnit, ctx.y, 10, font, INK);
    drawRight(ctx, formatCad(line.amountCents), colAmount, ctx.y, 10, font, INK);
    ctx.y = textY - 4;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y + 6 },
      end: { x: PAGE_W - MARGIN, y: ctx.y + 6 },
      thickness: 0.7,
      color: BORDER,
    });
    ctx.y -= 8;
  }

  // ---- Totaux ----
  if (ctx.y < 210) newPage(ctx);
  ctx.y -= 6;
  const labelX = 400;
  const totalRow = (label: string, amount: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.bold ? bold : font;
    drawRight(ctx, label, colUnit, ctx.y, 10, f, opts.color ?? MUTED);
    drawRight(ctx, formatCad(amount), colAmount, ctx.y, opts.bold ? 11 : 10, f, opts.color ?? INK);
    ctx.y -= 17;
  };

  totalRow("Sous-total", data.subtotalCents);
  if (data.taxesEnabled) {
    const tpsLabel = data.company.tpsNumber
      ? `TPS (${formatPct(data.tpsRate)}) — ${data.company.tpsNumber}`
      : `TPS (${formatPct(data.tpsRate)})`;
    const tvqLabel = data.company.tvqNumber
      ? `TVQ (${formatPct(data.tvqRate)}) — ${data.company.tvqNumber}`
      : `TVQ (${formatPct(data.tvqRate)})`;
    totalRow(tpsLabel, data.tpsCents);
    totalRow(tvqLabel, data.tvqCents);
  }
  ctx.page.drawLine({
    start: { x: labelX - 40, y: ctx.y + 10 },
    end: { x: PAGE_W - MARGIN, y: ctx.y + 10 },
    thickness: 1,
    color: GREEN_PRAIRIE,
  });
  ctx.y -= 4;
  totalRow("TOTAL (CAD)", data.totalCents, { bold: true, color: GREEN_FOREST });
  if (data.depositCents > 0) {
    totalRow(data.kind === "estimation" ? "Acompte requis" : "Acompte reçu", -data.depositCents);
    totalRow("Solde à payer", data.balanceCents, { bold: true, color: GREEN_FOREST });
  }

  // ---- Notes ----
  if (data.notes.trim()) {
    ctx.y -= 12;
    if (ctx.y < 130) newPage(ctx);
    drawLeft(ctx, "NOTES", MARGIN, ctx.y, 8.5, bold, GREEN_PRAIRIE);
    ctx.y -= 14;
    for (const line of wrapText(data.notes, font, 9.5, PAGE_W - 2 * MARGIN)) {
      drawLeft(ctx, line, MARGIN, ctx.y, 9.5, font, MUTED);
      ctx.y -= 12.5;
    }
  }

  // ---- Pied de page (sur chaque page) ----
  for (const p of doc.getPages()) {
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 58, color: CREAM });
    p.drawLine({ start: { x: 0, y: 58 }, end: { x: PAGE_W, y: 58 }, thickness: 0.7, color: BORDER });
    const thanks =
      data.kind === "estimation"
        ? "Merci de votre confiance ! Demandez-nous toute modification : on ajuste le programme à votre terrain."
        : data.kind === "contrat"
          ? "Ce contrat couvre le programme d'entretien de la saison. Le paiement de l'acompte confirme votre inscription."
          : "Merci de faire confiance à St-Amour du Vert pour l'entretien de votre pelouse !";
    p.drawText(sanitize(thanks), { x: MARGIN, y: 34, size: 9, font, color: GREEN_FOREST });
    p.drawText(
      sanitize(
        [data.company.name, data.company.address, data.company.phone, data.company.email, data.company.website]
          .filter(Boolean)
          .join(" · "),
      ),
      { x: MARGIN, y: 19, size: 8, font, color: MUTED },
    );
  }

  return doc.save();
}
