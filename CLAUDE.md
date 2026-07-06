# Gestionnaire St-Amour du Vert

Application web de gestion pour **St-Amour du Vert**, entreprise familiale
d'entretien de pelouse à L'Ange-Gardien (Outaouais, Québec). Propriétaire :
Alexandre St-Amour (astamour8@gmail.com). Dépôt distinct du site vitrine
`stamourduvert.com`.

- **Interface 100 % en français** (français québécois). Montants en **CAD**.
- **Superficies affichées uniquement en pi²** (la base garde le métrique à
  l'interne — ne pas exposer de m² dans l'UI).
- Déployé sur **Netlify** (projet `mainappsav`, https://mainappsav.netlify.app).

## Préférences de travail (à respecter par défaut)

- **Communication en français** avec le propriétaire. Messages de commit et de
  PR en français. Ne jamais mettre l'identifiant de modèle IA dans un
  commit/PR/fichier poussé.
- **Autonomie** : quand une tâche est terminée ET que `npm run build` +
  `npm run test` sont 100 % verts (et, si l'UI change, une vérification
  navigateur passe), **committer et pousser sur `main` automatiquement**, puis
  résumer ce qui a été fait. Pas besoin de demander la permission de pousser.
- **Discipline « un seul déploiement »** : chaque push sur `main` déclenche un
  build Netlify facturé. Regrouper le travail et **pousser une seule fois par
  bloc**. Tout valider en local avant de pousser.
- **Réduction des crédits** : le propriétaire préfère **démarrer une nouvelle
  session par nouvelle tâche** (le dépôt + ce fichier suffisent au contexte)
  plutôt que rouvrir de vieilles conversations. Écrire les réponses de façon
  concise.
- **Mise à jour de CE fichier (CLAUDE.md)** : c'est un document vivant. **Avant
  toute modification, proposer les changements au propriétaire et attendre sa
  confirmation** avant de committer — pour éviter d'y inscrire une information
  erronée. Mettre à jour le journal ci-dessous au fil des passes (avec accord).

## Comptes de connexion (application)

> ⚠️ Ces mots de passe sont en clair et se retrouvent dans l'historique Git.
> Le propriétaire a choisi de les documenter ici. Garder le dépôt privé et les
> faire tourner au besoin. Mettre à jour cette section si un mot de passe change.

- **alex** (admin) — mot de passe `test123` en production; `StAmourVert2026!`
  au seed local par défaut (`SEED_ALEX_PASSWORD`). Vérifié fonctionnel en prod.
  Connexion possible par nom d'utilisateur `alex` ou courriel
  `alex@stamourduvert.com`. (Mot de passe faible → à changer idéalement.)
- **cindy** — mot de passe `CindyVert2026!` (valeur connue à la création;
  confirmer si modifié depuis).
- La connexion accepte **nom d'utilisateur OU courriel** + mot de passe.

## Coordonnées réelles de l'entreprise (affichées sur les PDF / l'app)

- Courriel : `info@stamourduvert.com`
- Téléphone : `819-598-7891`
- Site web : `www.stamourduvert.com`
- Adresse de base (dépôt, point de départ des routes) : 33, chemin du Graphite,
  L'Ange-Gardien (Québec) J8L 3J6.

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

## Conventions de code

- **Argent en cents (entiers)** partout. Formatage via `formatCad` (format
  « 1 234,56 $ » avec espace insécable U+00A0). Jamais de flottants pour l'argent.
- **Champs de saisie standardisés** : styler via les règles globales de
  `src/styles/app.css` (`input`, `select`, `textarea`), pas de styles inline.
- **Responsive obligatoire** : testé jusqu'à 390 px (mobile) — menu hamburger
  sous 900 px, tableaux dans `.table-scroll`, `form-grid` en 1 colonne. Sur
  portable court, la barre latérale ne doit pas nécessiter de défilement.
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
  prix par superficie + marge dans la page Forfaits. Le « coût par visite » est
  un **coût interne** (essence, déplacement, main-d'œuvre), jamais facturé.
- **Square** (production, `connect.squareup.com`) : estimation → brouillon ;
  contrat/facture → publié. Webhook `invoice.*` (statuts) + `payment.*`
  (revenus en temps réel), signature HMAC vérifiée. Idempotence via
  `square_events`. Tests : `setSquareFetchForTests` (fetch injecté). **Règle
  PRD** : les tests réels Square utilisent des factures au nom personnel d'Alex
  ou de Cindy, JAMAIS de vrais clients.
- **Gemini** (palier gratuit) : texte `gemini-flash-latest`, image
  `gemini-2.5-flash-image`. Quota image limité → message d'erreur clair sur 429.

## Variables d'environnement (Netlify — valeurs JAMAIS dans le dépôt)

`NETLIFY_DB_URL` (BD, exposée par l'extension Neon), `SESSION_SECRET`,
`SEED_ALEX_PASSWORD`, `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
`SQUARE_WEBHOOK_NOTIFICATION_URL`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`.
`/api/health` indique la présence (booléens) de ces variables.

## Infrastructure (identifiants non secrets, utiles aux outils MCP)

- Netlify — projet `mainappsav`, siteId `b5ef1f7c-c8bf-4e55-a515-4bc19199b933`,
  team `6a29feeeededb4f10030e9c7`. Branche de production : `main`.
- Badges de déploiement Netlify (tableau de bord de l'app) :
  gestionnaire `b5ef1f7c-c8bf-4e55-a515-4bc19199b933`,
  site vitrine `c69739ef-f7a7-4886-8997-12d00c4cd883`.
- Square — souscription webhook `wbhk_84ed00d201d14cd48126354e7ec4614f`,
  URL de notification `https://mainappsav.netlify.app/api/webhooks/square`.
- Dépôt GitHub : `stamoua2/Main-App`.

## Journal — réussites (état actuel, tout en production)

- **Passe 1 (fondation)** : auth (username/courriel), CRUD clients, forfaits
  conformes au site vitrine, outil de superficie sur vue satellite Google Maps,
  PDF estimations/factures avec acompte.
- **Passe 2 (intégrations)** : synchronisation Square (factures sortantes +
  paiements par webhook), soumissions du formulaire vitrine → prospect + notif,
  calendrier de visites + optimisation de routes (Google Routes API).
- **Passe 3 (opérations)** : inventaire (catalogue OJ 92 produits importé),
  commandes fournisseurs, finances (revenus/dépenses/marges), marketing,
  tableau de bord KPI.
- **Utilisateurs** : système username + gestion (créer/modifier/supprimer),
  bouton œil pour afficher les mots de passe.
- **Calculateur de prix des forfaits** : superficie → coût produits + visites →
  marge ⇄ prix (les deux synchronisés), produits par forfait ajustables, lien
  à l'inventaire OJ. Saisie et doses en pi²/1000 pi².
- **pi² partout** dans l'UI, badges Netlify au tableau de bord, coordonnées
  réelles de l'entreprise sur les PDF.
- **Contrats** : cycle complet estimation → contrat (CON-) → visites de saison
  générées automatiquement (déplaçables) → factures supplémentaires; Square
  gère estimation (brouillon) / contrat / facture; acompte payé = « signé ».
- **Marketing IA (Gemini)** : génération de texte d'annonce (fonctionne) et
  d'image (selon quota gratuit), campagnes sauvegardées, image téléchargeable.
- **Divers passe 4** : acompte auto 50 % (ajustable + configurable), catégories
  d'inventaire gérables + regroupement, commandes avec TPS/TVQ + livraison
  (45 $ défaut) + modifier/supprimer, synchronisation des paiements Square vers
  les revenus (bouton + webhook temps réel).
- **UI** : champs standardisés partout, responsive mobile complet (menu
  hamburger < 900 px), barre latérale qui tient sans défilement sur portable.
- **Webhook Square LIVE en production** : `invoice.*` (statuts) + `payment.*`
  (revenus temps réel), signature HMAC vérifiée (testé : signature valide → 200,
  invalide/absente → 401).
- **Passe 5 (qualité visuelle + Square/Superficie/connexion)** :
  - Refonte visuelle marquée (identité verte conservée) : barre latérale à
    icônes au trait (`src/icons.tsx`) + dégradé + état actif; cartes stat à
    ruban d'accent; puces de statut colorées et cohérentes partout via
    `src/statut.ts` (`classeStatut`); états vides uniformisés (`.empty-state`);
    connexion repensée; logo « feuille ».
  - **Superficie** : épingle qui « tombe » sur l'adresse repérée +
    **auto-complétion Google Places** (liste sous le champ, jeton de session
    pour limiter la facturation). API « Places » (legacy + New) et « Geocoding »
    **confirmées actives en prod** (testées le 2026-07-06 avec la clé de
    `/api/config` + en-tête Referer) — facturées à l'usage.
  - **Documents** : PDF sans mention « Taxes non applicables… »; **édition**
    d'un document (page `/documents/:id/modifier`, route `PUT`) avec recalcul
    des totaux + **re-synchro Square**; **suppression** retire aussi la facture
    Square; bouton **« Refuser »** (estimations) qui retire la facture Square et
    passe le statut à « refusée ». Helper `cancelSquareInvoice` (delete brouillon
    / cancel publiée).
  - **Connexion** : session limitée à **24 h** (`SESSION_HOURS`, cookie
    `Max-Age=86400`) → reconnexion quotidienne forcée.
- **Tests** : suite à 115 tests, 100 % verte.

## Journal — pièges résolus (ne pas refaire les mêmes erreurs)

- La BD Netlify est exposée sous **`NETLIFY_DB_URL`** (pas `DATABASE_URL`) —
  `db.ts` teste les trois noms. Symptôme initial : `DbNotProvisionedError`.
- Driver Neon : appeler **`sql(text, params)`**, pas `sql.query()`.
- Une variable d'env Netlify marquée **« secret »** n'est PAS visible au runtime
  des fonctions sur ce plan → utiliser des variables **simples**.
- Changer une variable d'env Netlify n'agit qu'**après un nouveau déploiement**
  (vérifier via `/api/health` que le booléen passe à `true`).
- Dans le bac à sable de dev, **l'egress navigateur est bloqué** (Maps/Gemini
  échouent depuis Playwright) — utiliser l'interception de routes / un shim
  Maps ; `curl --cacert /root/.ccr/ca-bundle.crt` fonctionne. Les appels IA
  passent par NOTRE API serveur (qui, elle, a accès au réseau).
- PGlite renvoie les colonnes `DATE` comme objets `Date` → normaliser avec
  `toIsoDate()`.
- Money/format : utiliser l'échappement explicite de l'espace insécable
  (`" "`), jamais le caractère littéral (ambigu dans le code/les tests).
- Square : la TVQ en pourcentage avait un artefact de virgule flottante
  (9.975000000000001) → `ratePct()` avec `toFixed(4)` + trim.
- Barre latérale trop haute sur portable : le bouton « Se déconnecter »
  disparaissait → menu resserré + `min-height:0` pour tenir sans défilement.
- **Barre latérale mobile** : `.sidebar nav { flex: 1 }` fixe `flex-basis: 0` et
  **écrase `width: 100%`** → au menu ouvert, forcer `flex: 0 0 100%` sur
  `.sidebar.menu-open nav`, sinon les entrées débordent à droite.
- **Captures d'écran Playwright dans le bac à sable** : Playwright est installé
  **globalement** (`/opt/node22/lib/node_modules/playwright`, module CommonJS →
  `import pw from "…/playwright/index.js"; const { chromium } = pw`). Binaire
  Chromium réel : `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (le chemin
  `…/chromium/chrome-linux/chrome` n'existe pas). Egress navigateur bloqué →
  injecter un **shim `window.google.maps`** via `addInitScript` (Map/Marker/
  Geocoder/`places.AutocompleteService`) pour illustrer carte + auto-complétion.
- **Serveur dev local** : auto-seed au 1er démarrage; mot de passe d'Alex par
  défaut = `StAmourVert2026!` (`SEED_ALEX_PASSWORD`). Le serveur relit `dist/` à
  chaque requête → un `npm run build` suffit, inutile de le redémarrer.

## Tests

`vitest`, base PGlite en mémoire (`PGLITE_MEMORY=1`), `fileParallelism: false`.
Helpers dans `tests/helpers.ts` (`freshSeededDb`, `api`, `login`, `ALEX`). Les
intégrations externes (Square, Gemini, Maps) utilisent un `fetch` injecté
(`setSquareFetchForTests`, `setGeminiFetchForTests`, `setMapsFetchForTests`).
Garder la suite **100 % verte**.
