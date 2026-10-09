import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// ponytail: isolated coastline chooser — own map, click sets sector center.
function ClickCatcher({ onPick }) {
  useMapEvents({ click(e) { onPick([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

const COASTS = [
  { name: 'Mangaluru / Ullal', lat: 12.835, lon: 74.845 },
  { name: 'Mumbai Coast', lat: 18.938, lon: 72.835 },
  { name: 'Chennai Port', lat: 13.082, lon: 80.270 },
  { name: 'Kochi Estuary', lat: 9.931, lon: 76.267 },
  { name: 'Panaji Goa', lat: 15.498, lon: 73.827 },
  { name: 'Puri Coast', lat: 19.798, lon: 85.825 },
  { name: 'Vizag Coast', lat: 17.686, lon: 83.282 },
];

export default function CoastlinePicker({ currentSector, onUpdateSector, onClose }) {
  const [picked, setPicked] = useState([currentSector.center_lat, currentSector.center_lon]);
  const [name, setName] = useState(currentSector.city_name || 'Custom Coastline');
  const [loading, setLoading] = useState(false);

  const deploy = async (lat, lon, label) => {
    setLoading(true);
    try {
      await fetch('/api/v1/sector/set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city_name: label, center_lat: lat, center_lon: lon, step_deg: 0.0025 })
      });
      onUpdateSector && onUpdateSector({ city_name: label, center_lat: lat, center_lon: lon });
      onClose && onClose();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  return (
    <div className="location-modal-backdrop">
      <div className="location-modal hud-panel" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h3>🌊 Choose your coastline</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 16px' }}>
          {COASTS.map(c => (
            <button key={c.name} className="city-chip" onClick={() => { setPicked([c.lat, c.lon]); setName(c.name); }}>
              {c.name}
            </button>
          ))}
        </div>
        <p style={{ padding: '0 16px', fontSize: 12, opacity: 0.7 }}>Or click anywhere on the map — grid, live weather, shelters, depot & alerts all follow that point.</p>
        <div style={{ height: 340, margin: '0 16px', borderRadius: 8, overflow: 'hidden' }}>
          <MapContainer center={picked} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickCatcher onPick={(ll) => { setPicked(ll); setName('Custom Coastline'); }} />
            <Marker position={picked} />
          </MapContainer>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: 16, alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6 }} aria-label="Sector name" />
          <span className="mono" style={{ fontSize: 12 }}>{picked[0].toFixed(4)}, {picked[1].toFixed(4)}</span>
          <button className="apply-custom-btn" disabled={loading} onClick={() => deploy(picked[0], picked[1], name)}>
            {loading ? 'Building mesh…' : 'Predict here'}
          </button>
        </div>
      </div>
    </div>
  );
}
