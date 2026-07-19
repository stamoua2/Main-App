# Brief de design — Gestionnaire St-Amour du Vert (refonte visuelle complète)

> À coller dans l'outil de design Claude. Objectif : concevoir **l'application
> de gestion au complet, comme un système cohérent** (design system + tous les
> écrans), pas page par page. Ce sont des **références visuelles** : Claude Code
> les reconstruira ensuite dans le vrai code (React + Vite + TypeScript) et les
> branchera aux vraies données. Ne pas se soucier de la logique serveur.

## 1. Contexte

Outil interne de gestion pour **St-Amour du Vert**, entreprise familiale
d'entretien de pelouse à L'Ange-Gardien (Outaouais, Québec). Utilisateur unique
type : le propriétaire (Alexandre), souvent **sur mobile, sur le terrain**.

- **Interface 100 % en français** (français québécois).
- Montants en **CAD**, format « 1 234,56 $ » (espace insécable, virgule décimale).
- **Superficies uniquement en pi²** dans l'UI (jamais de m²).
- Ton : professionnel, chaleureux, « entreprise de quartier en santé ».

## 2. Système visuel (identité — à conserver)

**Couleurs (source de vérité) :**
- Vert forêt `#174A2D` (primaire : barre latérale, titres, boutons principaux)
- Vert prairie `#2E8255` (survol, accents, liens, eyebrows)
- Vert foncé `#0F3A22` (pieds de page, fonds sombres)
- Terracotta `#B5582E` (**accent unique et rare** : « populaire », rabais, alertes)
- Vert pâle `#EAF1E6` / `#F2F6EE` (bandes, pastilles), crème `#FAF8F3` (fond de page)
- Encres `#23271F` / `#3A4336` / `#4A5247` / gris chaud `#7A7E72`
- Bordures crème `#E7E3D8` / `#ECE6D9`

**Typographie :** titres et chiffres clés en **Bricolage Grotesque** (600/700) ;
corps en **Hanken Grotesk** (400–700). (Google Fonts.)

**Formes :** rayons 999px (pastilles), 16px (cartes), 12–14px (boutons),
eyebrows MAJUSCULES 10,5px, interlettrage ~.12em. **Icônes au trait (style
Lucide), jamais d'émoji.** Chiffres en `tabular-nums`.

## 3. Contraintes UI (non négociables)

- **Responsive obligatoire jusqu'à 390 px.** Barre latérale à gauche en desktop ;
  **menu hamburger sous 900 px**. La barre latérale doit tenir **sans défilement**
  sur portable court (le bouton « Se déconnecter » toujours visible).
- **Champs de formulaire standardisés** (mêmes styles input/select/textarea partout).
- Tableaux larges dans un conteneur à défilement horizontal ; `form-grid` passe
  en 1 colonne sur mobile.
- **Puces de statut** colorées et cohérentes (brouillon, envoyé, accepté, payé,
  refusé, en retard…). **États vides** uniformes (icône + message + action).
- **Cartes de statistique** à ruban d'accent (chiffre en Bricolage, gros).

## 4. Coquille de l'application (à designer en premier)

- **Barre latérale** : logo « feuille » en haut, dégradé vert, 14 entrées avec
  **icône au trait + libellé**, état actif marqué. Pied : utilisateur + « Se
  déconnecter ». **Badge de notifications** (cloche) accessible.
- **Barre supérieure mobile** : logo + hamburger.
- **En-tête de page** réutilisable : lien « ← Retour » (pages de détail),
  eyebrow, titre (Bricolage), et zone de **boutons d'action** à droite.
- **Boutons** : principal (fond forêt), secondaire (contour), danger (rouge/terracotta),
  petit. États survol/désactivé.

## 5. Les 14 sections à concevoir (+ états clés)

1. **Connexion** — carte centrée sur fond crème, logo, champs nom d'utilisateur +
   mot de passe (avec œil), bouton « Se connecter ».
2. **Tableau de bord** — rangée de cartes KPI (revenus, marge, clients actifs,
   documents en attente, visites à venir), + raccourcis et prochaines visites.
3. **Clients** — liste/tableau (recherche, tri, étiquettes), bouton « + Client » ;
   **Fiche client** (détail) : coordonnées, superficie (pi²), étiquettes,
   historique d'activité, relances, documents liés.
4. **Tâches** — rappels/relances CRM avec échéances, priorités, « fait ».
5. **Forfaits** — 3 forfaits (Essentiel/Régulier/Élite) + **calculateur de prix**
   (superficie → coût produits + visites → marge ⇄ prix), produits par forfait.
6. **Superficie** — outil de mesure sur **vue satellite** (carte), champ d'adresse
   avec auto-complétion, épingle, lecture de superficie en **pi²**.
7. **Calendrier & routes** — calendrier des visites (déplaçables) +
   **optimisation d'itinéraire** (liste ordonnée, gain de distance).
8. **Soumissions web** — prospects reçus du site vitrine (liste → convertir en client).
9. **Pipeline** — étapes de vente (colonnes type kanban) avec cartes de dossier.
10. **Estimations & factures** — liste des documents (statuts) ; **formulaire de
    création/édition** (client, type, lignes, taxes, acompte, **options de modèle**) ;
    **fiche document** avec le **parcours** Estimation → Contrat → Facture → Payé
    et les boutons d'action.
11. **Inventaire** — catalogue de produits (catégories, stock éditable en ligne,
    +/−, filtre « en stock »).
12. **Commandes** — commandes fournisseurs (lignes, livraison, TPS/TVQ, statut).
13. **Finances** — revenus / dépenses / marges (cartes + tableaux + graphiques simples).
14. **Marketing** — génération IA d'annonces (texte + image), campagnes sauvegardées.
15. **Paramètres** — coordonnées entreprise, taxes, acompte %, **gestion des
    utilisateurs** (créer/modifier/supprimer).

*(Les 3 documents client — Soumission / Contrat / Facture — ont déjà un design
validé ; inutile de les refaire, sauf si tu veux les harmoniser.)*

## 6. À produire

- Un **design system** (couleurs, typo, composants : boutons, champs, cartes,
  pastilles de statut, états vides, en-têtes) + **tous les écrans** ci-dessus,
  en **desktop ET mobile (390 px)**.
- Rester **fidèle à l'identité verte** ci-dessus (c'est une refonte, pas un
  changement de marque).

## 7. Quand tu es satisfait

Exporte le **handoff** (comme pour les modèles de documents) et envoie-le-moi
ici — un **.zip**, les fichiers, ou un **lien de partage**, peu importe le
format. Écris simplement : « **Voici la nouvelle version, mets-la en ligne.** »
Je reconstruirai les écrans dans ton vrai code, je les brancherai aux données,
et **à chaque écran je te montrerai une capture/aperçu** avant de déployer —
tu ne travailleras plus jamais à l'aveugle.
