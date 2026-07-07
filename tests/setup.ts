// Setup global des tests : empêche tout appel réseau réel vers Square.
// Depuis que la création d'un contrat/facture envoie AUTOMATIQUEMENT vers
// Square, les tests qui ne s'intéressent pas à Square déclencheraient sinon un
// vrai appel réseau. Par défaut on installe donc un fetch simulé qui échoue
// proprement : l'envoi auto est alors ignoré (best-effort) et le document reste
// tel quel. Les fichiers qui testent réellement Square (square.test.ts,
// documents-square.test.ts) installent leur propre simulation dans leur
// `beforeAll`.

import { setSquareFetchForTests } from "../server/square.js";

setSquareFetchForTests((async () =>
  new Response(JSON.stringify({ errors: [{ code: "TEST", detail: "Square désactivé (tests)" }] }), {
    status: 503,
    headers: { "content-type": "application/json" },
  })) as typeof fetch);
