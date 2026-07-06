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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__savMapsReady&loading=async&language=fr&region=CA&libraries=places`;
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
  const markerRef = useRef<any>(null); // épingle sur l'adresse recherchée
  const autoServiceRef = useRef<any>(null); // Google Places AutocompleteService
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sections, setSections] = useState<Section[]>([[]]);
  const [erreur, setErreur] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(searchParams.get("client") ?? "");
  const [sauvegarde, setSauvegarde] = useState("");
  const [adresse, setAdresse] = useState("");
  const [messageCarte, setMessageCarte] = useState("");
  const [suggestions, setSuggestions] = useState<
    { placeId: string; principal: string; secondaire: string }[]
  >([]);

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
        if (maps.places?.AutocompleteService) {
          autoServiceRef.current = new maps.places.AutocompleteService();
        }
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

  // Épingle (pointeur) qui indique l'adresse repérée sur la carte.
  function placerEpingle(location: any, titre: string) {
    const maps = window.google?.maps;
    if (!maps || !mapObj.current) return;
    if (!markerRef.current) {
      markerRef.current = new maps.Marker({ map: mapObj.current });
    }
    markerRef.current.setMap(mapObj.current);
    markerRef.current.setPosition(location);
    markerRef.current.setTitle(titre);
    markerRef.current.setAnimation(maps.Animation.DROP);
  }

  // Auto-complétion : interroge Google Places à chaque frappe (débounce léger)
  // et affiche une liste de vraies adresses sous le champ.
  function surSaisieAdresse(valeur: string) {
    setAdresse(valeur);
    const service = autoServiceRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!service || valeur.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const maps = window.google?.maps;
      if (!sessionTokenRef.current && maps?.places?.AutocompleteSessionToken) {
        sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
      }
      service.getPlacePredictions(
        {
          input: valeur,
          componentRestrictions: { country: "ca" },
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (predictions: any[] | null) => {
          setSuggestions(
            (predictions ?? []).slice(0, 6).map((p) => ({
              placeId: p.place_id,
              principal: p.structured_formatting?.main_text ?? p.description,
              secondaire: p.structured_formatting?.secondary_text ?? "",
            })),
          );
        },
      );
    }, 220);
  }

  async function choisirSuggestion(s: { placeId: string; principal: string; secondaire: string }) {
    setAdresse(s.secondaire ? `${s.principal}, ${s.secondaire}` : s.principal);
    setSuggestions([]);
    const maps = window.google?.maps;
    if (!maps || !mapObj.current) return;
    try {
      const geocoder = new maps.Geocoder();
      const { results } = await geocoder.geocode({ placeId: s.placeId });
      if (results?.[0]) {
        const loc = results[0].geometry.location;
        mapObj.current.setCenter(loc);
        mapObj.current.setZoom(20);
        placerEpingle(loc, results[0].formatted_address);
        setMessageCarte(`Carte centrée sur : ${results[0].formatted_address}`);
      }
    } catch {
      setMessageCarte("Adresse introuvable.");
    }
    sessionTokenRef.current = null; // clôt la session de facturation Places
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
      setSuggestions([]);
      mapObj.current.setCenter(results[0].geometry.location);
      mapObj.current.setZoom(20);
      placerEpingle(results[0].geometry.location, results[0].formatted_address);
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
        const loc = { lat: c.latitude, lng: c.longitude };
        mapObj.current.setCenter(loc);
        mapObj.current.setZoom(20);
        placerEpingle(loc, c.fullName);
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
        section.forEach((point, pointIndex) => {
          const marker = new maps.Marker({
            position: point,
            map,
            draggable: true, // déplaçable pour ajuster un sommet imprécis
            cursor: "move",
            title: "Glissez pour déplacer ce point",
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: "#FFFFFF",
              fillOpacity: 1,
              strokeColor: "#174A2D",
              strokeWeight: 2,
            },
          });
          // Fin du glissement : on met à jour la position de ce sommet dans la
          // section active (le polygone et la superficie se recalculent).
          marker.addListener("dragend", (e: any) => {
            const nouveau = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            setSections((prev) => {
              const next = prev.map((s) => s.slice());
              const derniere = next[next.length - 1];
              if (pointIndex < derniere.length) derniere[pointIndex] = nouveau;
              return next;
            });
          });
          overlaysRef.current.push(marker);
        });
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
        périmètre (3 points ou plus). <strong>Glissez un point</strong> pour l'ajuster,
        ou retirez le dernier. Terrain divisé ou de forme complexe? Ajoutez autant de
        sections que nécessaire : le total est la somme des sections.
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <label className="field autocomplete" style={{ flex: "1 1 260px" }}>
            Trouver une adresse
            <input
              value={adresse}
              onChange={(e) => surSaisieAdresse(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSuggestions([]);
                  chercherAdresse();
                } else if (e.key === "Escape") {
                  setSuggestions([]);
                }
              }}
              placeholder="ex. : 1177, route 315, L'Ange-Gardien"
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-autocomplete="list"
            />
            {suggestions.length > 0 && (
              <ul className="autocomplete-list" role="listbox">
                {suggestions.map((s) => (
                  <li
                    key={s.placeId}
                    role="option"
                    aria-selected="false"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choisirSuggestion(s);
                    }}
                  >
                    <span className="pin" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <span>
                      <span className="main-line">{s.principal}</span>
                      {s.secondaire && <span className="sub-line">{s.secondaire}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <button className="btn secondary" onClick={() => { setSuggestions([]); chercherAdresse(); }}>
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
                <span key={i} className="chip plain" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
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
