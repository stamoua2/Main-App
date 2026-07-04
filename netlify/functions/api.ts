// Fonction Netlify unique : toutes les routes /api/* passent par le routeur.

import { handleApiRequest } from "../../server/router.js";

export default async (req: Request): Promise<Response> => handleApiRequest(req);

export const config = {
  path: "/api/*",
};
