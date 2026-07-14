// Export CSV côté client : génère un fichier téléchargeable (UTF-8 avec BOM
// pour qu'Excel/Numbers en français lisent les accents correctement).

function echapper(valeur: unknown): string {
  const s = valeur === null || valeur === undefined ? "" : String(valeur);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exporterCsv(
  nomFichier: string,
  colonnes: { cle: string; titre: string }[],
  lignes: Record<string, unknown>[],
): void {
  const entete = colonnes.map((c) => echapper(c.titre)).join(";");
  const corps = lignes
    .map((ligne) => colonnes.map((c) => echapper(ligne[c.cle])).join(";"))
    .join("\r\n");
  const contenu = "﻿" + entete + "\r\n" + corps;
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier.endsWith(".csv") ? nomFichier : `${nomFichier}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
