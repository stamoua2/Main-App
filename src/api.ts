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
  username: string;
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
  visitCount: number;
  visitCostCents: number;
  marginPct: number;
  items: string[];
}

export interface ProduitForfait {
  id?: number;
  itemId: number | null;
  itemName?: string | null;
  itemFormat?: string | null;
  label: string;
  dosePer100m2: number;
  doseUnit: string;
  formatQuantity: number;
  applications: number;
  unitCostCents: number | null;
  formatCostCents: number;
}

export interface CotationForfait {
  id: number;
  slug: string;
  name: string;
  visits: string;
  popular: boolean;
  visitCount: number;
  visitCostCents: number;
  marginPct: number;
  couts: { produitsCents: number; visitesCents: number; totalCents: number };
  prixCents: number;
  prixParVisiteCents: number;
  produits: {
    label: string;
    applications: number;
    dosePer100m2: number;
    doseUnit: string;
    quantiteTotale: number;
    formats: number;
    coutCents: number;
  }[];
}

export interface Cotation {
  superficie: { m2: number; ft2: number };
  forfaits: CotationForfait[];
}

export interface ProduitInventaire {
  id: number;
  sku: string;
  name: string;
  source: string;
  category: string;
  format: string;
  unit: string;
  quantity: number;
  costCents: number;
  notes: string;
  active: boolean;
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
  squareInvoiceId: string | null;
  squarePaymentStatus: string | null;
  squarePublicUrl: string | null;
  lines?: LigneDocument[];
}

export interface Prospect {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  sector: string;
  message: string;
  status: string;
  clientId: number | null;
  createdAt: string;
}

export interface NotificationApp {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

export interface Visite {
  id: number;
  clientId: number;
  clientName?: string;
  addressLine?: string;
  city?: string;
  scheduledAt: string;
  durationMinutes: number;
  services: string;
  status: string;
  routePosition: number | null;
  notes: string;
}

export interface ArretRoute {
  arret: number;
  visiteId: number;
  client: string;
  adresse: string;
}

export interface PlanRoute {
  date: string;
  depot: { adresse: string; lat: number; lng: number };
  optimise: {
    ordre: ArretRoute[];
    distanceMetres: number;
    dureeSecondes: number;
    segments: { distanceMeters: number; durationSeconds: number }[];
  };
  naif: { ordre: ArretRoute[]; distanceMetres: number; dureeSecondes: number };
  gainMetres: number;
  gainSecondes: number;
}

export interface Parametres {
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  taxesEnabled: boolean;
  tpsRate: number;
  tvqRate: number;
  tpsNumber: string;
  tvqNumber: string;
  estimateValidityDays: number;
}
