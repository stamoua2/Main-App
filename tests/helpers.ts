// Aides de test : base PGlite en mémoire fraîche + données de départ,
// et petit client HTTP qui appelle le routeur directement (objets Request).

import { getDb, resetDbForTests } from "../server/db.js";
import { seedAll } from "../server/seed.js";
import { handleApiRequest } from "../server/router.js";

export const ALEX = { email: "alex@stamourduvert.com", password: "MotDePasseAlex123!" };

export async function freshSeededDb(): Promise<void> {
  resetDbForTests();
  const db = await getDb();
  await seedAll(db, { alexPassword: ALEX.password });
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: any;
  raw: Response;
}

export async function api(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string } = {},
): Promise<ApiResponse> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const raw = await handleApiRequest(req);
  const contentType = raw.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await raw.json() : null;
  return { status: raw.status, headers: raw.headers, body, raw };
}

/** Connexion et retour du cookie de session. */
export async function login(email: string, password: string): Promise<string> {
  const res = await api("POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Échec de connexion (${res.status})`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Aucun cookie de session reçu");
  return setCookie.split(";")[0];
}
