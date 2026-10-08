import React, { useState, useEffect, useCallback } from 'react';
import { Agentation } from 'agentation';
import { Map, Bell, Ambulance, ShieldCheck, Sliders, Activity, Info, Clock, AlertTriangle, MapPin, Settings } from 'lucide-react';
import WeatherControls from './components/WeatherControls';
import InteractiveMap from './components/InteractiveMap';
import ExplainDrawer from './components/ExplainDrawer';
import AlertsPanel from './components/AlertsPanel';
import RespondersPanel from './components/RespondersPanel';
import SafeSheltersPanel from './components/SafeSheltersPanel';
import LocationSelector from './components/LocationSelector';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('map'); // 'map', 'responders', 'shelters', 'alerts'
  const [isLive, setIsLive] = useState(true);
  const [activeScenario, setActiveScenario] = useState('live'); // 'live', 'normal', 'moderate', 'severe'
  
  const [currentSector, setCurrentSector] = useState({
    city_name: 'Mangaluru / Ullal Sector',
    center_lat: 12.835,
    center_lon: 74.845
  });
  const [showLocationModal, setShowLocationModal] = useState(false);
  
  const [weather, setWeather] = useState({
    rain_1h: 45.0,
    rain_3h: 85.0,
    rain_6h: 120.0,
    tide_height_msl: 2.1,
    tide_trend: 0.1,
    wave_height_m: 1.5,
    wind_speed_kmh: 32.0
  });

  const [zones, setZones] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [roads, setRoads] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [origin, setOrigin] = useState([currentSector.center_lat, currentSector.center_lon]);
  const [priorities, setPriorities] = useState([]);
  
  const [selectedZone, setSelectedZone] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchAllData = useCallback(async (currentWeather, sectorOverride = null, originOverride = null) => {
    const sectorToUse = sectorOverride || currentSector;
    const routeOrigin = originOverride || [sectorToUse.center_lat, sectorToUse.center_lon];
    setLoading(true);
    try {
      if (isLive) {
        const liveRes = await fetch('/api/v1/live');
        const liveJson = await liveRes.json();
        setWeather(liveJson.weather);
        setZones(liveJson.zones || []);
        currentWeather = liveJson.weather;
      } else {
        const simRes = await fetch('/api/v1/forecast/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentWeather)
        });
        const simJson = await simRes.json();
        setZones(simJson || []);
      }

      const [alertsRes, bldgRes, roadsRes, routesRes, respRes] = await Promise.all([
        fetch('/api/v1/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentWeather) }),
        fetch('/api/v1/map/buildings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentWeather) }),
        fetch('/api/v1/map/roads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentWeather) }),
        fetch('/api/v1/routes/safe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin_lat: routeOrigin[0],
            origin_lon: routeOrigin[1],
            weather: currentWeather
          })
        }),
        fetch('/api/v1/routes/responders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentWeather) })
      ]);

      setAlerts(await alertsRes.json());
      const bData = await bldgRes.json();
      setBuildings(bData.facilities || []);
      const rData = await roadsRes.json();
      setRoads(rData.roads || []);
      setRoutes(await routesRes.json());
      setPriorities(await respRes.json());
      setLastUpdated(new Date());

    } catch (err) {
      console.error("Data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [isLive, currentSector]);

  useEffect(() => {
    fetchAllData(weather);
    if (!isLive) return;
    const interval = setInterval(() => fetchAllData(weather), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isLive, fetchAllData]);

  const handleSelectScenario = (key) => {
    if (key === 'live') {
      setIsLive(true);
      setActiveScenario('live');
      fetchAllData(weather);
      return;
    }
    setIsLive(false);
    setActiveScenario(key);
    const PRESETS = {
      normal: { rain_1h: 5, rain_3h: 12, rain_6h: 20, tide_height_msl: 0.8, tide_trend: 0.05, wave_height_m: 0.8, wind_speed_kmh: 15 },
      moderate: { rain_1h: 25, rain_3h: 55, rain_6h: 80, tide_height_msl: 1.8, tide_trend: 0.1, wave_height_m: 1.4, wind_speed_kmh: 28 },
      severe: { rain_1h: 60, rain_3h: 115, rain_6h: 160, tide_height_msl: 2.75, tide_trend: 0.15, wave_height_m: 2.1, wind_speed_kmh: 42 }
    };
    const newW = PRESETS[key];
    setWeather(newW);
    fetchAllData(newW);
  };

  const handleSelectZoneById = (zid) => {
    const found = zones.find(z => z.zone_id === zid);
    if (found) {
      setSelectedZone(found);
      setActiveTab('map');
    }
  };

  const formatTimeIST = (date) => {
    if (!date) return '19:40:00 IST';
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${mins}:${secs} IST`;
  };

  const highRiskCount = zones.filter(z => z.risk_level === 'HIGH').length;

  const handleSectorChange = async (sectorData) => {
    setCurrentSector(sectorData);
    const nextOrigin = [sectorData.center_lat, sectorData.center_lon];
    setOrigin(nextOrigin);
    setZones([]);
    setRoads([]);
    setBuildings([]);
    setRoutes([]);
    setShowLocationModal(false);
    try {
      await fetch('/api/v1/sector/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sectorData)
      });
      fetchAllData(weather, sectorData, nextOrigin);
    } catch (err) {
      console.error("Error setting sector:", err);
    }
  };

  const handleOriginChange = async (nextOrigin) => {
    setOrigin(nextOrigin);
    try {
      const routesRes = await fetch('/api/v1/routes/safe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_lat: nextOrigin[0],
          origin_lon: nextOrigin[1],
          weather
        })
      });
      if (!routesRes.ok) throw new Error(`Route request failed: ${routesRes.status}`);
      setRoutes(await routesRes.json());
    } catch (err) {
      console.error('Origin route update error:', err);
    }
  };

  return (
    <div className="app-layout">
      {/* Side Navigation Panel (Left Sidebar) */}
      <aside className="side-nav">
        <div className="sidebar-top">
          <div className="brand-mark-group">
            <svg className="brand-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
              <path d="M2 12c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
              <path d="M12 2l8 18H4L12 2z" fill="var(--signal)" fillOpacity="0.2" />
            </svg>
            <div className="brand-title">
              FLOODSIGHT AI
              <small>Coastal Intelligence</small>
            </div>
          </div>

          <div className="sector-badge-container">
            <button className="sector-config-btn" onClick={() => setShowLocationModal(true)}>
              <MapPin size={14} className="signal" />
              <span className="sector-name">{currentSector.city_name || 'Custom Sector'}</span>
              <Settings size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
          </div>

          <nav className="nav-menu">
            <button className={activeTab === 'map' ? 'nav-menu-item active' : 'nav-menu-item'} onClick={() => setActiveTab('map')}>
              <span className="nav-menu-item-left">
                <Map size={16} /> Flood Map
              </span>
            </button>

            <button className={activeTab === 'alerts' ? 'nav-menu-item active' : 'nav-menu-item'} onClick={() => setActiveTab('alerts')}>
              <span className="nav-menu-item-left">
                <Bell size={16} /> Early Warnings
              </span>
              {alerts.length > 0 && <span className="count-pill">{alerts.length}</span>}
            </button>

            <button className={activeTab === 'responders' ? 'nav-menu-item active' : 'nav-menu-item'} onClick={() => setActiveTab('responders')}>
              <span className="nav-menu-item-left">
                <Ambulance size={16} /> Responders
              </span>
            </button>

            <button className={activeTab === 'shelters' ? 'nav-menu-item active' : 'nav-menu-item'} onClick={() => setActiveTab('shelters')}>
              <span className="nav-menu-item-left">
                <ShieldCheck size={16} /> Safe Shelters
              </span>
            </button>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-section-label">SCENARIO PRESETS</div>
          <div className="scenario-segmented-vertical">
            <button className={activeScenario === 'live' ? 'seg-btn-vertical active' : 'seg-btn-vertical'} onClick={() => handleSelectScenario('live')}>
              <span>Live Feed</span> <span className="mono">REAL</span>
            </button>
            <button className={activeScenario === 'normal' ? 'seg-btn-vertical active' : 'seg-btn-vertical'} onClick={() => handleSelectScenario('normal')}>
              <span>Baseline</span> <span className="mono">05mm</span>
            </button>
            <button className={activeScenario === 'moderate' ? 'seg-btn-vertical active' : 'seg-btn-vertical'} onClick={() => handleSelectScenario('moderate')}>
              <span>Moderate</span> <span className="mono">55mm</span>
            </button>
            <button className={activeScenario === 'severe' ? 'seg-btn-vertical active' : 'seg-btn-vertical'} onClick={() => handleSelectScenario('severe')}>
              <span>Severe Surge</span> <span className="mono">115mm</span>
            </button>
          </div>

          <div className={isLive ? 'mode-indicator live' : 'mode-indicator sim'}>
            {isLive ? (
              <><span className="live-pulse-dot" /> LIVE TELEMETRY</>
            ) : (
              <><Sliders size={12} /> SIMULATION</>
            )}
          </div>
        </div>
      </aside>

      {/* Main Viewport (Right Side) */}
      <div className="main-viewport">
        {/* Top Telemetry Strip */}
        <div className="telemetry-strip">
          <div className="telemetry-item">
            <span className="telemetry-label">SECTOR</span>
            <span className="telemetry-val mono signal">{currentSector.city_name}</span>
          </div>
          <span className="telemetry-divider">·</span>
          <div className="telemetry-item">
            <span className="telemetry-label">RAIN 3H</span>
            <span className="telemetry-val mono">{String(Math.round(weather.rain_3h)).padStart(3, '0')}.0 mm</span>
          </div>
          <span className="telemetry-divider">·</span>
          <div className="telemetry-item">
            <span className="telemetry-label">TIDE</span>
            <span className="telemetry-val mono">{weather.tide_height_msl.toFixed(2)} m MSL</span>
          </div>
          <span className="telemetry-divider">·</span>
          <div className="telemetry-item">
            <span className="telemetry-label">WAVE</span>
            <span className="telemetry-val mono">{weather.wave_height_m.toFixed(2)} m</span>
          </div>
          <span className="telemetry-divider">·</span>
          <div className="telemetry-item">
            <span className="telemetry-label">WIND</span>
            <span className="telemetry-val mono">{String(Math.round(weather.wind_speed_kmh)).padStart(3, '0')} km/h</span>
          </div>
          <span className="telemetry-divider">·</span>
          <div className="telemetry-item">
            <span className="telemetry-label">HIGH RISK ZONES</span>
            <span className={`telemetry-val mono ${highRiskCount > 0 ? 'breach' : ''}`}>{highRiskCount} / {zones.length}</span>
          </div>
          <span className="telemetry-divider">·</span>
          <div className="telemetry-item">
            <span className="telemetry-label">LAST UPDATED</span>
            <span className="telemetry-val mono signal">{formatTimeIST(lastUpdated)}</span>
          </div>
        </div>

        {!isLive && (
          <WeatherControls
            weather={weather}
            setWeather={(newW) => {
              setWeather(newW);
              fetchAllData(typeof newW === 'function' ? newW(weather) : newW);
            }}
            isLive={isLive}
            setIsLive={setIsLive}
            onRefreshLive={() => fetchAllData(weather)}
          />
        )}

        {/* Main Workspace */}
        <main className="main-content">
          {activeTab === 'map' && (
            <div className="map-view-split">
              <InteractiveMap
                zones={zones}
                roads={roads}
                buildings={buildings}
                routes={routes}
                origin={origin}
                onOriginChange={handleOriginChange}
                selectedZone={selectedZone}
                onSelectZone={setSelectedZone}
                currentSector={currentSector}
              />

              {selectedZone ? (
                <ExplainDrawer
                  zone={selectedZone}
                  weather={weather}
                  onClose={() => setSelectedZone(null)}
                />
              ) : (
                <div className="inspector-empty">
                  <Activity size={24} style={{ color: 'var(--text-3)' }} />
                  <h4>Zone Inspector</h4>
                  <p>Select any zone polygon on the map to inspect live hydraulic parameters, water depth uncertainty ranges, and SHAP driver attributions.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'alerts' && (
            <AlertsPanel alerts={alerts} onSelectZoneById={handleSelectZoneById} />
          )}

          {activeTab === 'responders' && (
            <RespondersPanel priorities={priorities} onSelectZoneById={handleSelectZoneById} />
          )}

          {activeTab === 'shelters' && (
            <SafeSheltersPanel routes={routes} />
          )}
        </main>
      </div>

      {showLocationModal && (
        <LocationSelector
          currentSector={currentSector}
          onUpdateSector={handleSectorChange}
          onClose={() => setShowLocationModal(false)}
        />
      )}

      <Agentation />
    </div>
  );
}
