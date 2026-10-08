import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Polyline, Popup, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import TemporalScrubber, { calculateInundationAtHour } from './TemporalScrubber';

// Helper component to re-center map dynamically when currentSector changes
function MapViewController({ center, zones }) {
  const map = useMap();
  const centerKey = center ? `${center[0]},${center[1]}` : null;
  const [handledCenter, setHandledCenter] = React.useState(null);

  useEffect(() => {
    if (centerKey !== handledCenter) {
      if (zones && zones.length > 0) {
        try {
          const geoJsonLayer = L.geoJSON({
            type: 'FeatureCollection',
            features: zones.map(z => ({
              type: 'Feature',
              geometry: z.geometry
            }))
          });
          const bounds = geoJsonLayer.getBounds();
          if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [30, 30], duration: 1.2 });
            setHandledCenter(centerKey);
          }
        } catch (e) {
          console.warn("Could not calculate bounds from zones", e);
          map.flyTo(center, 13, { duration: 1.2 });
          setHandledCenter(centerKey);
        }
      } else if (!zones || zones.length === 0) {
        map.flyTo(center, 13, { duration: 1.2 });
      }
    }
  }, [centerKey, zones, map, handledCenter, center]);
  return null;
}

// Blue Play Origin Icon (matching Colab Notebook Image)
const originIcon = new L.DivIcon({
  className: 'custom-origin-icon',
  html: `<div style="background-color:#0284c7; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

// Green Shelter Icon (matching Colab Notebook Image)
const shelterIcon = new L.DivIcon({
  className: 'custom-shelter-icon',
  html: `<div style="background-color:#059669; width:24px; height:24px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3);"><div style="width:8px; height:8px; background-color:white; border-radius:50%;"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

export default function InteractiveMap({
  zones,
  roads,
  buildings,
  routes,
  origin,
  onOriginChange,
  selectedZone,
  onSelectZone,
  currentSector = { center_lat: 12.835, center_lon: 74.845 },
  simHour = 0,
  onSimHourChange
}) {
  const CENTER = [currentSector.center_lat || 12.835, currentSector.center_lon || 74.845];

  // Layer Visibility Toggles
  const [showZones, setShowZones] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showShelters, setShowShelters] = useState(true);

  // OpenStreetMap tiles - same as Colab's folium default (free, no token)
  const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Calculate timing milestones
  const validOnsets = (zones || [])
    .filter(z => z.onset_hours != null && z.onset_hours < 24 && z.risk_level !== 'LOW')
    .map(z => z.onset_hours);
  const earliestOnset = validOnsets.length > 0 ? Math.min(...validOnsets) : 2.5;

  const validPeaks = (zones || [])
    .filter(z => z.peak_hours != null && z.peak_hours < 24 && z.risk_level !== 'LOW')
    .map(z => z.peak_hours);
  const peakSurge = validPeaks.length > 0 ? Math.min(...validPeaks) : earliestOnset + 2.0;

  // 4D Dynamic Inundation: calculate water depth at current simHour
  const zonesWithSim = (zones || []).map(z => {
    const simDepth = calculateInundationAtHour(z, simHour);
    return {
      ...z,
      sim_depth: simDepth
    };
  });

  // Render ONLY active flooded zones at this specific hour
  const affectedZones = zonesWithSim.filter(z => z.sim_depth >= 0.08 || (simHour === 0 && (z.pred_depth_med >= 0.10 || z.risk_level !== 'LOW')));
  const totalRiskCount = (zones || []).filter(z => z.pred_depth_med >= 0.10 || z.risk_level !== 'LOW').length;

  // Dynamic roads: turn red when simHour reaches road inundation threshold
  const activeBlockedRoads = (roads || []).filter(r => {
    if (!r.is_blocked) return false;
    return simHour >= (earliestOnset * 0.75);
  });

  const zoneStyle = (feature) => {
    const props = feature.properties || {};
    const depth = props.sim_depth != null ? props.sim_depth : (props.pred_depth_med || 0);

    let fillColor = '#d97706'; // Watch (Amber)
    if (depth >= 0.50) {
      fillColor = '#e11d48'; // Breach (Rose Red)
    } else if (depth >= 0.25) {
      fillColor = '#ea580c'; // Warning (Orange)
    } else if (depth >= 0.10) {
      fillColor = '#d97706';
    } else {
      fillColor = '#eab308';
    }

    const isSelected = props.zone_id === selectedZone?.zone_id;

    return {
      fillColor,
      weight: isSelected ? 2.5 : 1,
      opacity: 0.9,
      color: isSelected ? '#ffffff' : 'rgba(225, 29, 72, 0.4)',
      fillOpacity: isSelected ? 0.82 : 0.62
    };
  };

  const onEachZone = (feature, layer) => {
    const props = feature.properties || {};
    layer.on({
      click: () => {
        onSelectZone(props);
      }
    });
  };

  const nearestRoute = routes && routes.length > 0 ? routes[0] : null;

  return (
    <div className="map-container-wrapper">
      {/* Top Map Layer Control Bar */}
      <div className="map-toolbar-hud hud-panel">
        <button
          className={showZones ? 'layer-btn active' : 'layer-btn'}
          onClick={() => setShowZones(!showZones)}
        >
          <span className="dot-indicator red" /> Flooded Zones ({affectedZones.length})
        </button>
        <button
          className={showRoutes ? 'layer-btn active' : 'layer-btn'}
          onClick={() => setShowRoutes(!showRoutes)}
        >
          <span className="dot-indicator green" /> Evacuation Routes ({routes ? routes.length : 0})
        </button>
        <button
          className={showShelters ? 'layer-btn active' : 'layer-btn'}
          onClick={() => setShowShelters(!showShelters)}
        >
          <span className="dot-indicator blue" /> Shelters & Origins
        </button>
      </div>

      <MapContainer
        center={CENTER}
        zoom={13}
        minZoom={8}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <MapViewController center={CENTER} zones={zones} />
        {/* OpenStreetMap Tiles - same as Colab folium */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={osmUrl}
          maxZoom={19}
        />

        {/* 1. ONLY Affected Flooded Zone Polygons (Matching Colab Notebook) */}
        {showZones && affectedZones.length > 0 && (
          <GeoJSON
            key={JSON.stringify(affectedZones.map(z => z.zone_id + z.risk_level))}
            data={{
              type: 'FeatureCollection',
              features: affectedZones.map(z => ({
                type: 'Feature',
                properties: z,
                geometry: z.geometry
              }))
            }}
            style={zoneStyle}
            onEachFeature={onEachZone}
          />
        )}

        {/* 1.5 Dynamic Blocked Road Overlay — ONLY segments submerged at current simHour.
            Clear streets come from the OSM basemap itself (matching Colab notebook),
            so the synthetic green mesh is intentionally NOT rendered. */}
        {showRoutes && activeBlockedRoads.map((road, i) => (
          road.coordinates && road.coordinates.length > 0 && (
            <Polyline
              key={`road_blk_${i}_${simHour}`}
              positions={road.coordinates}
              pathOptions={{
                color: '#e11d48',
                weight: 2.5,
                opacity: 0.9
              }}
              interactive={false}
            />
          )
        ))}

        {/* 2. Route to the nearest safe shelter from the draggable origin */}
        {showRoutes && nearestRoute && nearestRoute.route_coords && nearestRoute.route_coords.length > 0 && (
          <Polyline
            positions={nearestRoute.route_coords}
            pathOptions={{
              color: nearestRoute.is_reachable ? '#2ca02c' : '#e11d48',
              weight: nearestRoute.is_reachable ? 4 : 3.5,
              opacity: nearestRoute.is_reachable ? 0.85 : 0.75,
              dashArray: nearestRoute.is_reachable ? null : '6, 5'
            }}
          >
            <Tooltip permanent={false}>
              <strong>Nearest safe shelter: {nearestRoute.shelter_name}</strong><br />
              ETA: {nearestRoute.eta_minutes} min | {Math.round(nearestRoute.distance_m)}m<br />
              Status: {nearestRoute.is_reachable ? '🟢 SAFE PATH CLEAR' : '🔴 PATH BLOCKED'}
            </Tooltip>
            <Popup>
              <strong>Nearest safe shelter: {nearestRoute.shelter_name}</strong><br />
              ETA: {nearestRoute.eta_minutes} mins | Distance: {nearestRoute.distance_m}m<br />
              Status: {nearestRoute.is_reachable ? 'REACHABLE' : 'PATH BLOCKED'}
            </Popup>
          </Polyline>
        )}

        {/* 3. Draggable origin marker; route recalculates when dragging ends */}
        {showShelters && origin && (
          <Marker
            position={origin}
            icon={originIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const position = event.target.getLatLng();
                onOriginChange([position.lat, position.lng]);
              }
            }}
          >
            <Popup>
              <strong>Starting point</strong><br />
              Drag this marker to recalculate the nearest shelter route.
            </Popup>
          </Marker>
        )}

        {/* 4. Safe Shelters Pin Markers */}
        {showShelters && buildings && buildings.map((b, i) => {
          if (b.type !== 'shelter') return null;
          
          // Find the corresponding route to get the ETA
          const route = routes ? routes.find(r => r.shelter_name === b.name) : null;
          const etaText = route ? `${route.eta_minutes} mins` : 'Unknown';
          const distanceText = route ? `${Math.round(route.distance_m)}m` : 'Unknown';

          return (
            <Marker key={`shelter_${i}`} position={[b.coordinates[0], b.coordinates[1]]} icon={shelterIcon}>
              <Popup>
                <div style={{ padding: '4px' }}>
                  <strong>Safe shelter:</strong><br />
                  <span style={{ fontSize: '13px', color: '#0f172a' }}>{b.name}</span><br />
                  {route && (
                    <div style={{ marginTop: '4px', marginBottom: '4px', fontSize: '12px' }}>
                      <strong>ETA from origin:</strong> {etaText} ({distanceText})
                    </div>
                  )}
                  <small style={{ color: '#059669', fontWeight: 600 }}>🛡️ Direct route clear of flood zones</small>
                </div>
              </Popup>
              <Tooltip permanent={false} direction="top">
                <strong>{b.name}</strong><br />
                {route ? `ETA: ${etaText}` : 'Safe Shelter'}
              </Tooltip>
            </Marker>
          );
        })}

        {/* Hospitals Markers */}
        {buildings && buildings.map((b, i) => {
          if (b.type === 'shelter') return null;
          return (
            <CircleMarker
              key={`hosp_${i}`}
              center={[b.coordinates[0], b.coordinates[1]]}
              radius={b.is_flooded ? 8 : 6}
              pathOptions={{
                color: '#0f172a',
                weight: 1.5,
                fillColor: b.is_flooded ? '#e11d48' : '#059669',
                fillOpacity: 0.95
              }}
            >
              <Tooltip permanent={false}>
                <span className="mono"><strong>{b.name}</strong> ({b.type})</span><br />
                Status: {b.is_flooded ? `FLOODED (${b.flood_depth_m}m)` : 'SAFE'}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* (Routes rendered above in section 2) */}
      </MapContainer>

      {/* Floating HUD Legend */}
      <div className="map-overlay-legend hud-panel">
        <div className="legend-title">Risk Scale</div>
        <div className="legend-item"><span className="severity-dot breach" /> Breach (≥0.50m)</div>
        <div className="legend-item"><span className="severity-dot warn" /> Warning (≥0.25m)</div>
        <div className="legend-item"><span className="severity-dot watch" /> Watch (≥0.10m)</div>
      </div>

      {/* 4D Temporal Inundation Timeline Scrubber (Docked at bottom center of map) */}
      <TemporalScrubber
        simHour={simHour}
        onChangeHour={onSimHourChange || (() => {})}
        earliestOnset={earliestOnset}
        peakSurge={peakSurge}
        activeBreachCount={affectedZones.length}
        totalRiskCount={totalRiskCount}
      />
    </div>
  );
}
