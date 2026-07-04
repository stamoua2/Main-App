// Client HTTP minimal pour l'API (cookies de session inclus).

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { erreur?: string }).erreur ?? `Erreur ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

// ---- Types partagés avec l'API ----

export interface Utilisateur {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface Client {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  lotAreaM2: number | null;
  packageId: number | null;
  packageName: string | null;
  status: string;
  notes: string;
}

export interface Forfait {
  id: number;
  slug: string;
  name: string;
  visits: string;
  tagline: string;
  popular: boolean;
  priceCents: number | null;
  items: string[];
}

export interface LigneDocument {
  id?: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents?: number;
}

export interface DocumentFacturation {
  id: number;
  kind: "estimation" | "facture";
  number: string;
  clientId: number;
  clientName?: string;
  status: string;
  issuedOn: string;
  taxesEnabled: boolean;
  tpsRate: number;
  tvqRate: number;
  subtotalCents: number;
  tpsCents: number;
  tvqCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  notes: string;
  convertedFromId: number | null;
  lines?: LigneDocument[];
}

export interface Parametres {
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  taxesEnabled: boolean;
  tpsRate: number;
  tvqRate: number;
  tpsNumber: string;
  tvqNumber: string;
  estimateValidityDays: number;
}
