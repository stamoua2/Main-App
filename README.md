# Gestionnaire St-Amour du Vert

Application web de gestion pour **St-Amour du Vert** (entretien de pelouse —
L'Ange-Gardien, Outaouais). Interface 100 % en français, montants en CAD,
taxes TPS/TVQ optionnelles selon la configuration. Voir `PRD.md` pour le
produit complet.

**Passe 1 — Fondation (ce dépôt)** : authentification, clients, forfaits
(conformes à stamourduvert.com), outil de calcul de superficie sur vue
satellite Google Maps, estimations et factures PDF.
**Passes à venir** : Square, soumissions web, calendrier/routes, inventaire,
finances, marketing — le schéma de base de données contient déjà leurs tables.

## Pile technique

| Couche | Choix |
| --- | --- |
| Frontend | Vite + React + TypeScript (SPA, react-router) |
| Backend | Fonction Netlify unique (`netlify/functions/api.ts`) routant `/api/*` |
| Base de données | Netlify DB / Neon PostgreSQL en production; PGlite (PostgreSQL WASM) en local et en tests |
| Auth | bcrypt + JWT (cookie httpOnly `sav_session`) |
| PDF | pdf-lib (estimations et factures en français) |
| Cartes | API Google Maps JS (vue satellite, tracé de périmètre) |
| Tests | Vitest (36 tests : superficie, taxes, auth, clients, documents, forfaits) |

## Démarrage local

```bash
npm install
cp .env.example .env        # remplir GOOGLE_MAPS_API_KEY et SESSION_SECRET
npm run seed                # données de départ (Alex, forfaits, client test)
npm run build
npm run dev                 # http://localhost:8888 (API + frontend compilé)
```

Compte initial : `alex@stamourduvert.com` / valeur de `SEED_ALEX_PASSWORD`
(défaut `StAmourVert2026!` — à changer). Les autres comptes (ex. Cindy) se
créent dans **Paramètres → Utilisateurs**.

Sans `DATABASE_URL`, les données locales vivent dans `.data/pglite/` (non
versionné). Pour le développement du frontend avec rechargement à chaud :
`npx vite` (proxy `/api` vers le port 8888).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run build` | Vérification TypeScript + build Vite |
| `npm test` | Suite de tests complète (Vitest, BD en mémoire) |
| `npm run seed` | Données de départ (idempotent) |
| `npm run dev` | Serveur local (API + fichiers statiques `dist/`) |
| `npx tsx scripts/compare-forfaits.ts` | Preuve de conformité : forfaits en BD vs stamourduvert.com en direct |

## Déploiement sur Netlify

1. Créer un site Netlify **séparé du site vitrine**, relié à ce dépôt
   (build : `npm run build`, publication : `dist` — déjà dans `netlify.toml`).
2. Activer **Netlify DB** (extension Neon) : la variable
   `NETLIFY_DATABASE_URL` est injectée automatiquement.
3. Variables d'environnement à configurer : `GOOGLE_MAPS_API_KEY`,
   `SESSION_SECRET`, `SEED_ALEX_PASSWORD` (plus tard : `SQUARE_APPLICATION_ID`,
   `SQUARE_ACCESS_TOKEN`).
4. Le schéma se crée tout seul au premier appel API (DDL idempotent). Pour les
   données de départ, exécuter localement `DATABASE_URL=<url neon> npm run seed`.

## Structure

```
netlify/functions/api.ts   Fonction Netlify (toutes les routes /api/*)
server/                    Routeur, BD, auth, PDF, schéma, données de départ
shared/                    Code isomorphe : superficie, argent, taxes
src/                       Frontend React (pages en français, jetons de design du site)
scripts/                   dev-server, seed, compare-forfaits
tests/                     Suite Vitest
```

Les jetons de design (`src/styles/tokens/`) proviennent du système de design
extrait du site vitrine stamourduvert.com (couleurs, typographie Bricolage
Grotesque / Hanken Grotesk, espacements).
