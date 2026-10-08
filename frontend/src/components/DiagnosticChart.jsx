/**
 * Tiny inline SVG sparkline for the diagnostic card.
 * Keeps the existing NLP summary visible and adds live trend context.
 */
import React from 'react';

const W = 168;
const H = 46;
const PAD_L = 10;

// Normalize rainfall (mm) and tide/wave (m) onto one hidden 0-1 span for layout only.
// The real values are shown in the legend and last-value dots.
function sparklinePath(points, _color) {
  if (points.length === 0) return '';
  // Map to SVG coordinates: flip y so "up" = higher value.
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const baseY = H - 6;
  const topY = 6;
  const coords = points.map((v, i) => {
    const x = PAD_L + (i / Math.max(1, points.length - 1)) * (W - PAD_L - 30);
    const y = H - 6 - ((v - min) / range) * (baseY - topY);
    return [x, y];
  });

  let line = '';
  if (coords.length > 0) {
    line = `M${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const p = coords[i];
      const midX = (prev[0] + p[0]) / 2;
      line += ` C${midX.toFixed(1)} ${prev[1].toFixed(1)} ${midX.toFixed(1)} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    }
  }
  const area = line + (coords.length > 0 ? ` L${coords[coords.length - 1][0].toFixed(1)} ${H - 6} L${coords[0][0].toFixed(1)} ${H - 6} Z` : '');
  return {
    line,
    area,
    last: coords[coords.length - 1],
    first: coords[0]
  };
}

export default function DiagnosticChart({ series, color = 'var(--signal)' }) {
  const rainfallSeries = Array.isArray(series?.rainfall) ? series.rainfall : [];
  const tideSeries = Array.isArray(series?.tide) ? series.tide : [];
  const waveSeries = Array.isArray(series?.wave) ? series.wave : [];

  const rainPath = sparklinePath(rainfallSeries, color);
  const tidePath = sparklinePath(tideSeries, 'var(--hydro)');
  const wavePath = sparklinePath(waveSeries, '#0ea5e9');

  // Last value labels: rainfall in mm, tide/wave in meters
  const rainLast = rainfallSeries.length ? rainfallSeries[rainfallSeries.length - 1] : null;
  const tideLast = tideSeries.length ? tideSeries[tideSeries.length - 1] : null;
  const waveLast = waveSeries.length ? waveSeries[waveSeries.length - 1] : null;

  // Render helper: line + optional area + last dot
  const renderSeries = (pathObj, lastVal, unit, strokeColor) => {
    if (!pathObj || !pathObj.line) return null;
    return (
      <g key={unit}>
        <path d={pathObj.area} fill={strokeColor} fillOpacity={0.06} />
        <path d={pathObj.line} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {lastVal != null && (
          <circle cx={pathObj.last[0]} cy={pathObj.last[1]} r={2.2} fill={strokeColor} stroke="#ffffff" strokeWidth={0.8} />
        )}
      </g>
    );
  };

  return (
    <div className="diag-chart-wrap">
      <div className="diag-chart-head">
        <span className="diag-chart-title">HYDROGRAPH (12H)</span>
        <span className="diag-chart-sub">live trend context</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="diag-chart-svg">
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
        {renderSeries(rainPath, rainLast, 'rain', color)}
        {renderSeries(tidePath, tideLast, 'tide', 'var(--hydro)')}
        {renderSeries(wavePath, waveLast, 'wave', '#0ea5e9')}
        {/* subtle gridlines */}
        <line x1={0} y1={H - 6} x2={W - 30} y2={H - 6} stroke="var(--border-color)" strokeWidth={1} />
        <line x1={0} y1={6} x2={W - 30} y2={6} stroke="var(--border-color)" strokeWidth={1} strokeOpacity={0.5} />
      </svg>
      <div className="diag-chart-legend">
        {rainLast != null && <span className="diag-legend-item"><span className="diag-legend-dot" style={{ background: color }} />Rain {rainLast.toFixed(0)} mm</span>}
        {tideLast != null && <span className="diag-legend-item"><span className="diag-legend-dot" style={{ background: 'var(--hydro)' }} />Tide {tideLast.toFixed(2)} m</span>}
        {waveLast != null && <span className="diag-legend-item"><span className="diag-legend-dot" style={{ background: '#0ea5e9' }} />Wave {waveLast.toFixed(2)} m</span>}
      </div>
    </div>
  );
}
