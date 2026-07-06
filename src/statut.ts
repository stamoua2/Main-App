// Classe CSS de puce selon le statut d'un document/visite/commande, pour une
// lecture visuelle cohérente partout (vert = positif, ambre = en attente,
// bleu = envoyé, rouge = refusé/annulé). Voir `.chip.*` dans app.css.

export function classeStatut(statut: string): string {
  const s = statut.toLowerCase();
  if (["payée", "payé", "reçue", "acceptée", "signé", "complétée", "terminée"].includes(s)) {
    return "chip ok";
  }
  if (["envoyée", "envoyé", "planifiee", "planifiée", "en cours"].includes(s)) {
    return "chip info";
  }
  if (["refusée", "refusé", "annulée", "annulé", "expirée"].includes(s)) {
    return "chip danger";
  }
  if (["à payer", "brouillon", "partiellement payée", "en attente", "nouveau", "prospect"].includes(s)) {
    return "chip warn";
  }
  return "chip";
}
