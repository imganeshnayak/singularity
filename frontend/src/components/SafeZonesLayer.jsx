import React, { useMemo } from 'react';
import { CircleMarker, Tooltip } from 'react-leaflet';

// ponytail: background safe-area layer — memoized from zones prop, no fetch,
// so it stays in sync as red/yellow grows without blocking the main render.
export default function SafeZonesLayer({ zones }) {
  const { safe, hasDanger } = useMemo(() => {
    if (!zones) return { safe: [], hasDanger: false };
    const danger = zones.some(z => z.risk_level !== 'LOW');
    const list = zones.filter(z => z.risk_level === 'LOW').map(z => {
      try {
        const coords = z.geometry.coordinates[0];
        const cx = coords.reduce((a, p) => a + p[0], 0) / coords.length;
        const cy = coords.reduce((a, p) => a + p[1], 0) / coords.length;
        return { id: z.zone_id, lat: cy, lon: cx, elev: z.elevation_m };
      } catch { return null; }
    }).filter(Boolean);
    return { safe: list, hasDanger: danger };
  }, [zones]);

  // Calm state (no red/yellow): hide dots — map is already clean and
  // shelter pins show safety. Dots appear only as danger spreads.
  if (!hasDanger || safe.length === 0) return null;
  return (
    <>
      {safe.map(s => (
        <CircleMarker
          key={`safezone_${s.id}`}
          center={[s.lat, s.lon]}
          radius={5}
          pathOptions={{ color: '#059669', weight: 1, fillColor: '#059669', fillOpacity: 0.35 }}
          interactive={true}
        >
          <Tooltip permanent={false} direction="top">
            <strong>{s.id}</strong> — SAFE<br />
            Elevation {s.elev}m · outside red/yellow
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
