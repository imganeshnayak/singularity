import React, { useEffect, useState } from 'react';
import { X, Activity, Brain, Sparkles, RefreshCw, Cpu } from 'lucide-react';
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

export default function ExplainDrawer({ zone, weather, simHour = 0, onClose }) {
  const [explainData, setExplainData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gemmaData, setGemmaData] = useState(null);
  const [gemmaLoading, setGemmaLoading] = useState(false);

  // Fast SHAP computation
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

  // Local Ollama Gemma 3:4B explanation fetch
  const fetchGemmaExplanation = () => {
    if (!zone) return;
    setGemmaLoading(true);
    fetch(`/api/v1/explain/${zone.zone_id}/gemma`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weather)
    })
      .then(res => res.json())
      .then(data => {
        setGemmaData(data);
        setGemmaLoading(false);
      })
      .catch(err => {
        console.error('Gemma fetch failed:', err);
        setGemmaLoading(false);
      });
  };

  useEffect(() => {
    setGemmaData(null);
    fetchGemmaExplanation();
  }, [zone?.zone_id]);

  if (!zone) return null;

  const getSeverityClass = (prob, depth) => {
    if (depth >= 0.50 || prob >= 0.65) return 'breach';
    if (depth >= 0.25 || prob >= 0.40) return 'warn';
    if (depth >= 0.10 || prob >= 0.20) return 'watch';
    return 'safe';
  };

  const currentSimDepth = zone.sim_depth != null ? zone.sim_depth : (zone.pred_depth_med || 0);
  const sevClass = getSeverityClass(zone.pred_prob, currentSimDepth);
  const depthRange = zone.pred_depth_hi - zone.pred_depth_lo;
  const uncertainty = depthRange > 0.25 ? 'WIDE RANGE' : depthRange > 0.12 ? 'MEDIUM RANGE' : 'TIGHT RANGE';
  const action = zone.risk_level === 'HIGH'
    ? 'Evacuate low-lying occupants and pre-position responders.'
    : zone.risk_level === 'MEDIUM'
      ? 'Prepare shelter access and monitor the route closely.'
      : 'Continue monitoring and verify local conditions.';

  const gemmaActionMatch = gemmaData?.explanation?.match(/action:\s*([^.\n]+)/i);
  const effectiveAction = gemmaActionMatch ? gemmaActionMatch[1].trim() + '.' : (explainData?.ai_action || action);

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
          <label>SIMULATED DEPTH (T+{simHour.toFixed(1)}h)</label>
          <val className="mono signal-breach">{currentSimDepth.toFixed(2)} m</val>
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
          <span className="decision-confidence mono">{gemmaData ? '⚡ GEMMA 3:4B VERIFIED' : uncertainty}</span>
        </div>
        <strong>{effectiveAction}</strong>
        <div className="decision-timing">
          <span><label>ACT</label>{onsetText}</span>
          <span><label>PEAK</label>{peakText}</span>
        </div>
      </section>

      {/* Street Reality & Vehicle Clearance Gauge */}
      <div className="clearance-gauge-card">
        <div className="clearance-header">
          <span className="clearance-title mono">STREET REALITY &amp; PASSABILITY</span>
          <span className="clearance-cm mono">{Math.round(currentSimDepth * 100)} cm WATER</span>
        </div>
        <div className="clearance-modes">
          <div className={`clearance-mode-row ${currentSimDepth >= 0.20 ? 'blocked' : 'passable'}`}>
            <span className="mode-name">🚗 Civilian Sedans / Cars</span>
            <span className="mode-status mono">{currentSimDepth >= 0.20 ? '🔴 IMPASSABLE' : '🟢 PASSABLE'}</span>
          </div>
          <div className={`clearance-mode-row ${currentSimDepth >= 0.45 ? 'blocked' : 'passable'}`}>
            <span className="mode-name">🛻 Emergency 4x4 / Trucks</span>
            <span className="mode-status mono">{currentSimDepth >= 0.45 ? '🔴 BLOCKED (>45cm)' : '🟢 ACCESSIBLE'}</span>
          </div>
          <div className={`clearance-mode-row ${currentSimDepth >= 0.45 ? 'required' : 'standby'}`}>
            <span className="mode-name">🚤 NDRF Inflatable Boats</span>
            <span className="mode-status mono">{currentSimDepth >= 0.45 ? '⚡ MANDATORY CRAFT' : '⚪ SHALLOW RUNOFF'}</span>
          </div>
        </div>
        <div className="clearance-hazard-note mono">
          {currentSimDepth >= 0.60
            ? '⚠️ HAZARD: Ground floor dwellings submerged. Vertical evacuation mandatory.'
            : currentSimDepth >= 0.30
            ? '⚠️ CAUTION: Knee-deep water. De-energize low electrical switchboards.'
            : 'ℹ️ NOTICE: Surface drainage flow within manageable curb threshold.'}
        </div>
      </div>

      <div className="shap-section-title">
        <Activity size={15} style={{ color: 'var(--signal)' }} /> ML EVIDENCE
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

          {/* Gemma 3:4B Local AI Explainability Card */}
          <div className="gemma-ai-card">
            <div className="gemma-header">
              <div className="gemma-title-group">
                <Brain size={15} style={{ color: '#8b5cf6' }} />
                <span className="gemma-title mono">GEMMA 3:4B LOCAL AI INSIGHT</span>
              </div>
              <div className="gemma-badges">
                <span className="gemma-badge-pill mono">
                  <Cpu size={10} /> gemma3:4b
                </span>
                {gemmaData?.latency_sec && (
                  <span className="gemma-latency mono">{gemmaData.latency_sec}s</span>
                )}
                <button
                  className="gemma-reload-btn"
                  onClick={fetchGemmaExplanation}
                  disabled={gemmaLoading}
                  title="Regenerate with Gemma 3:4B"
                >
                  <RefreshCw size={11} className={gemmaLoading ? 'spin-anim' : ''} />
                </button>
              </div>
            </div>

            {gemmaLoading ? (
              <div className="gemma-loading-state mono">
                <Sparkles size={13} className="pulse-icon signal" />
                <span>Local Gemma 3:4B analyzing SHAP drivers &amp; physical flood causality...</span>
              </div>
            ) : gemmaData ? (
              <div className="gemma-body">
                <p className="gemma-text">{gemmaData.explanation}</p>
                <div className="gemma-footer mono">
                  <span>MODEL: gemma3:4b (Ollama local)</span>
                  <span>STATUS: {gemmaData.status}</span>
                </div>
              </div>
            ) : (
              <div className="gemma-body">
                <p className="gemma-text">{explainData.ai_explanation || explainData.summary}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="shap-desc">No attribution data.</p>
      )}
    </aside>
  );
}
