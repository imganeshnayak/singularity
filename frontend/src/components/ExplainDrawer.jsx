import React, { useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import DiagnosticChart from './DiagnosticChart';

function AttributionCurve({ contribution }) {
  const value = parseFloat(contribution);
  const positive = value >= 0;
  const amplitude = 7 + Math.min(7, Math.abs(value) * 10);
  const endY = positive ? 21 - amplitude : 21 + amplitude;
  const path = `M 2 21 C 34 21, 52 ${endY + (positive ? 8 : -8)}, 88 ${endY} S 144 ${endY}, 178 ${endY}`;
  const color = positive ? 'var(--sev-breach)' : 'var(--sev-safe)';

  return (
    <svg
      className="shap-curve"
      viewBox="0 0 180 42"
      role="img"
      aria-label={`${contribution} contribution curve`}
    >
      <line x1="2" y1="21" x2="178" y2="21" className="shap-curve-baseline" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="178" cy={endY} r="3" fill={color} />
    </svg>
  );
}

export default function ExplainDrawer({ zone, weather, onClose }) {
  const [explainData, setExplainData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!zone) return;
    setLoading(true);
    fetch(`/api/v1/explain/${zone.zone_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weather)
    })
      .then(res => res.json())
      .then(data => {
        setExplainData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Explain fetch failed:', err);
        setLoading(false);
      });
  }, [zone, weather]);

  if (!zone) return null;

  const getSeverityClass = (prob, depth) => {
    if (depth >= 0.50 || prob >= 0.65) return 'breach';
    if (depth >= 0.25 || prob >= 0.40) return 'warn';
    if (depth >= 0.10 || prob >= 0.20) return 'watch';
    return 'safe';
  };

  const sevClass = getSeverityClass(zone.pred_prob, zone.pred_depth_med);
  const depthRange = zone.pred_depth_hi - zone.pred_depth_lo;
  const uncertainty = depthRange > 0.25 ? 'WIDE RANGE' : depthRange > 0.12 ? 'MEDIUM RANGE' : 'TIGHT RANGE';
  const action = zone.risk_level === 'HIGH'
    ? 'Evacuate low-lying occupants and pre-position responders.'
    : zone.risk_level === 'MEDIUM'
      ? 'Prepare shelter access and monitor the route closely.'
      : 'Continue monitoring and verify local conditions.';
  const onsetText = zone.onset_hours < 24 ? `In approximately ${zone.onset_hours.toFixed(1)} hours` : 'Not expected this cycle';
  const peakText = zone.peak_hours < 24 ? `Peak in ${zone.peak_hours.toFixed(1)} hours` : 'Peak beyond forecast window';

  return (
    <aside className="explain-drawer">
      <div className="drawer-header">
        <div>
          <h3>Zone Inspector: <strong className="mono">{zone.zone_id}</strong></h3>
          <span className={`sev-badge ${sevClass}`}>
            {zone.risk_level} RISK · <span className="mono">{Math.round(zone.pred_prob * 100)}% BREACH PROB</span>
          </span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="zone-meta-matrix">
        <div className="meta-item">
          <label>MEDIAN DEPTH</label>
          <val className="mono">{zone.pred_depth_med.toFixed(2)} m</val>
        </div>
        <div className="meta-item">
          <label>CONFIDENCE (80%)</label>
          <val className="mono">{zone.pred_depth_lo.toFixed(2)}m – {zone.pred_depth_hi.toFixed(2)}m</val>
        </div>
        <div className="meta-item">
          <label>ESTIMATED ONSET</label>
          <val className="mono">{zone.onset_hours < 24 ? `${zone.onset_hours.toFixed(1)}h` : 'N/A'}</val>
        </div>
        <div className="meta-item">
          <label>TERRAIN ELEVATION</label>
          <val className="mono">{zone.elevation_m.toFixed(1)} m MSL</val>
        </div>
      </div>

      <section className={`decision-brief ${sevClass}`}>
        <div className="decision-brief-header">
          <span className="decision-kicker">DECISION BRIEF</span>
          <span className="decision-confidence mono">{uncertainty}</span>
        </div>
        <strong>{action}</strong>
        <div className="decision-timing">
          <span><label>ACT</label>{onsetText}</span>
          <span><label>PEAK</label>{peakText}</span>
        </div>
      </section>

      <div className="shap-section-title">
        <Activity size={15} style={{ color: 'var(--signal)' }} /> SHAP Feature Attributions
      </div>

      {loading ? (
        <div className="shap-desc mono">Computing SHAP attributions...</div>
      ) : explainData ? (
        <>
          <div className="shap-factors-list">
            {explainData.top_factors.map((f, i) => (
              <div key={i} className="shap-item">
                <div className="shap-label">
                  <span>{f.factor}</span>
                  <span className={f.contribution.startsWith('+') ? 'shap-val pos' : 'shap-val neg'}>
                    {f.contribution}
                  </span>
                </div>
                <AttributionCurve contribution={f.contribution} />
                <div className="shap-desc">{f.plain_text}</div>
              </div>
            ))}
          </div>

          <div className="diagnostic-card">
            <p><strong>Diagnostic Summary:</strong></p>
            <p>{explainData.summary}</p>

            <DiagnosticChart series={explainData.trend || null} />
          </div>
        </>
      ) : (
        <p className="shap-desc">No attribution data.</p>
      )}
    </aside>
  );
}
