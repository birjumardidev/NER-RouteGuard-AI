# NER SmartRoute AI

## SIH 2026 | Problem Statement ID: SIH26002

**AI-Based Smart Logistics and Accessibility Intelligence Platform for North Eastern Region (NER)**

NER SmartRoute AI is a driver-facing MVP for the SIH 2026 problem statement. It helps drivers and logistics operators choose safer routes for essential-goods movement across the North Eastern Region by combining route alternatives, current weather, flood-risk signals, and AI-assisted route comparison.

The long-term solution is a complete logistics and accessibility intelligence platform for government departments, district authorities, control rooms, fleet operators, and field officials. This repository currently focuses on the driver workflow: plan a trip, understand route risk, and navigate the recommended route.

## Problem Context

The North Eastern Region has difficult terrain, remote settlements, limited transport connectivity, and roads that can be disrupted by heavy rainfall, floods, landslides, bridge damage, and congestion. A route selected only by distance or travel time may be unsafe or unsuitable for medicines, relief supplies, agricultural produce, or construction materials.

The SIH26002 platform is intended to improve regional connectivity and logistics planning by monitoring accessibility, predicting disruption, supporting alternate routes, tracking essential deliveries, and sharing timely information with authorities and field teams.

## Current MVP: Driver System

The current implementation delivers the driver-side route decision and navigation experience:

- Enter or search for an origin and destination in India.
- Select cargo type and vehicle type.
- Retrieve up to three alternate driving routes.
- Show distance, estimated duration, route geometry, and navigation steps.
- Fetch current weather near each route and display rainfall, temperature, humidity, and conditions.
- Sample route coordinates for river-discharge-based flood-risk assessment.
- Mark routes as clear, warning, dangerous, or blocked according to available risk data.
- Use Groq to compare route time, distance, cargo, vehicle, and flood risk.
- Fall back to a deterministic fastest-route recommendation when AI credentials are unavailable.
- Open a live map view with the selected route, origin, destination, hazard markers, trip details, and navigation steps.

This MVP is designed to demonstrate the most important field interaction: helping a driver make a safer logistics route choice before departure.

## Alignment With SIH26002 Requirements

| SIH requirement                                         | Current status                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Monitor road and transport accessibility                | Driver receives route alternatives and route-risk context; district-wide monitoring is planned.                        |
| Predict disruptions from floods and heavy rainfall      | Weather and river-discharge signals are integrated; landslide, bridge, road-damage, and congestion models are planned. |
| Suggest alternate routes and travel delays              | Implemented through OSRM alternatives and route comparison.                                                            |
| Track essential-goods vehicles through GPS              | Live map handoff is implemented with a prototype vehicle marker; real GPS ingestion is planned.                        |
| Alert on blocked roads, delays, and high-risk corridors | Route-level warnings are implemented; push/SMS/control-room alerts are planned.                                        |
| Upload geo-tagged field reports and photographs         | Planned for the field-official application.                                                                            |
| Centralized district and logistics dashboards           | Planned as the authority and operations dashboard.                                                                     |
| Multilingual notifications and offline synchronization  | Planned for the mobile field application and low-network workflows.                                                    |
| Integrate weather, transport, and government systems    | Weather and routing integrations are implemented; government and transport database integrations are planned.          |

## Planned Full Platform

The driver system is the first module of the larger SIH solution. Future modules will extend it into a shared intelligence platform with:

1. **Accessibility intelligence:** district-wise connectivity status, bridge and road condition monitoring, and high-risk corridor maps.
2. **Disruption prediction:** AI/ML models for floods, landslides, heavy rainfall, road damage, congestion, and estimated delays.
3. **Fleet and delivery tracking:** secure GPS integration for vehicles carrying medicines, food, agricultural produce, construction materials, and relief supplies.
4. **Alert and response workflows:** automated alerts for blocked roads, delayed deliveries, inaccessible regions, and emergency routes.
5. **Field reporting:** geo-tagged incident reports, photographs, verification, and updates from local officials.
6. **Operations dashboards:** centralized views for districts, bottlenecks, supply-chain gaps, emergency routes, and delivery status.
7. **Inclusive connectivity:** multilingual notifications, offline capture, and synchronization when a low-network device reconnects.

## Driver Workflow

1. Enter or search for the trip origin and destination.
2. Select cargo type and vehicle type.
3. Select **Analyze route**.
4. Review alternate routes, weather, flood risk, and the AI recommendation.
5. Select **Start navigation** to hand off the recommended route to the live driver view.

### SIH demonstration scenario

Use a medicine delivery trip from Guwahati to Imphal with a medium truck. The application compares available routes and shows how rainfall and river-discharge conditions influence the recommended route. The selected route can then be opened in the live navigation view for the driver.

## Technology Stack

- Next.js 16 App Router
- React 19 and TypeScript
- Leaflet with OpenStreetMap tiles for GIS map rendering
- OSRM for driving routes, alternatives, and turn-by-turn steps
- Nominatim for Indian place search
- India Meteorological Department weather API with Open-Meteo fallback
- Open-Meteo GloFAS flood data
- Groq API for AI route comparison
- Lucide React for interface icons

## Application Flow

```text
Driver trip details
        |
        v
Next.js driver UI
   |       |        |          |
   v       v        v          v
geocode  routing  weather    flood
Nominatim  OSRM   IMD /       Open-Meteo
                   Open-Meteo
        |
        v
Route risk and AI recommendation
        |
        v
Live driver navigation view
```

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm
- Optional: a Groq API key for AI route reasoning

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

### Environment variables

Create `.env.local` in the project root to enable the Groq recommendation provider:

```env
GROQ_API_KEY=your_groq_api_key
```

The application runs without this variable. In that case, the fastest valid route is selected and the UI identifies the metrics fallback.

## Available Scripts

```bash
npm run dev    # Start the development server
npm run build  # Create a production build
npm run start  # Start the production server
```

## API Endpoints

| Endpoint                            | Method | Purpose                                                   |
| ----------------------------------- | ------ | --------------------------------------------------------- |
| `/api/geocode?q=`                   | GET    | Search Indian places using Nominatim.                     |
| `/api/routing?origin=&destination=` | GET    | Return OSRM driving routes and navigation steps.          |
| `/api/weather?lat=&lon=`            | GET    | Return current weather data with a fallback provider.     |
| `/api/flood?lat=&lon=`              | GET    | Return flood risk for one coordinate.                     |
| `/api/flood`                        | POST   | Evaluate flood risk across sampled route coordinates.     |
| `/api/recommendation`               | POST   | Compare routes and return a recommended route and reason. |

Routing coordinates use `longitude,latitude` order. Route geometry arrays use `[longitude, latitude]` pairs.

## Project Structure

```text
app/
  page.tsx                    Driver planning, analysis, and navigation UI
  layout.tsx                  Application metadata and root layout
  globals.css                 Global interface styling
  api/
    geocode/route.ts          Place search proxy
    routing/route.ts          OSRM route proxy
    weather/route.ts          Weather normalisation and fallback
    flood/route.ts            Point and route flood checks
    recommendation/route.ts   AI route comparison and fallback
```

## Data and Prototype Limitations

- External services are queried at runtime, so results depend on network availability and provider response quality.
- The current live map uses a prototype vehicle marker; it does not yet ingest GPS positions from a physical vehicle or mobile device.
- Flood levels currently use river-discharge thresholds in the prototype. They are decision-support signals, not official evacuation or road-closure orders.
- Landslide detection, bridge status, road-damage reporting, congestion feeds, field uploads, multilingual notifications, offline synchronization, and centralized dashboards are planned modules.
- Production deployment should add authenticated access, encrypted data handling, audit logs, verified government feeds, local control-room validation, and formal attribution for external map and data providers.

## License

This repository does not currently declare a software license. Add a license before distributing or deploying the project publicly.
