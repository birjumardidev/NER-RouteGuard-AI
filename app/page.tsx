"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Box,
  CarFront,
  Check,
  ChevronDown,
  CircleDot,
  Crosshair,
  Droplets,
  Gauge,
  Hospital,
  Layers,
  Maximize2,
  Minimize2,
  MapPin,
  Menu,
  Navigation,
  Phone,
  Plus,
  Route,
  ShieldCheck,
  Truck,
  UserRound,
  Minus,
  Wind,
  X,
} from "lucide-react";
import "./globals.css";
import "leaflet/dist/leaflet.css";

type Step = "setup" | "analysis" | "live";
type Place = { name: string; coordinates: [number, number] };
type Trip = {
  origin: Place;
  destination: Place;
  cargo: string;
  vehicle: string;
};
type SearchPlace = { name: string; lat: string; lon: string };
type RouteData = {
  id: string;
  label: string;
  disrupted?: boolean;
  distance: number;
  duration: number;
  coordinates: [number, number][];
  steps: { instruction: string; road: string; distance: number }[];
};
type RouteWeather = {
  source: string;
  available: boolean;
  description: string;
  temperature: number | null;
  humidity: number | null;
  rainfall: number | null;
};

const routeColors = [
  "#f1af26", // first route is now orange/yellow
  "#3489dd", // second route is now blue
  "#c65cf2",
  "#57c7d4",
  "#ff7b54",
  "#8ac926",
];

function getRouteColor(
  index: number,
  route: RouteData,
  recommendedRouteId?: string,
) {
  const isRecommended = route.id === recommendedRouteId;
  if (isRecommended) return "#0bba61";
  if (route.disrupted) return "#e94238";
  return routeColors[index % routeColors.length];
}

function getRouteRisk(route: RouteData, weather?: RouteWeather) {
  if (route.disrupted) return { label: "HIGH RISK", tone: "red" };
  if (weather?.rainfall != null && weather.rainfall > 15) {
    return { label: "WEATHER RISK", tone: "amber" };
  }
  if (!weather?.available) return { label: "RISK UNKNOWN", tone: "muted" };
  return { label: "LOW RISK", tone: "green" };
}

function getWeatherSummary(weather?: RouteWeather) {
  if (!weather?.available) return "IMD report unavailable";
  const details = [
    weather.temperature != null ? `${Math.round(weather.temperature)}°C` : "",
    weather.humidity != null ? `${Math.round(weather.humidity)}% humidity` : "",
  ].filter(Boolean);
  return [weather.description, ...details].join(" · ");
}

const hazards = [
  {
    icon: AlertTriangle,
    label: "Landslide prone zone",
    distance: "18 km",
    level: "Medium",
    tone: "amber",
  },
  {
    icon: Wind,
    label: "Heavy rainfall area",
    distance: "28 km",
    level: "High",
    tone: "red",
  },
  {
    icon: Route,
    label: "Narrow bridge",
    distance: "42 km",
    level: "Low",
    tone: "blue",
  },
];

const guwahati: [number, number] = [91.7362, 26.1445];
const imphal: [number, number] = [93.9368, 24.817];
const defaultOrigin: Place = { name: "", coordinates: guwahati };
const defaultDestination: Place = {
  name: "",
  coordinates: imphal,
};
// const routeCoordinates: [number, number][] = [
//   guwahati,
//   [92.05, 25.98],
//   [92.42, 25.72],
//   [92.82, 25.42],
//   [93.2, 25.13],
//   imphal,
// ];
// const blockedRouteCoordinates: [number, number][] = [
//   guwahati,
//   [91.95, 26.02],
//   [92.02, 25.62],
//   [92.18, 25.18],
//   [92.28, 24.72],
//   [92.58, 24.45],
//   imphal,
// ];

function calculateBearing(start: [number, number], end: [number, number]): number {
  const lat1 = (start[0] * Math.PI) / 180;
  const lon1 = (start[1] * Math.PI) / 180;
  const lat2 = (end[0] * Math.PI) / 180;
  const lon2 = (end[1] * Math.PI) / 180;

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function OpenStreetMap({
  live,
  origin,
  destination,
  routes,
  recommendedRouteId,
}: {
  live: boolean;
  origin: Place;
  destination: Place;
  routes?: RouteData[];
  recommendedRouteId?: string;
}) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeKey = [
    live,
    origin.coordinates.join(","),
    destination.coordinates.join(","),
    recommendedRouteId || "",
    routes
      ?.map((route) => `${route.id}:${route.disrupted ? "disrupted" : "clear"}`)
      .join(",") || "",
  ].join("|");

  useEffect(() => {
    if (!mapNode.current) return;

    let map: LeafletMap;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    import("leaflet").then(async (leaflet) => {
      if (cancelled || !mapNode.current) return;
      if (live) await import("leaflet-rotate");
      const L = leaflet.default;
      map = L.map(mapNode.current, {
        zoomControl: false,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        ...(live
          ? {
              rotate: true,
              touchRotate: true,
              touchGestures: true,
              rotateControl: { closeOnZeroBearing: true },
            }
          : {}),
      } as Parameters<typeof L.map>[1]).setView([25.5, 92.8], 6.5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // attribution:
        //   '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const routingData = routes
        ? { routes }
        : await fetch(
            `/api/routing?origin=${origin.coordinates.join(",")}&destination=${destination.coordinates.join(",")}`,
          )
            .then((response) => response.json())
            .catch(() => ({ routes: [] }));
      if (cancelled) return;
      const mapRoutes = (routingData.routes || []) as RouteData[];
      const routeOptions = {
        renderer: L.canvas(),
        updateWhenZooming: false,
        interactive: false,
      };
      const routeLines = mapRoutes.map((route, index) => {
        const coordinates = route.coordinates.map(
          ([longitude, latitude]) => [latitude, longitude] as [number, number],
        );
        return L.polyline(coordinates, {
          color: getRouteColor(index, route, recommendedRouteId),
          weight: route.id === recommendedRouteId ? 5 : 4,
          opacity: route.id === recommendedRouteId ? 1 : 0.75,
          ...routeOptions,
        }).addTo(map);
      });
      if (live) {
        map.setView([origin.coordinates[1], origin.coordinates[0]], 10, {
          animate: false,
        });
        map.panBy([0, 150], { animate: false });
      } else {
        const comparisonBounds = routeLines[0]?.getBounds() || map.getBounds();
        routeLines
          .slice(1)
          .forEach((line) => comparisonBounds.extend(line.getBounds()));
        map.fitBounds(comparisonBounds, { padding: [70, 70], animate: false });
      }

      const startIcon = L.divIcon({
        className: "osm-start-marker",
        html: "<span></span>",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const endIcon = L.divIcon({
        className: "osm-end-marker",
        html: "<span></span>",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      if (!live) {
        L.marker([origin.coordinates[1], origin.coordinates[0]], {
          icon: startIcon,
          zIndexOffset: 400,
          rotateWithView: false,
        })
          .addTo(map)
          .bindTooltip(`START · ${origin.name}`, { permanent: false });
      }
      L.marker([destination.coordinates[1], destination.coordinates[0]], {
        icon: endIcon,
        zIndexOffset: 400,
        rotateWithView: false,
      })
        .addTo(map)
        .bindTooltip(live ? destination.name : `END · ${destination.name}`, {
          permanent: false,
        });
      if (live) {
        const activeRoute = mapRoutes.find((r) => r.id === recommendedRouteId) || mapRoutes[0];
        const coords = activeRoute?.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]) || [];
        
        const vehicle = L.divIcon({
          className: "osm-vehicle-marker",
          html: "&#9650;",
          iconSize: [52, 52],
          iconAnchor: [26, 26],
        });
        
        const startPos = coords[0] || [origin.coordinates[1], origin.coordinates[0]];
        const vehicleMarker = L.marker(startPos, {
          icon: vehicle,
          zIndexOffset: 1000,
          rotateWithView: false,
        }).addTo(map);
        
        vehicleMarker.bindTooltip("NER-MED-102", { permanent: false });
        
        if (coords.length > 1) {
          const initialBearing = calculateBearing(coords[0], coords[1]);
          if (typeof (map as any).setBearing === "function") {
            (map as any).setBearing(initialBearing);
          }
          
          let step = 0;
          const totalSteps = coords.length;
          const intervalTime = 300; // ms per step for a smooth navigation feel
          
          const timer = setInterval(() => {
            if (cancelled) {
              clearInterval(timer);
              return;
            }
            
            if (step < totalSteps) {
              const currentPos = coords[step];
              vehicleMarker.setLatLng(currentPos);
              
              // Keep map centered on the vehicle and slightly shifted to look ahead
              map.setView(currentPos, 14, { animate: false });
              map.panBy([0, 100], { animate: false });
              
              if (step < totalSteps - 1) {
                const nextPos = coords[step + 1];
                const bearing = calculateBearing(currentPos, nextPos);
                if (typeof (map as any).setBearing === "function") {
                  (map as any).setBearing(bearing);
                }
              }
              
              step++;
            } else {
              // Loop route animation
              step = 0;
            }
          }, intervalTime);
        }
      }
      mapRef.current = map;
      resizeObserver = new ResizeObserver(() =>
        map.invalidateSize({ animate: false }),
      );
      resizeObserver.observe(mapNode.current);
      map.on("zoomend rotate", () => map.invalidateSize({ animate: false }));
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [routeKey]);

  return (
    <div
      ref={mapNode}
      className="map-canvas openstreetmap-map"
      aria-label="Live street map"
    />
  );
}

function MapCanvas({
  live = false,
  origin,
  destination,
  routes,
  recommendedRouteId,
}: {
  live?: boolean;
  origin: Place;
  destination: Place;
  routes?: RouteData[];
  recommendedRouteId?: string;
}) {
  return (
    <OpenStreetMap
      live={live}
      origin={origin}
      destination={destination}
      routes={routes}
      recommendedRouteId={recommendedRouteId}
    />
  );

  // return (
  //   <div className={`map-canvas ${live ? "map-live" : ""}`}>
  //     <div className="map-grid" />
  //     <div className="region assam">ASSAM</div>
  //     <div className="region nagaland">NAGALAND</div>
  //     <div className="region manipur">MANIPUR</div>
  //     <div className="region mizoram">MIZORAM</div>
  //     <svg
  //       className="routes"
  //       viewBox="0 0 600 800"
  //       preserveAspectRatio="none"
  //       aria-hidden="true"
  //     >
  //       <path
  //         className="route-alt"
  //         d="M130 92 C177 168, 158 270, 222 337 S188 490, 270 650"
  //       />
  //       <path
  //         className="route-main-glow"
  //         d="M130 92 C199 148, 285 184, 327 280 S275 440, 382 548 S405 646, 470 702"
  //       />
  //       <path
  //         className="route-main"
  //         d="M130 92 C199 148, 285 184, 327 280 S275 440, 382 548 S405 646, 470 702"
  //       />
  //       <path
  //         className="route-danger"
  //         d="M130 92 C177 168, 158 270, 222 337 S188 490, 270 650"
  //       />
  //     </svg>
  //     <div className="map-pin start">
  //       <MapPin size={25} fill="currentColor" />
  //     </div>
  //     <div className="map-pin end">
  //       <MapPin size={25} fill="currentColor" />
  //     </div>
  //     <div className="place-tag start-tag">Guwahati</div>
  //     <div className="place-tag end-tag">Imphal</div>
  //     <div className="road-tag nh27">NH-27</div>
  //     <div className="road-tag nh37">NH-37</div>
  //     <div className="hazard-pin">
  //       <AlertTriangle size={15} />
  //     </div>
  //     {!live && (
  //       <div className="map-callout route-callout">
  //         <strong>Route B</strong>
  //         <span>215 km · 6h 05m</span>
  //         <em>LOW RISK</em>
  //       </div>
  //     )}
  //     {!live && (
  //       <div className="map-callout risk-callout">
  //         <strong>High landslide risk</strong>
  //         <span>Road ahead may be blocked</span>
  //         <em>Avoid Route A</em>
  //       </div>
  //     )}
  //     {live && (
  //       <div className="vehicle-marker">
  //         <Navigation size={18} fill="white" />
  //       </div>
  //     )}
  //     <div className="map-scale">20 km</div>
  //     <div className="map-controls">
  //       <button aria-label="Zoom in">
  //         <Plus size={20} />
  //       </button>
  //       <button aria-label="Zoom out">
  //         <Minus size={20} />
  //       </button>
  //       <button aria-label="Recenter">
  //         <Crosshair size={18} />
  //       </button>
  //       <button aria-label="Layers">
  //         <Layers size={18} />
  //       </button>
  //     </div>
  //   </div>
  // );
}

function Header() {
  return (
    <header className="topbar">
      <div className="brand-mark">
        <Truck size={24} />
      </div>
      <div className="brand">
        <strong>NER SmartRoute AI</strong>
        <span>Driver Navigation</span>
      </div>
      <div className="network">
        <span className="signal">⌁</span>
        <span>
          GPS <b>Strong</b>
        </span>
      </div>
      <button className="icon-button notification" aria-label="Notifications">
        <Bell size={22} />
        <i>3</i>
      </button>
      <button className="icon-button" aria-label="Menu">
        <Menu size={23} />
      </button>
    </header>
  );
}

function WorkflowBar({
  step,
  setStep,
}: {
  step: Step;
  setStep: (step: Step) => void;
}) {
  const steps: { id: Step; number: string; label: string }[] = [
    { id: "setup", number: "01", label: "Plan trip" },
    { id: "analysis", number: "02", label: "Analyze route" },
    { id: "live", number: "03", label: "Navigate" },
  ];
  const currentIndex = steps.findIndex(({ id }) => id === step);

  return (
    <nav className="workflow-bar" aria-label="Route workflow">
      {steps.map(({ id, number, label }, index) => {
        const complete = index < currentIndex;
        const active = id === step;
        return (
          <div className="workflow-group" key={id}>
            <button
              className={`workflow-step ${active ? "active" : ""} ${complete ? "complete" : ""}`}
              onClick={() => (complete || active ? setStep(id) : undefined)}
              disabled={!complete && !active}
              aria-current={active ? "step" : undefined}
            >
              <span className="workflow-number">
                {complete ? <Check size={13} /> : number}
              </span>
              <span>{label}</span>
            </button>
            {index < steps.length - 1 && (
              <i
                className={`workflow-connector ${index < currentIndex ? "complete" : ""}`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Setup({
  trip,
  onAnalyze,
}: {
  trip: Trip;
  onAnalyze: (trip: Trip) => void;
}) {
  const [cargo, setCargo] = useState(trip.cargo);
  const [vehicle, setVehicle] = useState(trip.vehicle);
  const [origin, setOrigin] = useState(trip.origin);
  const [destination, setDestination] = useState(trip.destination);
  const [originQuery, setOriginQuery] = useState(trip.origin.name);
  const [destinationQuery, setDestinationQuery] = useState(
    trip.destination.name,
  );
  const [activeSearch, setActiveSearch] = useState<
    "origin" | "destination" | null
  >(null);
  const [suggestions, setSuggestions] = useState<SearchPlace[]>([]);
  const activeQuery =
    activeSearch === "origin" ? originQuery : destinationQuery;

  useEffect(() => {
    if (!activeSearch || activeQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(activeQuery)}`,
      );
      if (response.ok) setSuggestions(await response.json());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeSearch, activeQuery]);

  const searchPlace = async (query: string, type: "origin" | "destination") => {
    if (!query.trim()) return;
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const places = await response.json();
    const place = places[0];
    if (!place) return;
    const nextPlace = {
      name: place.name,
      coordinates: [Number(place.lon), Number(place.lat)] as [number, number],
    };
    if (type === "origin") {
      setOrigin(nextPlace);
      setOriginQuery(nextPlace.name);
    } else {
      setDestination(nextPlace);
      setDestinationQuery(nextPlace.name);
    }
  };

  const chooseSuggestion = (
    place: SearchPlace,
    type: "origin" | "destination",
  ) => {
    const nextPlace = {
      name: place.name,
      coordinates: [Number(place.lon), Number(place.lat)] as [number, number],
    };
    if (type === "origin") {
      setOrigin(nextPlace);
      setOriginQuery(nextPlace.name);
    } else {
      setDestination(nextPlace);
      setDestinationQuery(nextPlace.name);
    }
    setSuggestions([]);
    setActiveSearch(null);
  };

  return (
    <main className="setup-page">
      <div className="setup-copy">
        <div className="eyebrow">
          <ShieldCheck size={15} /> ROUTE INTELLIGENCE
        </div>
        <h1>
          Move critical cargo
          <br />
          <span>with more certainty.</span>
        </h1>
        <p>
          Tell us about your trip. NER SmartRoute checks weather, terrain and
          road conditions to find the safer way through.
        </p>
      </div>
      <section className="setup-panel">
        <div className="panel-heading">
          <div>
            <span className="step-label">STEP 01 / TRIP DETAILS</span>
            <h2>Plan your route</h2>
          </div>
          <div className="secure">
            <ShieldCheck size={14} /> DATA SECURE
          </div>
        </div>
        <div className="route-inputs">
          <label className="location-field">
            <span>FROM</span>
            <div className="input-box">
              <CircleDot size={17} className="green-icon" />
              <input
                value={originQuery}
                onChange={(e) => setOriginQuery(e.target.value)}
                onFocus={() => setActiveSearch("origin")}
                onKeyDown={(e) =>
                  e.key === "Enter" && searchPlace(originQuery, "origin")
                }
                onBlur={() => searchPlace(originQuery, "origin")}
                aria-label="Search origin"
              />
              <button
                className="search-location"
                type="button"
                onClick={() => searchPlace(originQuery, "origin")}
              >
                <MapPin size={14} />
              </button>
            </div>
            {activeSearch === "origin" && suggestions.length > 0 && (
              <div className="location-suggestions">
                {suggestions.map((place) => (
                  <button
                    type="button"
                    key={`${place.lat}-${place.lon}`}
                    onPointerDown={() => chooseSuggestion(place, "origin")}
                  >
                    <MapPin size={14} />
                    <span>{place.name}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          <div className="route-arrow">
            <ArrowRight size={18} />
          </div>
          <label className="location-field">
            <span>TO</span>
            <div className="input-box">
              <MapPin size={18} className="red-icon" />
              <input
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
                onFocus={() => setActiveSearch("destination")}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  searchPlace(destinationQuery, "destination")
                }
                onBlur={() => searchPlace(destinationQuery, "destination")}
                aria-label="Search destination"
              />
              <button
                className="search-location"
                type="button"
                onClick={() => searchPlace(destinationQuery, "destination")}
              >
                <MapPin size={14} />
              </button>
            </div>
            {activeSearch === "destination" && suggestions.length > 0 && (
              <div className="location-suggestions">
                {suggestions.map((place) => (
                  <button
                    type="button"
                    key={`${place.lat}-${place.lon}`}
                    onPointerDown={() => chooseSuggestion(place, "destination")}
                  >
                    <MapPin size={14} />
                    <span>{place.name}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>CARGO TYPE</span>
            <div className="input-box">
              <Hospital size={17} />
              <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
                <option>Medicine</option>
                <option>Fresh food</option>
                <option>Electronics</option>
                <option>Relief supplies</option>
              </select>
              <ChevronDown size={16} />
            </div>
          </label>
          <label>
            <span>VEHICLE TYPE</span>
            <div className="input-box">
              <Truck size={17} />
              <select
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              >
                <option>Medium truck</option>
                <option>Heavy truck</option>
                <option>Van</option>
              </select>
              <ChevronDown size={16} />
            </div>
          </label>
        </div>
        <button
          className="primary-action"
          onClick={() => onAnalyze({ origin, destination, cargo, vehicle })}
        >
          ANALYZE ROUTE <ArrowRight size={18} />
        </button>
        <div className="data-note">
          <Gauge size={16} /> Analyzing 12 live risk signals across the
          Northeast
        </div>
      </section>
      <div className="setup-footer">
        <span>
          Powered by <b>OpenStreetMap</b>
        </span>
        <span>
          <span className="dot-live" /> Live hazard data
        </span>
        <span>v2.4.0</span>
      </div>
    </main>
  );
}

function Analysis({ trip, onLive }: { trip: Trip; onLive: (routes: RouteData[], selectedRouteId: string) => void }) {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [routeWeather, setRouteWeather] = useState<
    Record<string, RouteWeather>
  >({});
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [recommendation, setRecommendation] = useState({
    provider: "",
    reason: "Comparing available routes...",
  });

  useEffect(() => {
    let cancelled = false;
    const loadRoutes = async () => {
      const response = await fetch(
        `/api/routing?origin=${trip.origin.coordinates.join(",")}&destination=${trip.destination.coordinates.join(",")}`,
      );
      const data = await response.json();
      const availableRoutes = Array.isArray(data.routes) ? data.routes : [];
      if (cancelled) return;
      setRoutes(availableRoutes);
      const weatherEntries = await Promise.all(
        availableRoutes.map(async (route: RouteData) => {
          const midpoint =
            route.coordinates[Math.floor(route.coordinates.length / 2)] ||
            trip.origin.coordinates;
          const weatherResponse = await fetch(
            `/api/weather?lat=${midpoint[1]}&lon=${midpoint[0]}`,
          );
          return [
            route.id,
            (await weatherResponse.json()) as RouteWeather,
          ] as const;
        }),
      );
      if (cancelled) return;
      setRouteWeather(Object.fromEntries(weatherEntries));
      const aiResponse = await fetch("/api/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routes: availableRoutes,
          cargo: trip.cargo,
          vehicle: trip.vehicle,
        }),
      });
      const ai = await aiResponse.json();
      if (cancelled) return;
      setSelectedRouteId(ai.recommendedRouteId || availableRoutes[0]?.id || "");
      setRecommendation({
        provider: ai.provider || "",
        reason: ai.reason || "",
      });
    };
    loadRoutes().catch(() =>
      setRecommendation({
        provider: "",
        reason: "Route data is temporarily unavailable.",
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [trip]);

  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) || routes[0];
  const formatDistance = (meters: number) => `${Math.round(meters / 1000)} km`;
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  };

  return (
    <main className="analysis-page">
      <div className="analysis-title">
        <div>
          <div className="eyebrow">
            <Check size={15} /> ANALYSIS COMPLETE
          </div>
          <h1>Safer route found.</h1>
          <p>
            We compared safer routes for your {trip.cargo.toLowerCase()}{" "}
            delivery.
          </p>
        </div>
        <div className="score-badge">
          <strong>86</strong>
          <span>SAFETY SCORE</span>
        </div>
      </div>
      <div className="analysis-grid">
        <section className="map-panel">
          <div className="map-heading">
            <span>ROUTE COMPARISON</span>
            <div>
              {routes.map((route, index) => (
                <span className="legend" key={route.id}>
                  <i
                    className="legend-route"
                    style={{
                      backgroundColor: getRouteColor(
                        index,
                        route,
                        selectedRouteId,
                      ),
                    }}
                  />
                  {route.label}
                  {route.id === selectedRouteId ? " · Recommended" : ""}
                </span>
              ))}
            </div>
          </div>
          <MapCanvas
            origin={trip.origin}
            destination={trip.destination}
            routes={routes}
            recommendedRouteId={selectedRouteId}
          />
          {/* <div className="map-route-key" aria-label="Map route key">
            <div className="map-key-title">ROUTE KEY</div>
            <div className="map-key-item">
              <i className="map-key-line recommended-line" />{" "}
              <span>
                <b>Route B</b> Recommended
              </span>
            </div>
            <div className="map-key-item">
              <i className="map-key-line blocked-line" />{" "}
              <span>
                <b>Route A</b> Blocked by disruption
              </span>
            </div>
            <div className="map-key-endpoints">
              <span>
                <i className="key-dot start-dot" /> Start · {trip.origin.name}
              </span>
              <span>
                <i className="key-dot end-dot" /> End · {trip.destination.name}
              </span>
            </div>
          </div> */}
        </section>
        <section className="decision-panel">
          <div className="recommended-head">
            <div>
              <span className="step-label">GROQ AI RECOMMENDATION</span>
              {recommendation.provider ? (
                <h2>
                  {selectedRoute?.label || "Comparing routes"}{" "}
                  <span>· best overall</span>
                </h2>
              ) : (
                <h2>Analyzing routes...</h2>
              )}
            </div>
            {recommendation.provider ? (
              <ShieldCheck size={29} />
            ) : (
              <div className="ai-loader-pulse" />
            )}
          </div>
          
          {!recommendation.provider ? (
            <div className="ai-loading-container">
              <div className="ai-loading-bar">
                <div className="ai-loading-progress" />
              </div>
              <p className="ai-reason loading-text">{recommendation.reason}</p>
              <div className="skeleton-lines">
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
              </div>
            </div>
          ) : (
            <p className="ai-reason">{recommendation.reason}</p>
          )}
          <div className="route-options">
            <h3>Available routes · OSRM + IMD reports</h3>
            {routes.map((route, index) => (
              <button
                type="button"
                className={`route-option ${route.id === selectedRouteId ? "selected" : ""}`}
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
              >
                <span>
                  <b className="route-option-name">
                    <i
                      className="route-color-swatch"
                      style={{
                        backgroundColor: getRouteColor(
                          index,
                          route,
                          selectedRouteId,
                        ),
                      }}
                    />
                    {route.label}
                  </b>
                  <small>
                    {route.id === selectedRouteId
                      ? "Recommended"
                      : "Available route"}
                  </small>
                </span>
                <span className="route-option-metrics">
                  <strong>{formatDistance(route.distance)}</strong>
                  <small>ETA {formatDuration(route.duration)}</small>
                </span>
                <span className="route-option-report">
                  <small className="route-weather">
                    <Droplets size={12} />{" "}
                    {routeWeather[route.id]
                      ? getWeatherSummary(routeWeather[route.id])
                      : "Loading IMD report..."}
                  </small>
                  <small
                    className={`route-risk ${getRouteRisk(route, routeWeather[route.id]).tone}`}
                  >
                    <AlertTriangle size={12} />{" "}
                    {getRouteRisk(route, routeWeather[route.id]).label}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button className="primary-action" onClick={() => onLive(routes, selectedRouteId)}>
            START NAVIGATION <Navigation size={17} />
          </button>
          {/* <button className="secondary-action" onClick={onLive}>
            <Navigation size={17} /> VIEW NAVIGATION
          </button> */}
        </section>
      </div>
    </main>
  );
}

function Live({ trip, routes, selectedRouteId, onBack }: { trip: Trip; routes: RouteData[]; selectedRouteId: string; onBack: () => void }) {
  const [showEmergency, setShowEmergency] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <main className={`live-page ${isFullscreen ? "live-fullscreen" : ""}`}>
      <div className="live-map-wrap">
        <MapCanvas live origin={trip.origin} destination={trip.destination} routes={routes} recommendedRouteId={selectedRouteId} />
        <div className="live-top">
          <div>
            <span className="live-pill">
              <i /> LIVE NAVIGATION
            </span>
            <h1>
              {trip.origin.name} <ArrowRight size={14} />{" "}
              {trip.destination.name}
            </h1>
          </div>
          <div className="eta-live">
            <span>ARRIVAL IN</span>
            <strong>5h 42m</strong>
            <small>6:30 PM · 215 km</small>
          </div>
        </div>
        <button
          className="map-fullscreen-button"
          onClick={() => setIsFullscreen((current) => !current)}
          aria-label={
            isFullscreen ? "Exit full screen map" : "Open full screen map"
          }
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          <span>{isFullscreen ? "EXIT MAP" : "FULL SCREEN"}</span>
        </button>

        <div className="live-bottom">
          <div className="trip-chip">
            <Truck size={18} />
            <span>NER-MED-102</span>
            <b>52 km/h</b>
          </div>
          <div className="bottom-actions">
            <button
              aria-label="Call emergency"
              onClick={() => setShowEmergency(true)}
            >
              <Phone size={19} />
            </button>
            <button
              aria-label="Open route details"
              onClick={() => setShowDetails(true)}
            >
              <Route size={19} />
            </button>
          </div>
        </div>
        {(showEmergency || showDetails) && (
          <div
            className="live-modal-backdrop"
            onClick={() => {
              setShowEmergency(false);
              setShowDetails(false);
            }}
          >
            <section
              className="live-modal"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="modal-close"
                onClick={() => {
                  setShowEmergency(false);
                  setShowDetails(false);
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
              {showEmergency ? (
                <>
                  <div className="modal-icon emergency">
                    <Phone size={22} />
                  </div>
                  <span className="step-label">EMERGENCY SUPPORT</span>
                  <h2>Need immediate help?</h2>
                  <p>
                    Connect with the NER logistics control room for route
                    assistance.
                  </p>
                  <button className="primary-action">
                    <Phone size={17} /> CALL CONTROL ROOM
                  </button>
                </>
              ) : (
                <>
                  <div className="modal-icon">
                    <Route size={22} />
                  </div>
                  <span className="step-label">ROUTE DETAILS</span>
                  <h2>Route B · safer path</h2>
                  <p>215 km · 5h 42m remaining · Low disruption risk</p>
                  <div className="modal-detail">
                    <span>Next hazard</span>
                    <strong>Heavy rainfall area · 28 km</strong>
                  </div>
                  <div className="modal-detail">
                    <span>Arrival estimate</span>
                    <strong>6:30 PM</strong>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>("setup");
  const [trip, setTrip] = useState<Trip>({
    origin: defaultOrigin,
    destination: defaultDestination,
    cargo: "Medicine",
    vehicle: "Medium truck",
  });
  const [activeRoutes, setActiveRoutes] = useState<RouteData[]>([]);
  const [activeRouteId, setActiveRouteId] = useState("");

  return (
    <div className="app-shell" suppressHydrationWarning>
      <Header />
      {step === "setup" && (
        <Setup
          trip={trip}
          onAnalyze={(nextTrip) => {
            setTrip(nextTrip);
            setStep("analysis");
          }}
        />
      )}
      {step === "analysis" && (
        <Analysis 
          trip={trip} 
          onLive={(r, id) => {
            setActiveRoutes(r);
            setActiveRouteId(id);
            setStep("live");
          }} 
        />
      )}
      {step === "live" && (
        <Live 
          trip={trip} 
          routes={activeRoutes}
          selectedRouteId={activeRouteId}
          onBack={() => setStep("analysis")} 
        />
      )}
      <WorkflowBar step={step} setStep={setStep} />
    </div>
  );
}
