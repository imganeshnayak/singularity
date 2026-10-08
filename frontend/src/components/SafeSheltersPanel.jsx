import React from 'react';

export default function SafeSheltersPanel({ routes }) {
  if (!routes || routes.length === 0) {
    return <div className="shelters-panel"><p className="mono">Calculating evacuation routes...</p></div>;
  }

  return (
    <div className="shelters-panel">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px' }}>Reachable Safe Shelters & Civilian ETAs</h3>
      <div className="shelters-grid">
        {routes.map((s, i) => (
          <div key={i} className={`shelter-card ${s.is_reachable ? 'reachable' : 'blocked'}`}>
            <div className="shelter-header">
              <strong style={{ fontSize: '14px' }}>{s.shelter_name}</strong>
              <span className={`sev-badge ${s.is_reachable ? 'safe' : 'breach'}`}>
                {s.is_reachable ? 'REACHABLE' : 'PATH BLOCKED'}
              </span>
            </div>
            <div className="shelter-details">
              <div>
                <small>TRAVEL ETA</small>
                <strong className="mono">{s.eta_minutes.toFixed(1)} mins</strong>
              </div>
              <div>
                <small>DISTANCE</small>
                <strong className="mono">{(s.distance_m / 1000).toFixed(2)} km</strong>
              </div>
              <div>
                <small>CAPACITY</small>
                <strong className="mono">{s.capacity_score}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
