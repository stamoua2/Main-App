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

// Départ : Gatineau (vue d'ensemble; cherchez une adresse ou zoomez ensuite).
const CENTRE_DEFAUT = { lat: 45.4765, lng: -75.7013 };
const ZOOM_DEFAUT = 12;

// Un terrain peut compter plusieurs sections (terrain divisé, formes
// irrégulières) : chaque section est un polygone; le total est la somme.
type Section = LatLng[];

export default function Superficie() {
  const [searchParams] = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [sections, setSections] = useState<Section[]>([[]]);
  const [erreur, setErreur] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(searchParams.get("client") ?? "");
  const [sauvegarde, setSauvegarde] = useState("");
  const [adresse, setAdresse] = useState("");
  const [messageCarte, setMessageCarte] = useState("");

  const aires = sections.map((s) => (s.length >= 3 ? polygonAreaM2(s) : 0));
  const totalM2 = aires.reduce((a, b) => a + b, 0);
  const totalPi2 = m2ToFt2(totalM2);
  const active = sections[sections.length - 1];

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
          zoom: ZOOM_DEFAUT,
          mapTypeId: "satellite",
          tilt: 0,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapObj.current = map;
        map.addListener("click", (e: any) => {
          const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setSommetsActifs((prev) => [...prev, point]);
        });
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Erreur de chargement de la carte.");
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  function setSommetsActifs(update: (prev: Section) => Section) {
    setSections((prev) => {
      const next = prev.slice();
      next[next.length - 1] = update(next[next.length - 1]);
      return next;
    });
  }

  // Recherche d'adresse : centre la carte prête à tracer (zoom 19).
  async function chercherAdresse() {
    const maps = window.google?.maps;
    if (!maps || !mapObj.current || !adresse.trim()) return;
    setMessageCarte("");
    try {
      const geocoder = new maps.Geocoder();
      const { results } = await geocoder.geocode({
        address: adresse,
        region: "CA",
      });
      if (!results?.length) {
        setMessageCarte("Adresse introuvable — précisez la ville (ex. : Gatineau).");
        return;
      }
      mapObj.current.setCenter(results[0].geometry.location);
      mapObj.current.setZoom(19);
      setMessageCarte(`Carte centrée sur : ${results[0].formatted_address}`);
    } catch {
      setMessageCarte("Adresse introuvable — précisez la ville (ex. : Gatineau).");
    }
  }

  function choisirClient(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === Number(id));
    if (c && mapObj.current) {
      if (c.latitude && c.longitude) {
        mapObj.current.setCenter({ lat: c.latitude, lng: c.longitude });
        mapObj.current.setZoom(19);
        setMessageCarte(`Carte centrée sur le terrain de ${c.fullName}.`);
      } else if (c.addressLine) {
        setAdresse(`${c.addressLine}, ${c.city}`);
        setMessageCarte("Adresse du client copiée — cliquez « Trouver » pour centrer la carte.");
      }
    }
  }

  // Redessine toutes les sections (l'active en vert clair, avec ses sommets).
  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapObj.current;
    if (!maps || !map) return;
    for (const o of overlaysRef.current) o.setMap(null);
    overlaysRef.current = [];
    sections.forEach((section, index) => {
      if (section.length === 0) return;
      const estActive = index === sections.length - 1;
      overlaysRef.current.push(
        new maps.Polygon({
          paths: section,
          map,
          strokeColor: estActive ? "#8BE3A6" : "#CFE8D8",
          strokeWeight: estActive ? 2.5 : 2,
          fillColor: "#2E8255",
          fillOpacity: estActive ? 0.28 : 0.18,
        }),
      );
      if (estActive) {
        for (const point of section) {
          overlaysRef.current.push(
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
      }
    });
  }, [sections]);

  async function assignerAuClient() {
    if (!clientId || totalM2 <= 0) return;
    setSauvegarde("");
    await api.put(`/api/clients/${clientId}`, { lotAreaM2: Math.round(totalM2 * 100) / 100 });
    const client = clients.find((c) => c.id === Number(clientId));
    setSauvegarde(
      `Superficie totale de ${Math.round(totalPi2).toLocaleString("fr-CA")} pi² enregistrée pour ${client?.fullName ?? "le client"}.`,
    );
  }

  const sectionsMesurees = sections.filter((s) => s.length >= 3);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Outil de mesure</div>
          <h1>Calcul de superficie</h1>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: -10 }}>
        Cherchez l'adresse du terrain, puis cliquez sur la vue satellite pour tracer le
        périmètre (3 points ou plus). Terrain divisé ou de forme complexe? Ajoutez
        autant de sections que nécessaire : le total est la somme des sections.
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <label className="field" style={{ flex: "1 1 260px" }}>
            Trouver une adresse
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && chercherAdresse()}
              placeholder="ex. : 1177, route 315, L'Ange-Gardien"
            />
          </label>
          <button className="btn secondary" onClick={chercherAdresse}>
            Trouver
          </button>
          <label className="field" style={{ flex: "1 1 240px" }}>
            Ou centrer sur un client
            <select value={clientId} onChange={(e) => choisirClient(e.target.value)}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} — {c.addressLine}, {c.city}
                </option>
              ))}
            </select>
          </label>
        </div>
        {messageCarte && <div className="ok-text">{messageCarte}</div>}
      </div>

      {erreur ? (
        <div className="panel error-text">{erreur}</div>
      ) : (
        <div ref={mapRef} className="map-canvas" />
      )}

      <div className="area-readout">
        <div className="measure">
          <div className="label">Superficie totale (pi²)</div>
          <div className="value">
            {totalM2 > 0 ? Math.round(totalPi2).toLocaleString("fr-CA") : "—"}
          </div>
        </div>
        <div className="measure">
          <div className="label">Sections mesurées</div>
          <div className="value">{sectionsMesurees.length}</div>
        </div>
        <div className="measure">
          <div className="label">Points (section en cours)</div>
          <div className="value">{active.length}</div>
        </div>
      </div>

      {sectionsMesurees.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Sections</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {sections.map((s, i) =>
              s.length >= 3 ? (
                <span key={i} className="chip" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  Section {i + 1} : {Math.round(m2ToFt2(aires[i])).toLocaleString("fr-CA")} pi²
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={`Retirer la section ${i + 1}`}
                    onClick={() =>
                      setSections((prev) => {
                        const next = prev.filter((_, j) => j !== i);
                        return next.length ? next : [[]];
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="toolbar">
          <button
            className="btn secondary"
            onClick={() => setSections((prev) => (prev[prev.length - 1].length ? [...prev, []] : prev))}
            disabled={active.length < 3}
          >
            + Nouvelle section
          </button>
          <button
            className="btn secondary"
            onClick={() => setSommetsActifs((s) => s.slice(0, -1))}
            disabled={active.length === 0}
          >
            Retirer le dernier point
          </button>
          <button
            className="btn secondary"
            onClick={() => setSections([[]])}
            disabled={totalM2 <= 0 && active.length === 0}
          >
            Tout effacer
          </button>
          <button className="btn" onClick={assignerAuClient} disabled={!clientId || totalM2 <= 0}>
            Enregistrer la superficie totale
          </button>
        </div>
        {sauvegarde && <div className="ok-text">{sauvegarde}</div>}
      </div>
    </>
  );
}
