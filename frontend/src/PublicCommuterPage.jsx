import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Polyline, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Navigation,
  MapPin,
  Clock,
  AlertTriangle,
  Car,
  Bike,
  Footprints,
  ShieldAlert,
  Brain,
  Sparkles,
  Waves,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Droplets,
  Wind
} from 'lucide-react';
import './PublicCommuter.css';

// Custom Map View Centering Helper
function CommuteMapController({ fromCoords, toCoords, vectorZones }) {
  const map = useMap();

  useEffect(() => {
    if (fromCoords && toCoords) {
      try {
        const bounds = L.latLngBounds([fromCoords, toCoords]);
        if (vectorZones?.features?.length > 0) {
          const geoJson = L.geoJSON(vectorZones);
          bounds.extend(geoJson.getBounds());
        }
        map.flyToBounds(bounds, { padding: [40, 40], duration: 1.0 });
      } catch (e) {
        console.warn('Bounds calculation error:', e);
      }
    }
  }, [fromCoords, toCoords, vectorZones, map]);

  return null;
}

// Custom Leaflet Markers
const fromIcon = new L.DivIcon({
  className: 'custom-commute-icon from',
  html: `<div style="background-color:#0284c7; width:30px; height:30px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.35); color:white; font-weight:bold; font-size:12px;">A</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const toIcon = new L.DivIcon({
  className: 'custom-commute-icon to',
  html: `<div style="background-color:#059669; width:30px; height:30px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.35); color:white; font-weight:bold; font-size:12px;">B</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

export default function PublicCommuterPage() {
  const [landmarks, setLandmarks] = useState([]);
  const [fromLandmark, setFromLandmark] = useState({
    name: 'Ullal Estuary / Beach Road',
    lat: 12.812,
    lon: 74.835
  });
  const [toLandmark, setToLandmark] = useState({
    name: 'Mangaluru General Hospital',
    lat: 12.848,
    lon: 74.845
  });
  const [vehicle, setVehicle] = useState('car');
  const [scenario, setScenario] = useState('live'); // 'live', 'moderate', 'severe'
  
  const [commuteData, setCommuteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch landmark registry on mount
  useEffect(() => {
    fetch('/api/v1/public/landmarks')
      .then((res) => res.json())
      .then((data) => setLandmarks(data || []))
      .catch((err) => console.warn('Could not fetch landmarks:', err));
  }, []);

  // Fetch route safety & Gemma 3:4B insights
  const evaluateCommute = () => {
    setLoading(true);
    setError(null);

    fetch('/api/v1/public/route-safety', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_name: fromLandmark.name,
        from_lat: fromLandmark.lat,
        from_lon: fromLandmark.lon,
        to_name: toLandmark.name,
        to_lat: toLandmark.lat,
        to_lon: toLandmark.lon,
        vehicle_type: vehicle,
        scenario: scenario
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setCommuteData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Route evaluation failed:', err);
        setError('Failed to compute commute safety. Check backend status.');
        setLoading(false);
      });
  };

  useEffect(() => {
    evaluateCommute();
  }, [fromLandmark.name, toLandmark.name, vehicle, scenario]);

  // Vector zone polygon styling (Red = Breach, Yellow = Caution)
  const zoneStyle = (feature) => {
    const props = feature.properties || {};
    const isRed = props.category === 'RED_HAZARD';
    return {
      fillColor: props.color || (isRed ? '#e11d48' : '#ea580c'),
      weight: 2,
      opacity: 0.9,
      color: isRed ? '#ffffff' : '#fef08a',
      fillOpacity: isRed ? 0.75 : 0.55
    };
  };

  const centerCoords = [
    (fromLandmark.lat + toLandmark.lat) / 2,
    (fromLandmark.lon + toLandmark.lon) / 2
  ];

  return (
    <div className="public-commute-layout">
      {/* Top Citizen Header Bar */}
      <header className="public-header">
        <div className="brand-group">
          <div className="brand-badge">
            <Waves size={18} className="signal" />
            <span className="brand-name">FLOODSIGHT CITIZEN</span>
          </div>
          <span className="brand-sub">Public Safe Commute &amp; Coastal Transit Assistant</span>
        </div>

        {commuteData?.weather && (
          <div className="corridor-weather-strip mono">
            <div className="weather-pill">
              <Droplets size={12} className="signal" />
              <span>RAIN (3H): <strong>{commuteData.weather.rain_3h_mm} mm</strong></span>
            </div>
            <div className="weather-pill">
              <Waves size={12} className="signal" />
              <span>TIDE: <strong>{commuteData.weather.tide_height_msl.toFixed(2)} m MSL</strong></span>
            </div>
            <div className="weather-pill">
              <Wind size={12} />
              <span>WIND: <strong>{commuteData.weather.wind_speed_kmh} km/h</strong></span>
            </div>
          </div>
        )}

        <div className="header-actions">
          <a href="/" className="switch-to-cmd-btn">
            <span>Incident Command Center</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="public-body-split">
        {/* Left Side: Route Controls & Gemma 3:4B Insight Cards */}
        <aside className="public-sidebar">
          {/* Trip Planner Card */}
          <div className="planner-card">
            <h3 className="section-title">
              <Navigation size={16} className="signal" /> Plan Your Safe Transit
            </h3>

            {/* FROM selector */}
            <div className="input-group">
              <label>FROM (DEPARTURE POINT)</label>
              <div className="select-wrapper">
                <MapPin size={15} className="from-pin" />
                <select
                  value={fromLandmark.name}
                  onChange={(e) => {
                    const found = landmarks.find((l) => l.name === e.target.value);
                    if (found) setFromLandmark(found);
                  }}
                >
                  {landmarks.map((l, idx) => (
                    <option key={`from_${idx}`} value={l.name}>
                      {l.name} ({l.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TO selector */}
            <div className="input-group">
              <label>TO (DESTINATION)</label>
              <div className="select-wrapper">
                <MapPin size={15} className="to-pin" />
                <select
                  value={toLandmark.name}
                  onChange={(e) => {
                    const found = landmarks.find((l) => l.name === e.target.value);
                    if (found) setToLandmark(found);
                  }}
                >
                  {landmarks.map((l, idx) => (
                    <option key={`to_${idx}`} value={l.name}>
                      {l.name} ({l.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vehicle Mode Selector */}
            <div className="input-group">
              <label>MODE OF TRAVEL</label>
              <div className="vehicle-selector">
                <button
                  className={`veh-btn ${vehicle === 'car' ? 'active' : ''}`}
                  onClick={() => setVehicle('car')}
                  title="Sedan / Hatchback Car"
                >
                  <Car size={16} /> <span>Car / Sedan</span>
                </button>
                <button
                  className={`veh-btn ${vehicle === 'suv' ? 'active' : ''}`}
                  onClick={() => setVehicle('suv')}
                  title="High-Clearance 4x4 / SUV"
                >
                  <ShieldAlert size={16} /> <span>SUV / 4x4</span>
                </button>
                <button
                  className={`veh-btn ${vehicle === 'bike' ? 'active' : ''}`}
                  onClick={() => setVehicle('bike')}
                  title="2-Wheeler / Motorcycle"
                >
                  <Bike size={16} /> <span>2-Wheeler</span>
                </button>
                <button
                  className={`veh-btn ${vehicle === 'walk' ? 'active' : ''}`}
                  onClick={() => setVehicle('walk')}
                  title="Pedestrian / On Foot"
                >
                  <Footprints size={16} /> <span>Walking</span>
                </button>
              </div>
            </div>

            {/* Weather Scenario Simulation Toggle */}
            <div className="input-group">
              <label>WEATHER TEST SCENARIO</label>
              <div className="scenario-chips">
                <button
                  className={`scen-chip ${scenario === 'live' ? 'active' : ''}`}
                  onClick={() => setScenario('live')}
                >
                  Live Weather
                </button>
                <button
                  className={`scen-chip ${scenario === 'moderate' ? 'active' : ''}`}
                  onClick={() => setScenario('moderate')}
                >
                  Moderate Rain (55mm)
                </button>
                <button
                  className={`scen-chip ${scenario === 'severe' ? 'active' : ''}`}
                  onClick={() => setScenario('severe')}
                >
                  Severe Surge (115mm)
                </button>
              </div>
            </div>

            <button
              className="recalc-btn"
              onClick={evaluateCommute}
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="spin-anim" />
                  <span>Evaluating Corridor with Gemma 3:4B...</span>
                </>
              ) : (
                <>
                  <Navigation size={14} />
                  <span>Recalculate Route Safety</span>
                </>
              )}
            </button>
          </div>

          {/* Trip Metrics Pill */}
          {commuteData && (
            <div className="trip-metrics-card mono">
              <div className="trip-metric">
                <label>CORRIDOR DISTANCE</label>
                <val>{commuteData.trip.distance_km} km</val>
              </div>
              <div className="trip-divider">/</div>
              <div className="trip-metric">
                <label>ESTIMATED TRAVEL TIME</label>
                <val>{commuteData.trip.estimated_minutes} mins</val>
              </div>
              <div className="trip-divider">/</div>
              <div className="trip-metric">
                <label>HAZARD ZONES</label>
                <val className={commuteData.safety.red_zones_count > 0 ? 'breach' : 'safe'}>
                  {commuteData.safety.red_zones_count} Red · {commuteData.safety.yellow_zones_count} Yellow
                </val>
              </div>
            </div>
          )}

          {/* GEMMA 3:4B CITIZEN INSIGHT CARDS */}
          {commuteData?.gemma_insight && (
            <div className="gemma-citizen-card">
              {/* Verdict Header Banner */}
              <div
                className="verdict-banner"
                style={{ borderColor: commuteData.safety.badge_color }}
              >
                <div className="verdict-header-row">
                  <span className="verdict-kicker mono">CITIZEN TRANSIT VERDICT</span>
                  <span className="golden-window-chip mono">
                    <Clock size={12} />
                    <span>WINDOW: {commuteData.safety.travel_window_mins} MINS</span>
                  </span>
                </div>
                <h4 className="verdict-text">{commuteData.gemma_insight.verdict}</h4>
              </div>

              {/* Gemma 3:4B Explainability Body */}
              <div className="gemma-explanation-box">
                <div className="gemma-ai-meta">
                  <div className="gemma-tag">
                    <Brain size={14} style={{ color: '#a78bfa' }} />
                    <span className="mono">GEMMA 3:4B AI EXPLANATION</span>
                  </div>
                  <span className="gemma-status-pill mono">
                    OLLAMA LOCAL · {commuteData.gemma_insight.latency_sec}s
                  </span>
                </div>
                <p className="gemma-body-narrative">
                  {commuteData.gemma_insight.explanation}
                </p>
              </div>

              {/* Vehicle Advisory Box */}
              <div className="vehicle-advisory-box">
                <div className="advisory-label mono">
                  <AlertTriangle size={13} className="signal" /> VEHICLE &amp; PASSABILITY ADVICE
                </div>
                <p className="advisory-text">
                  {commuteData.gemma_insight.vehicle_advice}
                </p>
              </div>
            </div>
          )}
        </aside>

        {/* Right Side: Vector Polygon Map Viewport */}
        <main className="public-map-viewport">
          <MapContainer
            center={centerCoords}
            zoom={13}
            scrollWheelZoom={true}
            style={{ width: '100%', height: '100%' }}
          >
            <CommuteMapController
              fromCoords={[fromLandmark.lat, fromLandmark.lon]}
              toCoords={[toLandmark.lat, toLandmark.lon]}
              vectorZones={commuteData?.vector_zones}
            />

            {/* Standard OpenStreetMap Tiles */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* VECTOR ZONES (Pure Vector GeoJSON Polygons, NOT Raster Tiles) */}
            {commuteData?.vector_zones?.features?.length > 0 && (
              <GeoJSON
                key={JSON.stringify(commuteData.vector_zones.features.map((f) => f.properties.zone_id + f.properties.color))}
                data={commuteData.vector_zones}
                style={zoneStyle}
                onEachFeature={(feature, layer) => {
                  const p = feature.properties || {};
                  const isRed = p.category === 'RED_HAZARD';
                  layer.bindTooltip(
                    `<strong>${isRed ? '🔴 RED HAZARD ZONE' : '🟡 YELLOW CAUTION ZONE'}</strong><br/>` +
                    `Zone: ${p.zone_id}<br/>` +
                    `Forecast Depth: ${p.depth_m.toFixed(2)}m<br/>` +
                    `Elevation: ${p.elevation_m.toFixed(1)}m MSL`,
                    { sticky: true }
                  );
                }}
              />
            )}

            {/* Commuter Route Polyline */}
            {commuteData?.route_polyline && (
              <Polyline
                positions={commuteData.route_polyline}
                pathOptions={{
                  color: commuteData.safety.red_zones_count > 0 ? '#e11d48' : '#0284c7',
                  weight: 5,
                  opacity: 0.9,
                  dashArray: commuteData.safety.red_zones_count > 0 ? '8, 8' : null
                }}
              >
                <Tooltip permanent={false}>
                  <span>Transit Corridor: {commuteData.trip.distance_km} km</span>
                </Tooltip>
              </Polyline>
            )}

            {/* Point A Marker (Departure) */}
            <Marker position={[fromLandmark.lat, fromLandmark.lon]} icon={fromIcon}>
              <Popup>
                <strong>Origin (Departure)</strong><br />
                {fromLandmark.name}
              </Popup>
            </Marker>

            {/* Point B Marker (Destination) */}
            <Marker position={[toLandmark.lat, toLandmark.lon]} icon={toIcon}>
              <Popup>
                <strong>Destination</strong><br />
                {toLandmark.name}
              </Popup>
            </Marker>
          </MapContainer>

          {/* Map Vector Legend HUD */}
          <div className="public-map-legend">
            <span className="legend-head mono">CORRIDOR ZONES</span>
            <div className="legend-row">
              <span className="legend-chip red" />
              <span>Red Zones (Impassable Breach &gt;0.35m)</span>
            </div>
            <div className="legend-row">
              <span className="legend-chip yellow" />
              <span>Yellow Zones (Caution / Surface Runoff)</span>
            </div>
            <div className="legend-row">
              <span className="legend-chip line" />
              <span>Commuter Route Trajectory</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
