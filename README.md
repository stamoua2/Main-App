# Gestionnaire St-Amour du Vert

Application web de gestion pour **St-Amour du Vert** (entretien de pelouse —
L'Ange-Gardien, Outaouais). Interface 100 % en français, montants en CAD,
taxes TPS/TVQ optionnelles selon la configuration. Voir `PRD.md` pour le
produit complet.

**Passe 1 — Fondation** : authentification, clients, forfaits (conformes à
stamourduvert.com), outil de calcul de superficie sur vue satellite Google
Maps, estimations et factures PDF.
**Passe 2 — Intégrations** : synchronisation Square (factures sortantes +
paiements entrants par webhook), réception des soumissions du formulaire de
stamourduvert.com (prospect + notification), calendrier de visites avec
optimisation de routes (Google Routes API).
**Passe 3 — Opérations** : inventaire (catalogue OJ Compagnie 2026 importé +
produits manuels + suivi des stocks), commandes fournisseurs (réception →
stock incrémenté), finances (dépenses, revenus, rapport de marges) et
marketing (campagnes planifiées à l'avance). Tableau de bord complété
(soumissions récentes, visites du jour, factures impayées, marge du mois).

Le catalogue OJ Compagnie vit dans `server/oj-catalog.ts` (transcrit de la
liste de prix 2026 fournie en PDF). Il est importé au seed et ré-importable
sans doublon via `POST /api/inventory/import-oj` (mise à jour des prix).

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

## Intégration Square (production)

- **Sortant** : sur une facture (`Estimations & factures` → détail), le bouton
  « Envoyer vers Square » crée le client, la commande (taxes TPS/TVQ en
  pourcentage si activées), la facture (acompte → demande de paiement DEPOSIT)
  puis la publie en mode `SHARE_MANUALLY` (Square n'envoie aucun courriel;
  l'app affiche l'URL de paiement à partager).
- **Entrant** : `POST /api/webhooks/square` reçoit les événements `invoice.*`
  (signature HMAC-SHA256 vérifiée, idempotence par `event_id`). Un paiement
  fait passer la facture à « payée » et crée une notification. Le bouton
  « Synchroniser le paiement Square » interroge aussi l'API à la demande.
- **Configuration du webhook** : Square Developer Dashboard → Webhooks →
  Subscriptions → URL `https://mainappsav.netlify.app/api/webhooks/square`,
  événements `invoice.payment_made`, `invoice.updated`, `invoice.canceled`.
  Copier la « Signature key » dans la variable `SQUARE_WEBHOOK_SIGNATURE_KEY`
  et mettre la même URL dans `SQUARE_WEBHOOK_NOTIFICATION_URL`.
- **Règle des tests (PRD)** : toute facture de test est créée au nom personnel
  d'Alex ou de Cindy, jamais au nom d'un vrai client.

## Formulaire du site vitrine → soumissions

L'endpoint public `POST /api/public/soumission` (CORS ouvert, pot de miel
`website`) accepte `{ fullName, email, phone, address, sector, message }` et
crée un prospect + une notification. Dans le site vitrine, ajouter au
gestionnaire de soumission du formulaire (sans casser l'envoi existant) :

```js
fetch("https://mainappsav.netlify.app/api/public/soumission", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fullName: nom, email, phone: telephone,
    address: adresse, sector: secteur, message,
  }),
}).catch(() => {}); // ne bloque jamais le formulaire du site
```

## Calendrier & routes

- Visites planifiées par client et par journée (`/calendrier`).
- « Optimiser la route » géocode les adresses manquantes (persisté sur la
  fiche client), appelle la Routes API (`computeRoutes`,
  `optimizeWaypointOrder`) depuis le dépôt de l'entreprise (33, chemin du
  Graphite, L'Ange-Gardien), compare l'ordre optimisé à l'ordre de saisie
  (distance/durée) et enregistre `route_position` sur chaque visite.
