import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Client } from "../api";
import { m2ToFt2, polygonAreaM2, type LatLng } from "../../shared/area";

// API Google Maps chargée dynamiquement (clé servie par /api/config aux
// utilisateurs authentifiés). Types volontairement souples : pas de
// dépendance à @types/google.maps.
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    google?: any;
    __savMapsReady?: () => void;
  }
}

let mapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      window.__savMapsReady = () => resolve(window.google.maps);
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__savMapsReady&loading=async&language=fr&region=CA`;
      script.async = true;
      script.onerror = () => reject(new Error("Impossible de charger Google Maps."));
      document.head.appendChild(script);
    });
  }
  return mapsPromise;
}

// Centre par défaut : L'Ange-Gardien (Outaouais)
const CENTRE_DEFAUT = { lat: 45.5586, lng: -75.4735 };

export default function Superficie() {
  const [searchParams] = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const polygonObj = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [sommets, setSommets] = useState<LatLng[]>([]);
  const [erreur, setErreur] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(searchParams.get("client") ?? "");
  const [sauvegarde, setSauvegarde] = useState("");

  const aireM2 = polygonAreaM2(sommets);
  const airePi2 = m2ToFt2(aireM2);

  useEffect(() => {
    api.get<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients));
    let annule = false;
    (async () => {
      try {
        const { googleMapsApiKey } = await api.get<{ googleMapsApiKey: string }>("/api/config");
        if (!googleMapsApiKey) {
          setErreur("Aucune clé Google Maps configurée (variable GOOGLE_MAPS_API_KEY).");
          return;
        }
        const maps = await loadGoogleMaps(googleMapsApiKey);
        if (annule || !mapRef.current) return;
        const map = new maps.Map(mapRef.current, {
          center: CENTRE_DEFAUT,
          zoom: 18,
          mapTypeId: "satellite",
          tilt: 0,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapObj.current = map;
        map.addListener("click", (e: any) => {
          const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setSommets((prev) => [...prev, point]);
        });
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Erreur de chargement de la carte.");
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Redessine le polygone et les sommets à chaque changement.
  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapObj.current;
    if (!maps || !map) return;
    if (polygonObj.current) polygonObj.current.setMap(null);
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    if (sommets.length === 0) return;
    polygonObj.current = new maps.Polygon({
      paths: sommets,
      map,
      strokeColor: "#8BE3A6",
      strokeWeight: 2.5,
      fillColor: "#2E8255",
      fillOpacity: 0.28,
    });
    for (const point of sommets) {
      markersRef.current.push(
        new maps.Marker({
          position: point,
          map,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#FFFFFF",
            fillOpacity: 1,
            strokeColor: "#174A2D",
            strokeWeight: 2,
          },
        }),
      );
    }
  }, [sommets]);

  async function assignerAuClient() {
    if (!clientId || aireM2 <= 0) return;
    setSauvegarde("");
    await api.put(`/api/clients/${clientId}`, { lotAreaM2: Math.round(aireM2 * 100) / 100 });
    const client = clients.find((c) => c.id === Number(clientId));
    setSauvegarde(
      `Superficie de ${Math.round(airePi2).toLocaleString("fr-CA")} pi² enregistrée pour ${client?.fullName ?? "le client"}.`,
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Outil de mesure</div>
          <h1>Calcul de superficie</h1>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: -10 }}>
        Cliquez sur la vue satellite pour tracer le périmètre du terrain (3 points ou
        plus). La superficie se met à jour à chaque point ajouté.
      </p>

      {erreur ? (
        <div className="panel error-text">{erreur}</div>
      ) : (
        <div ref={mapRef} className="map-canvas" />
      )}

      <div className="area-readout">
        <div className="measure">
          <div className="label">Superficie (pi²)</div>
          <div className="value">
            {aireM2 > 0 ? Math.round(airePi2).toLocaleString("fr-CA") : "—"}
          </div>
        </div>
        <div className="measure">
          <div className="label">Points tracés</div>
          <div className="value">{sommets.length}</div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <button
            className="btn secondary"
            onClick={() => setSommets((s) => s.slice(0, -1))}
            disabled={sommets.length === 0}
          >
            Retirer le dernier point
          </button>
          <button className="btn secondary" onClick={() => setSommets([])} disabled={sommets.length === 0}>
            Effacer le tracé
          </button>
          <label className="field" style={{ minWidth: 240 }}>
            Assigner la superficie à un client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} — {c.addressLine}, {c.city}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={assignerAuClient} disabled={!clientId || aireM2 <= 0}>
            Enregistrer la superficie
          </button>
        </div>
        {sauvegarde && <div className="ok-text">{sauvegarde}</div>}
      </div>
    </>
  );
}
