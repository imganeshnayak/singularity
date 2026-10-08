import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, ShieldAlert } from 'lucide-react';

export default function AlertsPanel({ alerts, onSelectZoneById }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="alerts-panel">
        <div className="inspector-empty" style={{ width: '100%', height: '300px' }}>
          <h4>No Active Early Warnings</h4>
          <p>Current telemetry indicates all sector zones remain below advisory threshold.</p>
        </div>
      </div>
    );
  }

  const getSeverityDotClass = (risk) => {
    if (risk === 'HIGH') return 'breach';
    if (risk === 'MEDIUM') return 'warn';
    return 'safe';
  };

  const highCount = alerts.filter((alert) => alert.risk_level === 'HIGH').length;
  const facilityCount = alerts.reduce((count, alert) => count + (alert.threatened_facilities?.length || 0), 0);

  const TrendIcon = ({ trend }) => {
    if (trend === 'deteriorating') return <ArrowUpRight size={13} />;
    if (trend === 'improving') return <ArrowDownRight size={13} />;
    return <Minus size={13} />;
  };

  return (
    <div className="alerts-panel">
      <div className="alerts-command-header">
        <div>
          <div className="alerts-eyebrow"><ShieldAlert size={13} /> RESPONSE BOARD</div>
          <h3>Early Warning Queue</h3>
          <p>Ranked by risk, urgency, and exposed facilities</p>
        </div>
        <div className="alerts-live-state"><span /> LIVE TRIAGE</div>
      </div>

      <div className="alerts-summary-strip">
        <div><strong>{alerts.length}</strong><span>ACTIVE</span></div>
        <div className="critical"><strong>{highCount}</strong><span>IMMEDIATE</span></div>
        <div><strong>{facilityCount}</strong><span>EXPOSURES</span></div>
      </div>

      <div className="alert-queue">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={`alert-row ${getSeverityDotClass(a.risk_level)}`}
            onClick={() => onSelectZoneById(a.zone_id)}
          >
            <div className="alert-rank mono">{String(i + 1).padStart(2, '0')}</div>
            <div className="alert-content">
              <div className="alert-title-line">
                <span className={`severity-dot ${getSeverityDotClass(a.risk_level)}`} />
                <span className="mono">{a.zone_id}</span>
                <span className="alert-risk-label">{a.risk_level} RISK</span>
                <span className={`alert-trend ${a.trend}`}><TrendIcon trend={a.trend} /> {a.trend || 'stable'}</span>
              </div>
              <div className="alert-metrics">
                <span><b>ACT</b> {a.onset_time_str}</span>
                <span><b>PEAK</b> {a.peak_time_str}</span>
                <span><b>DEPTH</b> {a.depth_med_m?.toFixed(2)}m</span>
                <span><b>RANGE</b> {Math.round(a.uncertainty_pct || 0)}%</span>
              </div>
              <div className="alert-drivers">{a.primary_drivers.join(' + ')}</div>
              <div className="alert-action">{a.recommended_action}</div>
              {a.threatened_facilities?.length > 0 && (
                <div className="alert-exposures">
                  <b>EXPOSED</b> {a.threatened_facilities.join(' · ')}
                </div>
              )}
            </div>
            <div className="alert-open mono">OPEN <span>→</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
