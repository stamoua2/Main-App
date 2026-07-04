// Authentification : mots de passe hachés (bcrypt) + session JWT signée
// (HS256) transportée dans un cookie httpOnly.

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "./db.js";

const COOKIE_NAME = "sav_session";
const SESSION_DAYS = 14;

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

function secretKey(): Uint8Array {
  const secret =
    process.env.SESSION_SECRET ||
    "dev-secret-st-amour-du-vert-a-changer-en-production";
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function createSessionCookie(user: SessionUser): Promise<string> {
  const jwt = await new SignJWT({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  const secure = process.env.NETLIFY || process.env.NODE_ENV === "production";
  return [
    `${COOKIE_NAME}=${jwt}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 3600}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** Retourne l'utilisateur de session, ou null si non authentifié. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      id: Number(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: String(payload.role ?? "admin"),
    };
  } catch {
    return null;
  }
}

export async function authenticate(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: number;
    email: string;
    name: string;
    role: string;
    password_hash: string;
  }>("SELECT id, email, name, role, password_hash FROM users WHERE lower(email) = lower($1)", [
    email,
  ]);
  const user = rows[0];
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
