import React, { useState } from 'react';
import { MapPin, Navigation, Compass, Check, X } from 'lucide-react';

const PRESET_CITIES = [
  { name: 'Mangaluru / Ullal', lat: 12.835, lon: 74.845 },
  { name: 'Mumbai Coast', lat: 18.938, lon: 72.835 },
  { name: 'Chennai Port', lat: 13.082, lon: 80.270 },
  { name: 'Kochi Estuary', lat: 9.931, lon: 76.267 },
  { name: 'Panaji Goa', lat: 15.498, lon: 73.827 }
];

export default function LocationSelector({ currentSector, onSelectSector, onClose }) {
  // kept onUpdateSector as a deprecated alias so older call sites do not crash
  const onUpdateSector = onSelectSector;
  const [selectedCity, setSelectedCity] = useState(currentSector.city_name);
  const [customLat, setCustomLat] = useState(currentSector.center_lat);
  const [customLon, setCustomLon] = useState(currentSector.center_lon);
  const [loading, setLoading] = useState(false);

  const applySector = async (cityName, lat, lon) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/sector/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city_name: cityName,
          center_lat: parseFloat(lat),
          center_lon: parseFloat(lon),
          step_deg: 0.0025
        })
      });
      const json = await res.json();
      onUpdateSector && onUpdateSector({
        city_name: cityName,
        center_lat: parseFloat(lat),
        center_lon: parseFloat(lon)
      });
      setLoading(false);
      onClose();
    } catch (err) {
      console.error("Failed to update sector:", err);
      setLoading(false);
    }
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        setCustomLat(lat);
        setCustomLon(lon);
        applySector("Current GPS Location", lat, lon);
      },
      (err) => {
        alert("GPS location access denied.");
        setLoading(false);
      }
    );
  };

  return (
    <div className="location-modal-backdrop">
      <div className="location-modal hud-panel">
        <div className="modal-header">
          <h3><MapPin size={18} style={{ color: 'var(--signal)' }} /> Admin Sector / Geo-Location Config</h3>
          <button className="close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="gps-quick-btn-wrapper">
            <button
              type="button"
              className="gps-btn"
              onClick={handleUseGPS}
              disabled={loading}
            >
              <Navigation size={15} /> Use My Current GPS Location
            </button>
          </div>

          <div className="preset-city-section">
            <span className="section-label">POPULAR COASTAL SECTOR PRESETS</span>
            <div className="city-grid">
              {PRESET_CITIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={selectedCity === c.name ? 'city-chip active' : 'city-chip'}
                  onClick={() => {
                    setSelectedCity(c.name);
                    setCustomLat(c.lat);
                    setCustomLon(c.lon);
                    applySector(c.name, c.lat, c.lon);
                  }}
                >
                  <Compass size={13} className="chip-icon" />
                  <span>
                    {c.name}
                    <span className="chip-sub">{c.lat.toFixed(3)}°, {c.lon.toFixed(3)}°</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="custom-coords-section">
            <span className="section-label">CUSTOM LATITUDE & LONGITUDE</span>
            <div className="coords-inputs">
              <div className="coords-input-group">
                <small>Latitude (Center)</small>
                <input
                  type="number"
                  step="0.0001"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  aria-label="Center latitude"
                />
              </div>
              <div className="coords-input-group">
                <small>Longitude (Center)</small>
                <input
                  type="number"
                  step="0.0001"
                  value={customLon}
                  onChange={(e) => setCustomLon(e.target.value)}
                  aria-label="Center longitude"
                />
              </div>
            </div>
            <button
              type="button"
              className="apply-custom-btn"
              onClick={() => applySector("Custom Geo-Location", customLat, customLon)}
              disabled={loading || !customLat || !customLon}
            >
              {loading ? 'Re-generating 250m Grid Mesh...' : <><Check size={14} /> Deploy Custom Sector Mesh</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
