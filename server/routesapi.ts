// Google Maps : géocodage d'adresses et optimisation de routes (Routes API,
// computeRoutes avec optimizeWaypointOrder).

let fetchImpl: typeof fetch = (...args) => fetch(...args);

/** Tests : remplace fetch par une implémentation simulée. */
export function setMapsFetchForTests(impl: typeof fetch | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

export class MapsError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new MapsError("GOOGLE_MAPS_API_KEY non configurée.", 503);
  return key;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoPoint & { formatted: string }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ca&key=${apiKey()}`;
  const res = await fetchImpl(url);
  const data = (await res.json()) as {
    status: string;
    results: { geometry: { location: GeoPoint }; formatted_address: string }[];
  };
  if (data.status !== "OK" || !data.results[0]) {
    throw new MapsError(`Géocodage impossible pour « ${address} » (${data.status}).`);
  }
  return { ...data.results[0].geometry.location, formatted: data.results[0].formatted_address };
}

// ---------- Optimisation de route ----------

export interface RouteStop {
  id: number;
  label: string;
  point: GeoPoint;
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult {
  order: number[]; // indices dans la liste d'arrêts fournie
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
}

interface ComputeRoutesResponse {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    optimizedIntermediateWaypointIndex?: number[];
    legs?: { distanceMeters?: number; duration?: string }[];
  }[];
}

function parseDuration(d: string | undefined): number {
  return d ? Number(d.replace(/s$/, "")) : 0;
}

async function computeRoutes(
  origin: GeoPoint,
  destination: GeoPoint,
  intermediates: GeoPoint[],
  optimize: boolean,
): Promise<RouteResult> {
  const res = await fetchImpl("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex,routes.legs.distanceMeters,routes.legs.duration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      intermediates: intermediates.map((p) => ({
        location: { latLng: { latitude: p.lat, longitude: p.lng } },
      })),
      travelMode: "DRIVE",
      ...(optimize ? { optimizeWaypointOrder: true } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as ComputeRoutesResponse & {
    error?: { message?: string };
  };
  if (!res.ok || !data.routes?.[0]) {
    throw new MapsError(`Routes API : ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  const route = data.routes[0];
  return {
    order: route.optimizedIntermediateWaypointIndex ?? intermediates.map((_, i) => i),
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseDuration(route.duration),
    legs: (route.legs ?? []).map((l) => ({
      distanceMeters: l.distanceMeters ?? 0,
      durationSeconds: parseDuration(l.duration),
    })),
  };
}

export interface OptimizedPlan {
  optimized: RouteResult;
  naive: RouteResult;
  improvementMeters: number;
  improvementSeconds: number;
}

/**
 * Compare l'itinéraire naïf (ordre de saisie) et l'itinéraire optimisé
 * (Routes API réordonne les arrêts). Départ et retour au dépôt.
 */
export async function optimizeRoute(depot: GeoPoint, stops: GeoPoint[]): Promise<OptimizedPlan> {
  if (stops.length < 2) throw new MapsError("Au moins 2 arrêts sont requis.", 400);
  const [optimized, naive] = await Promise.all([
    computeRoutes(depot, depot, stops, true),
    computeRoutes(depot, depot, stops, false),
  ]);
  return {
    optimized,
    naive,
    improvementMeters: naive.distanceMeters - optimized.distanceMeters,
    improvementSeconds: naive.durationSeconds - optimized.durationSeconds,
  };
}
