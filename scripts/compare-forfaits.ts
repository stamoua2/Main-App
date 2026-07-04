// Preuve de conformité des forfaits (critère 13 du PRD) :
// télécharge la page d'accueil de stamourduvert.com, en extrait le bloc JS
// des forfaits (français), puis compare service par service avec le contenu
// de la base de données. Usage : tsx scripts/compare-forfaits.ts

import { getDb } from "../server/db.js";
import { loadDotEnv } from "./load-env.js";

loadDotEnv();

interface SitePackage {
  name: string;
  visits: string;
  tagline: string;
  items: string[];
  popular: boolean;
}

const res = await fetch("https://stamourduvert.com/", { redirect: "follow" });
if (!res.ok) throw new Error(`Échec du téléchargement du site : ${res.status}`);
const html = await res.text();

// Premier bloc `packages: [...]` = version française.
const match = html.match(/packages: (\[[\s\S]*?\n      \])/);
if (!match) throw new Error("Bloc des forfaits introuvable dans la page du site.");
const sitePackages = new Function(`return ${match[1]}`)() as SitePackage[];

const db = await getDb();
const { rows: dbPackages } = await db.query<{
  id: number; name: string; visits: string; tagline: string; popular: boolean;
}>("SELECT id, name, visits, tagline, popular FROM packages WHERE active ORDER BY position");
const { rows: dbItems } = await db.query<{ package_id: number; label: string }>(
  "SELECT package_id, label FROM package_items ORDER BY package_id, position",
);

let allOk = true;
console.log("=== Correspondance forfaits : stamourduvert.com (en direct) vs base de données ===\n");

for (let i = 0; i < Math.max(sitePackages.length, dbPackages.length); i++) {
  const site = sitePackages[i];
  const dbp = dbPackages[i];
  if (!site || !dbp) {
    allOk = false;
    console.log(`✗ Forfait manquant d'un côté : site=${site?.name ?? "—"} bd=${dbp?.name ?? "—"}`);
    continue;
  }
  const items = dbItems.filter((it) => it.package_id === dbp.id).map((it) => it.label);
  const headerOk =
    site.name === dbp.name &&
    site.visits === dbp.visits &&
    site.tagline === dbp.tagline &&
    site.popular === dbp.popular;
  console.log(`Forfait « ${site.name} »  (${site.visits}${site.popular ? " · le plus populaire" : ""})`);
  console.log(`  En-tête : ${headerOk ? "OK — identique" : "DIFFÉRENT"}`);
  if (!headerOk) {
    allOk = false;
    console.log(`    site : ${JSON.stringify({ name: site.name, visits: site.visits, tagline: site.tagline, popular: site.popular })}`);
    console.log(`    bd   : ${JSON.stringify({ name: dbp.name, visits: dbp.visits, tagline: dbp.tagline, popular: dbp.popular })}`);
  }
  const n = Math.max(site.items.length, items.length);
  for (let j = 0; j < n; j++) {
    const s = site.items[j];
    const d = items[j];
    const ok = s === d;
    if (!ok) allOk = false;
    console.log(`  ${ok ? "=" : "✗"} site : ${s ?? "—"}`);
    console.log(`  ${ok ? "=" : "✗"} bd   : ${d ?? "—"}`);
  }
  console.log("");
}

console.log(allOk
  ? "RÉSULTAT : correspondance exacte, service par service, pour les trois forfaits."
  : "RÉSULTAT : DIVERGENCES détectées — voir ci-dessus.");
process.exit(allOk ? 0 : 1);
