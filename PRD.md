# St-Amour du Vert — Gestionnaire d'entreprise PRD

## Une ligne

Application web de gestion complète pour l'entreprise d'entretien de pelouse St-Amour du Vert : clients, estimations/factures synchronisées avec Square, calendrier de visites avec routes optimisées, calcul de superficie via Google Maps, réception des soumissions du site web, inventaire, finances/marges et campagnes marketing — interface entièrement en français, montants en CAD.

## Pile

- **Type** : application web responsive (utilisable au bureau et sur mobile sur le terrain).
- **Framework/langage** : au choix de Claude Code, avec contrainte ferme : **déployable sur Netlify** (fonctions serverless Netlify pour le backend).
- **Base de données** : Netlify DB (PostgreSQL via Neon) ou équivalent compatible Netlify, au choix de Claude Code.
- **Déploiement** : pipeline GitHub → Netlify, dans un **dépôt et un site Netlify complètement séparés** du site vitrine stamourduvert.com.
- **Intégrations** : API Square (production, pas sandbox — tests effectués avec des factures au nom personnel d'Alex ou de Cindy), API Google Maps (géocodage d'adresses, tracé de périmètre pour calcul de superficie, optimisation de routes via Routes API), formulaire de soumission de stamourduvert.com (le formulaire du site vitrine peut être modifié si nécessaire pour l'acheminement vers l'app, sans casser le site).

## Interfaces

**Pages/écrans (interface 100 % en français) :**
- Tableau de bord (vue d'ensemble : soumissions récentes, visites du jour, factures impayées, indicateurs clés)
- Liste des clients + fiche client (coordonnées, adresse, superficie du terrain, forfait choisi, historique, suivis)
- Création et gestion d'estimations et de factures (génération PDF, conversion estimation → facture, acomptes)
- Calendrier et planification des visites
- Carte des routes (itinéraire optimisé des visites d'une journée)
- Outil de calcul de superficie (tracé du périmètre du terrain sur vue satellite Google Maps)
- Inventaire (catalogue OJ Compagnie + produits ajoutés manuellement, suivi des stocks)
- Commandes et stocks
- Finances (coûts, dépenses, marges de profit, rapports)
- Marketing (création et planification de campagnes à l'avance)

**Intégrations :**
- Square : création de factures depuis l'app → visibles dans Square; paiements Square → reflétés dans l'app
- Google Maps : géocodage, calcul de superficie, optimisation de routes
- Site web stamourduvert.com : soumission du formulaire → notification dans l'app + création automatique d'un prospect

**Accès :**
- Authentification obligatoire; 2 utilisateurs au départ (Alex, puis Cindy), avec capacité d'ajouter d'autres utilisateurs.

## Données

**Stocké en base :**
- Clients : nom, adresse, courriel, téléphone, superficie du terrain, forfait choisi (Essentiel / Régulier / Élite), notes, historique de suivis
- Prospects (issus des soumissions web) : nom complet, adresse, courriel, téléphone, courte description du terrain
- Estimations et factures : lignes de services/produits, montants CAD, taxes TPS/TVQ **optionnelles et activables selon la configuration**, acomptes, statuts, lien Square
- Visites planifiées : client, date/heure, services, statut
- Inventaire : catalogue OJ Compagnie complet + produits ajoutés manuellement, quantités en stock, coûts
- Commandes fournisseurs
- Dépenses et coûts d'exploitation
- Campagnes marketing : contenu, canal, date de lancement planifiée, statut
- Forfaits et services : les trois forfaits (Essentiel, Régulier, Élite) et leurs services associés **tels que présentés sur stamourduvert.com**

**Lu de sources externes :**
- Soumissions du formulaire web (nom complet, adresse, courriel, téléphone, description du terrain)
- Square : statuts de paiement, factures
- Google Maps : géocodage, imagerie satellite, calcul de distances/itinéraires

**Produit en sortie :**
- PDF d'estimations et de factures en français, bien formatés (logo, coordonnées, taxes selon config, acomptes)
- Rapports de marges et rapports financiers pertinents
- Migration : aucune — on part de zéro.

## Contraintes

- Interface exclusivement en français; montants en CAD; taxes TPS/TVQ optionnelles selon la configuration de l'entreprise.
- L'app vit dans un dépôt GitHub et un site Netlify **séparés** du site vitrine; le site vitrine peut être modifié uniquement pour l'acheminement du formulaire, sans casser son fonctionnement.
- Intégration Square directement en mode production sur le compte réel : les tests doivent utiliser des factures créées au nom personnel d'Alex ou de Cindy, sans corrompre ni dupliquer les données clients réelles.
- Les forfaits et services doivent correspondre exactement à ceux affichés sur stamourduvert.com.
- Architecture extensible : d'autres modules seront ajoutés en cours de route (le schéma de BD et la structure du code doivent le permettre).

## Critères de réussite

1. **Build sans erreur** : le projet compile et se lance avec zéro erreur. Preuve : exécuter la commande de build complète et montrer la sortie se terminant par un succès (build réussi, code de sortie 0).
2. **Suite de tests complète au vert** : l'ensemble des tests automatisés passe. Preuve : exécuter la suite de tests et afficher le récapitulatif complet où 100 % des tests apparaissent réussis (0 échec, 0 erreur).
3. **Gestion complète des clients** : ajout, modification et suppression d'un client fonctionnent. Preuve : créer un client test avec adresse complète, le modifier, montrer la fiche mise à jour (dump BD ou réponse API), puis le supprimer et prouver qu'il n'apparaît plus dans la liste.
4. **Calcul de superficie** : l'outil permet de tracer le périmètre d'un terrain sur la vue satellite Google Maps et retourne la superficie. Preuve : démontrer que le tracé d'un polygone retourne une superficie en pi² et m², validée par un test unitaire sur un polygone de superficie connue.
5. **Estimations et factures PDF** : génération d'une estimation en français bien formatée (logo, lignes de services, CAD, taxes TPS/TVQ activables/désactivables, acompte), puis conversion en facture. Preuve : générer les deux PDF, les enregistrer et montrer leur contenu démontrant le formatage, les totaux corrects avec et sans taxes, et l'acompte.
6. **Synchronisation Square** : une facture créée dans l'app apparaît dans Square, et un paiement enregistré dans Square se reflète dans l'app. Preuve : créer une facture test au nom personnel d'Alex ou de Cindy, montrer la réponse API Square confirmant sa création (ID Square retourné), puis effectuer un paiement et montrer que le statut passe à « payée » dans l'app (réponse API ou dump BD).
7. **Soumission web → prospect + notification** : une soumission du formulaire de stamourduvert.com crée un prospect et déclenche une notification dans l'app. Preuve : envoyer une requête (curl ou soumission réelle) avec nom, adresse, courriel, téléphone et description du terrain, puis montrer le prospect créé en base et la notification visible dans l'app.
8. **Calendrier et routes optimisées** : planifier au moins 3 visites le même jour affiche un itinéraire optimisé sur la carte. Preuve : créer 3+ visites à des adresses différentes de la région, montrer la réponse de l'API d'optimisation (ordre des arrêts + distance/durée totale) et démontrer que l'ordre optimisé diffère d'un ordre naïf ou est validé comme minimal.
9. **Inventaire** : le catalogue OJ Compagnie est chargé, un produit hors catalogue peut être ajouté manuellement, et une déduction de stock fonctionne. Preuve : montrer le compte de produits OJ en base, ajouter un produit manuel via l'interface/API, effectuer une sortie de stock et montrer la quantité décrémentée (dump BD avant/après).
10. **Finances et marges** : la saisie de coûts produit un rapport de marges correct. Preuve : entrer des revenus et des coûts tests aux montants connus, générer le rapport de marges et démontrer par la sortie que le calcul (revenus − coûts, % de marge) correspond au résultat attendu calculé manuellement.
11. **Marketing planifié** : une campagne peut être créée avec une date de lancement future. Preuve : créer une campagne test datée dans le futur, montrer son enregistrement en base avec statut « planifiée » et son affichage dans la vue marketing.
12. **Authentification multi-utilisateurs** : l'app exige une connexion et permet d'ajouter d'autres utilisateurs. Preuve : démontrer qu'une requête non authentifiée vers une page/API protégée est rejetée (redirection ou 401), se connecter avec le compte d'Alex, créer un compte pour Cindy, et prouver que ce nouveau compte peut se connecter.
13. **Forfaits conformes au site** : les trois forfaits (Essentiel, Régulier, Élite) et leurs services associés correspondent exactement à ceux de stamourduvert.com. Preuve : afficher côte à côte le contenu des forfaits en base et le contenu de la page forfaits du site, et confirmer la correspondance service par service.

**Données de départ requises** : le catalogue de produits OJ Compagnie importé en base, les trois forfaits Essentiel/Régulier/Élite préconfigurés avec leurs services tels qu'affichés sur stamourduvert.com, le compte utilisateur d'Alex créé, les clés API Square et Google Maps configurées dans les variables d'environnement, et au moins un client test avec adresse réelle de la région pour les vérifications 3 à 8.

## Plan d'exécution en 3 passes

- **Passe 1 — Fondation** : app, BD, auth, clients, forfaits, superficie, estimations/factures PDF (critères 1, 2, 3, 4, 5, 12, 13).
- **Passe 2 — Intégrations** : Square, formulaire web, calendrier/routes (critères 6, 7, 8 + re-vérifier 1 et 2).
- **Passe 3 — Opérations** : inventaire, commandes, finances, marketing (critères 9, 10, 11 + re-vérifier 1 et 2).
