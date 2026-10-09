import React, { useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { FlaskConical, CloudRain, Waves, LifeBuoy, Layers, Sparkles, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

function riskColor(r) {
  return r === 'HIGH' ? '#e11d48' : r === 'MEDIUM' ? '#d97706' : '#059669';
}

// ponytail: isolated sandbox view — own MapContainer, no shared map state.
export default function SandboxPanel({ weather, sector }) {
  const [iv, setIv] = useState({ rain_delta_mm: 0, tide_delta_m: 0, pump_depth_relief_m: 0.3, sandbag_elev_gain_m: 0.5, target: 'high_only' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('scenario'); // 'baseline' | 'scenario'
  const [runId, setRunId] = useState(0);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/sandbox/compare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather, intervention: iv })
      });
      setResult(await res.json());
      setRunId(r => r + 1);
      setMode('scenario');
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const zones = result ? (mode === 'baseline' ? result.baseline : result.scenario) : [];
  const center = [sector?.center_lat || 12.835, sector?.center_lon || 74.845];
  const style = (f) => ({ fillColor: riskColor(f?.properties?.risk), weight: 1, color: '#fff', fillOpacity: 0.55 });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, height: '100%' }}>
      <style>{`.sandbox-slider input[type="range"]{ -webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:999px; background:linear-gradient(90deg, var(--hydro) var(--fill,50%), var(--bg-inset) var(--fill,50%)); outline:none; cursor:pointer; border:1px solid var(--border-color); }
.sandbox-slider input[type="range"]::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#fff; border:2px solid var(--hydro); box-shadow:0 1px 4px rgba(0,0,0,.25); cursor:grab; }
.sandbox-slider input[type="range"]::-moz-range-thumb{ width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid var(--hydro); box-shadow:0 1px 4px rgba(0,0,0,.25); cursor:grab; }`}</style>
      <div style={{ background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16, overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'var(--hydro-bg)', color: 'var(--hydro)' }}>
            <FlaskConical size={17} />
          </span>
          What-If Action Sandbox
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Simulated intervention — simplified depth shift, not guaranteed.</p>
        {[
          ['rain_delta_mm', 'Extra rain', CloudRain, -50, 100, 5, 'mm'],
          ['tide_delta_m', 'Tide shift', Waves, -1, 1, 0.1, 'm'],
          ['pump_depth_relief_m', 'Mobile pumps relief', LifeBuoy, 0, 1, 0.1, 'm'],
          ['sandbag_elev_gain_m', 'Sandbags / bunds', Layers, 0, 1, 0.1, 'm'],
        ].map(([k, label, Icon, min, max, step, unit]) => (
          <label key={k} className="sandbox-slider" style={{ display: 'block', margin: '12px 0', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontWeight: 500 }}>
              <Icon size={14} style={{ color: 'var(--hydro)' }} /> {label}
              <b className="mono" style={{ marginLeft: 'auto', color: 'var(--text-1)' }}>{iv[k]}{unit}</b>
            </span>
            <input type="range" min={min} max={max} step={step} value={iv[k]}
              onChange={e => setIv({ ...iv, [k]: parseFloat(e.target.value) })}
              style={{ marginTop: 6, ['--fill']: `${((iv[k] - min) / (max - min)) * 100}%` }} />
          </label>
        ))}
        <label style={{ fontSize: 13 }}>Apply works to:
          <select value={iv.target} onChange={e => setIv({ ...iv, target: e.target.value })} style={{ marginLeft: 8 }}>
            <option value="high_only">HIGH zones only</option>
            <option value="all">All zones</option>
          </select>
        </label>
        <button onClick={run} disabled={loading} style={{ marginTop: 12, width: '100%', padding: 10, borderRadius: 8, background: 'var(--hydro)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Running…' : 'Compare scenarios'}
        </button>
        {result && (
          <div style={{ marginTop: 12, fontSize: 13, background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 10, color: 'var(--text-1)' }}>
            <div>HIGH: {result.baseline_summary.high} → <b>{result.scenario_summary.high}</b> (saved {result.high_saved})</div>
            <div>Zones improved: <b>{result.zones_improved}</b></div>
            <div>Avg depth: {result.baseline_summary.avg_depth_med}m → {result.scenario_summary.avg_depth_med}m</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setMode('baseline')} style={{ marginRight: 6, background: mode === 'baseline' ? 'var(--text-2)' : 'var(--bg-card-hover)', color: mode === 'baseline' ? '#fff' : 'var(--text-1)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px' }}>Baseline</button>
              <button onClick={() => setMode('scenario')} style={{ background: mode === 'scenario' ? 'var(--sev-safe)' : 'var(--bg-card-hover)', color: mode === 'scenario' ? '#fff' : 'var(--text-1)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px' }}>With action</button>
            </div>
          </div>
        )}
        {result?.ai_briefing && (
          <div style={{ marginTop: 12, fontSize: 13, background: 'var(--signal-bg)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 10, color: 'var(--text-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
              <Sparkles size={14} style={{ color: 'var(--signal)' }} /> Local AI severity brief
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{result.ai_briefing.model}</span>
            </div>
            <div>{result.ai_briefing.text}</div>
          </div>
        )}
        {result?.refuges?.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6, color: 'var(--text-1)' }}>
              <MapPin size={14} style={{ color: 'var(--sev-safe)' }} /> Nearest safe refuge per flagged zone
            </div>
            {result.refuges.map(r => (
              <div key={r.from_zone} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 8, marginBottom: 6, color: 'var(--text-1)' }}>
                <div><b className="mono">{r.from_zone}</b> ({r.depth_med}m, onset {r.onset_hours}h) → <b className="mono" style={{ color: 'var(--sev-safe)' }}>{r.refuge_zone}</b></div>
                <div style={{ color: 'var(--text-2)' }}>Flag: {r.flag_reason}</div>
                <div style={{ color: 'var(--text-2)' }}>{r.distance_m}m · ~{r.walk_eta_min} min walk</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 480 }}>
        <MapContainer center={center} zoom={13} style={{ height: '100%', minHeight: 480, width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {zones.length > 0 && (
            <GeoJSON key={`${mode}-${runId}`} data={{ type: 'FeatureCollection', features: zones.map(z => ({ type: 'Feature', properties: { risk: z.risk_level }, geometry: z.geometry })) }} style={style} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
