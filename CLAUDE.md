# Gestionnaire St-Amour du Vert

Application web de gestion pour **St-Amour du Vert**, entreprise familiale
d'entretien de pelouse à L'Ange-Gardien (Outaouais, Québec). Propriétaire :
Alexandre St-Amour. Dépôt distinct du site vitrine `stamourduvert.com`.

- **Interface 100 % en français** (français québécois). Montants en **CAD**.
- **Superficies affichées uniquement en pi²** (la base garde le métrique à
  l'interne — ne pas exposer de m² dans l'UI).
- Déployé sur **Netlify** (projet `mainappsav`, https://mainappsav.netlify.app).

## Commandes

```bash
npm run build   # tsc --noEmit && vite build (toujours vérifier avant de pousser)
npm run test    # vitest run (doit être 100 % vert avant tout push)
npm run dev     # serveur local sur http://localhost:8888 (sert dist + API)
npm run seed    # réinsère les données de départ
```

## Architecture

SPA **Vite + React 18 + TypeScript**, servie par une **fonction Netlify unique**
(`netlify/functions/api.ts`, `config = { path: "/api/*" }`) qui délègue tout au
routeur. Aucun framework serveur : un routeur maison à base de `RegExp`.

- `server/router.ts` — **toutes** les routes `/api/*` (~2000 lignes). Point
  d'entrée `handleApiRequest(req)`, réutilisé par la fonction Netlify, le
  serveur de dev et les tests.
- `server/db.ts` — adaptateur BD. Prod : **Neon/PostgreSQL**. Dev + tests :
  **PGlite** (WASM). API : `db.query(text, params)` renvoie `{ rows }`.
- `server/schema.ts` — DDL **idempotente** (tableau de `CREATE TABLE IF NOT
  EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS`), exécutée à chaque
  démarrage à froid. **Toute évolution de schéma se fait ici**, jamais de
  migration séparée.
- `server/seed.ts` + `seed-data.ts` — données de départ (Alex, forfaits du
  site, 9 services, catalogue OJ, clients de démo). `seedPackagePricingDefaults`
  s'exécute à chaque démarrage (idempotent, n'écrase pas les ajustements).
- `server/auth.ts` — bcryptjs + jose (JWT HS256 en cookie httpOnly
  `sav_session`). Connexion par **username OU courriel** (`identifiant`).
- `server/pdf.ts` — génération PDF (pdf-lib, Helvetica). Estimations, contrats,
  factures.
- `server/square.ts` — intégration Square (**compte de PRODUCTION**).
- `server/routesapi.ts` — géocodage + optimisation de routes (Google Routes API).
- `server/gemini.ts` — génération IA marketing (Gemini : texte + images).
- `server/oj-catalog.ts` — catalogue OJ Compagnie 2026 (92 produits transcrits).
- `shared/` — code partagé client/serveur : `money.ts` (format CAD, cents),
  `taxes.ts` (TPS 5 % / TVQ 9,975 %), `area.ts` (superficie polygone + pi²↔m²),
  `pricing.ts` (calcul de prix des forfaits).
- `src/pages/` — une page par section (16 pages). `src/api.ts` — client HTTP +
  types partagés. `src/App.tsx` — coquille + navigation (12 entrées).

## Conventions

- **Argent en cents (entiers)** partout. Formatage via `formatCad` (format
  « 1 234,56 $ » avec espace insécable U+00A0). Jamais de flottants pour l'argent.
- **Champs de saisie standardisés** : styler via les règles globales de
  `src/styles/app.css` (`input`, `select`, `textarea`), pas de styles inline.
- **Responsive obligatoire** : testé jusqu'à 390 px (mobile) — menu hamburger
  sous 900 px, tableaux dans `.table-scroll`, `form-grid` en 1 colonne.
- Icônes : **SVG au trait** (style Lucide), jamais d'émoji dans l'UI.
- Validation des entrées : **zod** côté serveur, messages d'erreur en français.

## Domaine métier

- **Cycle des documents** : estimation → **contrat** (CON-) → facture(s).
  L'estimation acceptée devient un contrat qui **génère les visites de la
  saison** (mai–oct selon le forfait) et est envoyé via Square (facture avec
  acompte ; l'acompte payé = contrat « signé »).
- **Acompte** : automatique (50 % par défaut, `settings.deposit_pct`,
  configurable), ajustable par document.
- **Forfaits** : Essentiel / Régulier / Élite, **identiques au site vitrine**
  (`seed-data.ts`, vérifiés par `scripts/compare-forfaits.ts`). Calculateur de
  prix par superficie + marge dans la page Forfaits.
- **Square** (production, `connect.squareup.com`) : estimation → brouillon ;
  contrat/facture → publié. Webhook `invoice.*` (statuts) + `payment.*`
  (revenus en temps réel), signature HMAC vérifiée. Idempotence via
  `square_events`. Tests : `setSquareFetchForTests` (fetch injecté).
- **Gemini** (palier gratuit) : texte `gemini-flash-latest`, image
  `gemini-2.5-flash-image`. Quota image limité → message d'erreur clair sur 429.

## Variables d'environnement (Netlify — valeurs jamais dans le dépôt)

`NETLIFY_DB_URL` (BD, exposée par l'extension Neon), `SESSION_SECRET`,
`SEED_ALEX_PASSWORD`, `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
`SQUARE_WEBHOOK_NOTIFICATION_URL`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`.
`/api/health` indique la présence (booléens) de ces variables.

## Déploiement & Git

- **Brancher tout le travail sur `main`** (branche par défaut GitHub ET branche
  de production Netlify). Chaque push sur `main` déclenche **un build Netlify**.
- **Discipline « un seul déploiement »** : le propriétaire paie des crédits par
  déploiement. Tout valider en local (build + tests + vérif navigateur) et
  **regrouper le travail en un seul push** par bloc.
- Ne jamais mettre l'identifiant de modèle IA dans un commit/PR/fichier poussé.

## Pièges connus (déjà résolus — ne pas refaire)

- La BD Netlify est exposée sous **`NETLIFY_DB_URL`** (pas `DATABASE_URL`) —
  `db.ts` teste les trois noms.
- Driver Neon : appeler **`sql(text, params)`**, pas `sql.query()`.
- Une variable d'env Netlify marquée **« secret »** n'est PAS visible au runtime
  des fonctions sur ce plan → utiliser des variables **simples**.
- Changer une variable d'env Netlify n'agit qu'**après un nouveau déploiement**.
- Dans le bac à sable de dev, **l'egress navigateur est bloqué** (Maps/Gemini
  échouent depuis Playwright) — utiliser l'interception de routes / le shim
  Maps ; `curl --cacert /root/.ccr/ca-bundle.crt` fonctionne.
- PGlite renvoie les colonnes `DATE` comme objets `Date` → normaliser avec
  `toIsoDate()`.
- Money format : utiliser l'échappement explicite `" "` (espace insécable).

## Tests

`vitest`, base PGlite en mémoire (`PGLITE_MEMORY=1`), `fileParallelism: false`.
Helpers dans `tests/helpers.ts` (`freshSeededDb`, `api`, `login`, `ALEX`). Les
intégrations externes (Square, Gemini, Maps) utilisent un `fetch` injecté.
Garder la suite **100 % verte**.
