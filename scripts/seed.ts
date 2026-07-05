// Insertion des données de départ : npm run seed

import { getDb } from "../server/db.js";
import { seedAll } from "../server/seed.js";
import { loadDotEnv } from "./load-env.js";

loadDotEnv();

const db = await getDb();
await seedAll(db);

const users = await db.query<{ email: string; name: string }>("SELECT email, name FROM users ORDER BY id");
const packages = await db.query<{ name: string; visits: string; n: string }>(
  `SELECT p.name, p.visits, count(i.id) AS n FROM packages p
   LEFT JOIN package_items i ON i.package_id = p.id
   GROUP BY p.id, p.name, p.visits ORDER BY p.position`,
);
const clients = await db.query<{ n: string }>("SELECT count(*) AS n FROM clients");
const services = await db.query<{ n: string }>("SELECT count(*) AS n FROM services");
const oj = await db.query<{ n: string }>("SELECT count(*) AS n FROM inventory_items WHERE source = 'oj'");

console.log("Données de départ insérées :");
console.log("  Utilisateurs :", users.rows.map((u) => `${u.name} <${u.email}>`).join(", "));
for (const p of packages.rows) {
  console.log(`  Forfait ${p.name} — ${p.visits} — ${p.n} services associés`);
}
console.log(`  Services au catalogue : ${services.rows[0].n}`);
console.log(`  Produits OJ Compagnie : ${oj.rows[0].n}`);
console.log(`  Clients : ${clients.rows[0].n}`);
process.exit(0);
