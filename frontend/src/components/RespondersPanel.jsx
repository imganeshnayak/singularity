import React from 'react';
import { Plane, Ship, Truck } from 'lucide-react';

export default function RespondersPanel({ priorities, onSelectZoneById }) {
  if (!priorities || priorities.length === 0) {
    return <div className="responders-panel"><p className="mono">No emergency dispatch priorities logged.</p></div>;
  }

  const getSevClass = (risk) => {
    if (risk === 'HIGH') return 'breach';
    if (risk === 'MEDIUM') return 'warn';
    return 'safe';
  };

  const vehicleIcon = (vehicle) => {
    if (vehicle === 'HELICOPTER') return <Plane size={15} />;
    if (vehicle === 'BOAT') return <Ship size={15} />;
    return <Truck size={15} />;
  };

  return (
    <div className="responders-panel">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px' }}>Emergency Response Priority List</h3>
      <div className="responders-table-container">
        <table className="responders-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>ZONE ID</th>
              <th>SEVERITY</th>
              <th>ONSET</th>
              <th>CRITICAL INFRASTRUCTURE</th>
              <th>DISPATCH ETA</th>
              <th>FASTEST VEHICLE</th>
              <th>PRIORITY INDEX</th>
            </tr>
          </thead>
          <tbody>
            {priorities.slice(0, 15).map((p) => (
              <tr
                key={p.rank}
                onClick={() => onSelectZoneById(p.zone_id)}
              >
                <td><strong className="mono">#{p.rank}</strong></td>
                <td><span className="mono">{p.zone_id}</span></td>
                <td><span className={`sev-badge ${getSevClass(p.risk_level)}`}>{p.risk_level}</span></td>
                <td><span className="mono">{p.onset_hours.toFixed(1)}h</span></td>
                <td>
                  {p.threatened_facilities.length > 0 ? (
                    <span style={{ color: 'var(--sev-breach)', fontWeight: 600 }}>
                      ⚠️ {p.threatened_facilities.join(', ')}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-3)' }}>Residential Sector</span>
                  )}
                </td>
                <td><span className="mono">{p.responder_eta_minutes.toFixed(1)} min</span></td>
                <td>
                  <span className={`vehicle-badge ${p.recommended_vehicle?.toLowerCase()}`}>
                    {vehicleIcon(p.recommended_vehicle)} {p.recommended_vehicle || 'TRUCK'}
                  </span>
                  <small className="vehicle-reason">{p.vehicle_reason}</small>
                </td>
                <td><span className="mono" style={{ color: 'var(--signal)', fontWeight: 700 }}>{p.priority_score.toFixed(3)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
