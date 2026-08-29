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
  Waves,
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
  floodLevel?: string;
  waterLevelTrend?: string;
};

const routeColors = [
  "#3489dd",
  "#c65cf2",
  "#f1af26",
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
  if (route.disrupted || weather?.floodLevel === "Extreme Danger")
    return { label: "High risk", tone: "red" };
  if (weather?.floodLevel === "Danger")
    return { label: "Flood warning", tone: "red" };
  if (weather?.floodLevel === "Warning")
    return { label: "Flood watch", tone: "amber" };
  if (weather?.rainfall != null && weather.rainfall > 15) {
    return { label: "Weather risk", tone: "amber" };
  }
  if (!weather?.available) return { label: "Risk unknown", tone: "muted" };
  return { label: "Low risk", tone: "green" };
}

function getWeatherSummary(weather?: RouteWeather) {
  if (!weather?.available) return "IMD report unavailable";
  const details = [
    weather.temperature != null ? `${Math.round(weather.temperature)}°C` : "",
    weather.humidity != null ? `${Math.round(weather.humidity)}% humidity` : "",
    weather.floodLevel && weather.floodLevel !== "Normal"
      ? `Flood Alert: ${weather.floodLevel}`
      : "",
  ].filter(Boolean);
  return [weather.description, ...details].join(" · ");
}

const guwahati: [number, number] = [91.7362, 26.1445];
const imphal: [number, number] = [93.9368, 24.817];
const defaultOrigin: Place = { name: "", coordinates: guwahati };
const defaultDestination: Place = {
  name: "",
  coordinates: imphal,
};

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
      const L = leaflet.default;
      const isTouchDevice = window.matchMedia(
        "(hover: none), (pointer: coarse)",
      ).matches;
      map = L.map(mapNode.current, {
        zoomControl: false,
        preferCanvas: false,
        markerZoomAnimation: !isTouchDevice,
        zoomAnimation: !isTouchDevice,
        fadeAnimation: !isTouchDevice,
        trackResize: true,
      } as Parameters<typeof L.map>[1]).setView([25.5, 92.8], 7.5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 26,
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
        renderer: L.svg(),
        interactive: false,
      };
      const routeLines = mapRoutes.map((route, index) => {
        const coordinates = route.coordinates.map(
          ([longitude, latitude]) => [latitude, longitude] as [number, number],
        );
        const polyline = L.polyline(coordinates, {
          color: getRouteColor(index, route, recommendedRouteId),
          weight: route.id === recommendedRouteId ? 4 : 3,
          opacity: 1,
          ...routeOptions,
        });

        if (coordinates.length > 0) {
          const midIndex = Math.floor(coordinates.length / 2);
          const midPoint = coordinates[midIndex];
          L.tooltip({
            permanent: true,
            direction: "center",
            className: "osm-route-tooltip",
          })
            .setLatLng(midPoint)
            .setContent(route.label)
            .addTo(map);
        }

        return polyline;
      });

      // Render non-recommended routes first, then recommended, so recommended is always on top
      routeLines.forEach((line, index) => {
        if (mapRoutes[index].id !== recommendedRouteId) line.addTo(map);
      });
      routeLines.forEach((line, index) => {
        if (mapRoutes[index].id === recommendedRouteId) line.addTo(map);
      });
      if (live) {
        const activeRoute =
          mapRoutes.find((r) => r.id === recommendedRouteId) || mapRoutes[0];
        const coords =
          activeRoute?.coordinates.map(
            ([lon, lat]) => [lat, lon] as [number, number],
          ) || [];
        const startPos = coords[0] || [
          origin.coordinates[1],
          origin.coordinates[0],
        ];
        map.setView(startPos, 10, {
          animate: false,
        });
        map.panBy([100, 0], { animate: false });
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
        })
          .addTo(map)
          .bindTooltip(`START · ${origin.name || "Origin"}`, {
            permanent: true,
            direction: "top",
            offset: [0, -10],
            className: "osm-place-tooltip",
          });
      }
      L.marker([destination.coordinates[1], destination.coordinates[0]], {
        icon: endIcon,
        zIndexOffset: 400,
      })
        .addTo(map)
        .bindTooltip(
          live
            ? destination.name || "Destination"
            : `END · ${destination.name || "Destination"}`,
          {
            permanent: true,
            direction: "top",
            offset: [0, -10],
            className: "osm-place-tooltip",
          },
        );
      if (live) {
        const activeRoute =
          mapRoutes.find((r) => r.id === recommendedRouteId) || mapRoutes[0];
        const coords =
          activeRoute?.coordinates.map(
            ([lon, lat]) => [lat, lon] as [number, number],
          ) || [];

        const vehicle = L.divIcon({
          className: "osm-vehicle-marker",
          // html: "&#9650;",
          iconSize: [32, 32],
          iconAnchor: [26, 26],
        });

        const startPos = coords[0] || [
          origin.coordinates[1],
          origin.coordinates[0],
        ];
        const vehicleMarker = L.marker(startPos, {
          icon: vehicle,
          zIndexOffset: 1000,
        }).addTo(map);

        vehicleMarker.bindTooltip("NER-MED-102", {
          permanent: true,
          direction: "right",
          offset: [20, 0],
          className: "osm-vehicle-tooltip",
        });

        if (coords.length > 1) {
          // Map stays straight, not rotated
        }
      }
      mapRef.current = map;
      resizeObserver = new ResizeObserver(() =>
        map.invalidateSize({ animate: false }),
      );
      resizeObserver.observe(mapNode.current);
      // map.on("zoomend rotate", () => map.invalidateSize({ animate: false }));
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
}

function Header() {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="topbar">
      <div className="brand-mark">
        <Navigation size={20} />
      </div>
      <div className="brand">
        <strong>NER SmartRoute</strong>
        <span>AI navigation</span>
      </div>
      <div className="network">
        <span className="signal">●</span>
        <span>
          GPS <b>Strong</b>
        </span>
      </div>
      <div
        className="notification-wrapper"
        style={{ position: "relative", marginLeft: "auto" }}
      >
        <button
          className="icon-button notification"
          aria-label="Notifications"
          onClick={() => setShowNotifications(!showNotifications)}
        >
          <Bell size={20} />
          <i>3</i>
        </button>
        {showNotifications && (
          <div className="notification-dropdown">
            <div className="notif-item">
              <AlertTriangle
                size={14}
                color="#e94238"
                style={{ marginTop: 2 }}
              />
              <div>
                <strong>Landslide Alert</strong>
                <span>NH-37 blocked 42km ahead. Re-routing recommended.</span>
              </div>
            </div>
            <div className="notif-item">
              <Wind size={14} color="#f1af26" style={{ marginTop: 2 }} />
              <div>
                <strong>Weather Warning</strong>
                <span>Heavy rain expected in 2 hours near Silchar.</span>
              </div>
            </div>
            <div className="notif-item">
              <Check size={14} color="#0bba61" style={{ marginTop: 2 }} />
              <div>
                <strong>System Update</strong>
                <span>Offline maps for Assam region updated.</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <button className="icon-button" aria-label="Menu">
        <Menu size={21} />
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
              <span className="workflow-label">{label}</span>
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
          <ShieldCheck size={15} /> AI route planner
        </div>
        <h1>
          Find the safer
          <br />
          <span>way there.</span>
        </h1>
        <p>
          Enter your start, destination, cargo and vehicle. The AI compares
          routes, weather and risk so you can leave with a clear plan.
        </p>
      </div>
      <section className="setup-panel">
        <div className="panel-heading">
          <div>
            <span className="step-label">Trip details</span>
            <h2>Plan your trip</h2>
          </div>
          <div className="secure">
            <ShieldCheck size={14} /> Secure
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
                {/* <MapPin size={14} /> */}
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
                {/* <MapPin size={14} /> */}
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
          Analyze route <ArrowRight size={18} />
        </button>
        <div className="data-note">
          <Gauge size={16} /> Live weather and road risk across the Northeast
        </div>
      </section>
      {/* <div className="setup-footer">
        <span>
          Powered by <b>OpenStreetMap</b>
        </span>
        <span>
          <span className="dot-live" /> Live hazard data
        </span>
        <span>v2.4.0</span>
      </div> */}
    </main>
  );
}

function Analysis({
  trip,
  onLive,
}: {
  trip: Trip;
  onLive: (routes: RouteData[], selectedRouteId: string) => void;
}) {
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

          const [weatherRes, floodRes] = await Promise.all([
            fetch(`/api/weather?lat=${midpoint[1]}&lon=${midpoint[0]}`),
            fetch(`/api/flood`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coordinates: route.coordinates }),
            }),
          ]);

          const weather = (await weatherRes.json()) as RouteWeather;
          const flood = await floodRes.json();

          weather.floodLevel = flood.level;
          weather.waterLevelTrend = flood.trend;

          return [route.id, weather] as const;
        }),
      );
      if (cancelled) return;
      setRouteWeather(Object.fromEntries(weatherEntries));
      const aiResponse = await fetch("/api/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routes: availableRoutes.map((r: RouteData) => ({
            ...r,
            cwcFloodLevel: weatherEntries.find((e) => e[0] === r.id)?.[1]
              .floodLevel,
          })),
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
            <Check size={15} />
            Route Analysis
          </div>
          <h1>Safer Route Found</h1>
          <p>
            Compared available routes for your {trip.cargo.toLowerCase()}{" "}
            delivery.
          </p>
        </div>
        {/* <div className="score-badge">
          <strong>86</strong>
          <span>Safety score</span>
        </div> */}
      </div>
      <div className="analysis-grid">
        <section className="map-panel">
          <div className="map-heading">
            <span>Route comparison</span>
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
        </section>
        <section className="decision-panel">
          <div className="recommended-head">
            <div>
              <span className="step-label">AI recommendation</span>
              {recommendation.provider ? (
                <h2>
                  {selectedRoute?.label || "Comparing routes"}{" "}
                  <span>· best overall</span>
                </h2>
              ) : (
                <h2>Analyzing routes…</h2>
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
            <h3>Available routes</h3>
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
                      : "Loading weather…"}
                  </small>
                  <small
                    className={`route-risk ${getRouteRisk(route, routeWeather[route.id]).tone}`}
                  >
                    <AlertTriangle size={12} />{" "}
                    {getRouteRisk(route, routeWeather[route.id]).label}
                  </small>
                </span>
                {(route.disrupted ||
                  (routeWeather[route.id] &&
                    getRouteRisk(route, routeWeather[route.id]).tone !==
                      "green" &&
                    getRouteRisk(route, routeWeather[route.id]).tone !==
                      "muted")) && (
                  <span
                    style={{
                      gridColumn: "1 / -1",
                      padding: "8px 10px",
                      background:
                        getRouteRisk(route, routeWeather[route.id]).tone ===
                        "red"
                          ? "#fbeceb"
                          : "#fef8e7",
                      color:
                        getRouteRisk(route, routeWeather[route.id]).tone ===
                        "red"
                          ? "var(--red)"
                          : "var(--amber)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-start",
                      marginTop: "6px",
                    }}
                  >
                    <AlertTriangle
                      size={14}
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <strong>Warning</strong>
                      <span>
                        {route.disrupted
                          ? "Route disrupted due to hazards. "
                          : ""}
                        {routeWeather[route.id]?.floodLevel &&
                        routeWeather[route.id]?.floodLevel !== "Normal"
                          ? `Flood Alert: ${routeWeather[route.id].floodLevel}. `
                          : ""}
                        {routeWeather[route.id]?.rainfall &&
                        routeWeather[route.id].rainfall! > 15
                          ? "Heavy rainfall expected."
                          : ""}
                      </span>
                    </span>
                  </span>
                )}
                {routeWeather[route.id] &&
                  getRouteRisk(route, routeWeather[route.id]).tone ===
                    "green" && (
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        padding: "8px 10px",
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        display: "flex",
                        gap: "8px",
                        alignItems: "flex-start",
                        marginTop: "6px",
                      }}
                    >
                      <ShieldCheck
                        size={14}
                        style={{ flexShrink: 0, marginTop: "2px" }}
                      />
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <strong>Info</strong>
                        <span>
                          Conditions are clear. Route is safe for travel.
                        </span>
                      </span>
                    </span>
                  )}
              </button>
            ))}
          </div>
          <button
            className="primary-action"
            onClick={() => onLive(routes, selectedRouteId)}
          >
            Start navigation <Navigation size={17} />
          </button>
        </section>
      </div>
    </main>
  );
}

function Live({
  trip,
  routes,
  selectedRouteId,
  onBack,
}: {
  trip: Trip;
  routes: RouteData[];
  selectedRouteId: string;
  onBack: () => void;
}) {
  const [showEmergency, setShowEmergency] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  return (
    <main className={`live-page ${isFullscreen ? "live-fullscreen" : ""}`}>
      <div className="live-map-wrap">
        <MapCanvas
          live
          origin={trip.origin}
          destination={trip.destination}
          routes={routes}
          recommendedRouteId={selectedRouteId}
        />
        <div className="live-top">
          <div className="live-heading">
            <span className="live-pill">
              <i /> Live
            </span>
            <h1>
              <span className="live-place">{trip.origin.name || "Start"}</span>
              <ArrowRight size={14} />
              <span className="live-place">
                {trip.destination.name || "Destination"}
              </span>
            </h1>
          </div>
          {/* <div className="eta-live">
            <span>Arrival</span>
            <strong>5h 42m</strong>
            <small>6:30 PM · 215 km</small>
          </div> */}
        </div>
        <button
          className="map-fullscreen-button"
          onClick={() => setIsFullscreen((current) => !current)}
          aria-label={
            isFullscreen ? "Exit full screen map" : "Open full screen map"
          }
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          <span>{isFullscreen ? "Exit map" : "Full screen"}</span>
        </button>

        <div className="live-bottom">
          <div className="trip-chip">
            <Truck size={18} />
            <span>NER-MED-102</span>
            <b>0 km/h</b>
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
                  <span className="step-label">Emergency support</span>
                  <h2>Need immediate help?</h2>
                  <p>
                    Connect with the NER logistics control room for route
                    assistance.
                  </p>
                  <button className="primary-action">
                    <Phone size={17} /> Call control room
                  </button>
                </>
              ) : (
                <>
                  <div className="modal-icon">
                    <Route size={22} />
                  </div>
                  <span className="step-label">Route details</span>
                  <h2>{activeRoute?.label || "Safer path"}</h2>
                  <p>
                    {activeRoute
                      ? Math.round(activeRoute.distance / 1000)
                      : "--"}{" "}
                    km ·{" "}
                    {activeRoute
                      ? Math.floor(activeRoute.duration / 3600)
                      : "--"}
                    h{" "}
                    {activeRoute
                      ? Math.round((activeRoute.duration % 3600) / 60)
                      : "--"}
                    m remaining
                  </p>
                  <div className="modal-detail">
                    <span>Next hazard</span>
                    <strong>
                      {activeRoute?.disrupted
                        ? "Landslide zone"
                        : "None detected"}
                    </strong>
                  </div>
                  <div className="modal-detail">
                    <span>Arrival estimate</span>
                    <strong>
                      {new Date(
                        Date.now() + (activeRoute?.duration || 0) * 1000,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
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
