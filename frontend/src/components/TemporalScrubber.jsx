import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Clock, AlertCircle, Waves } from 'lucide-react';

/**
 * Calculates simulated water depth (m) for a zone at a specific forecast hour t.
 * Models physically realistic hydrodynamic progression:
 * 1. Pre-onset: baseline runoff / dry
 * 2. Onset -> Peak: smooth sinusoidal surge escalation up to predicted median depth
 * 3. Post-peak: gradual drainage / recession
 */
export function calculateInundationAtHour(zone, t) {
  if (!zone) return 0;

  const elev = zone.elevation_m != null ? Number(zone.elevation_m) : 3.0;
  const distCoast = zone.dist_coast_m != null ? Number(zone.dist_coast_m) : 2000;
  let maxDepth = Number(zone.pred_depth_med) || 0;

  // In coastal low-lying terrain (<= 3.2m), calculate hydrodynamic tidal head intrusion
  // even if baseline rain is low, simulating storm/tide inundation over the 12h horizon
  if (maxDepth <= 0.05 && elev <= 3.2) {
    const proximity = Math.max(0.3, 1.0 - (distCoast / 4500));
    maxDepth = Math.max(0.08, (3.2 - elev) * 0.35 * proximity);
  }

  // Physical onset and peak timing
  let onset = (zone.onset_hours != null && zone.onset_hours < 20)
    ? Number(zone.onset_hours)
    : Math.max(0.5, Math.min(6.0, 0.8 + (elev - 0.5) * 1.1));

  let peak = (zone.peak_hours != null && zone.peak_hours < 20 && zone.peak_hours > onset)
    ? Number(zone.peak_hours)
    : onset + 2.2;

  if (maxDepth <= 0.02) return 0;

  // T=0: baseline runoff
  if (t <= 0) {
    return Math.max(0, maxDepth * 0.05);
  }

  // Phase 1: Pre-onset (rising runoff)
  if (t < onset) {
    const preRatio = onset > 0 ? (t / onset) : 0;
    return Math.max(0, maxDepth * (0.05 + 0.15 * preRatio));
  }

  // Phase 2: Rising surge (onset -> peak)
  if (t <= peak) {
    const progress = (t - onset) / Math.max(0.3, peak - onset);
    const curve = Math.sin((progress * Math.PI) / 2); // 0 -> 1 smooth sinusoidal surge
    return Math.max(0, maxDepth * (0.20 + 0.80 * curve));
  }

  // Phase 3: Receding drainage post-peak (~7h recession)
  const recessionHours = 7.0;
  const elapsed = t - peak;
  const drainRatio = Math.max(0.05, 1.0 - 0.80 * (elapsed / recessionHours));
  return Math.max(0, maxDepth * drainRatio);
}

export default function TemporalScrubber({
  simHour,
  onChangeHour,
  earliestOnset = 2.5,
  peakSurge = 4.5,
  activeBreachCount = 0,
  totalRiskCount = 0,
  baseTime = new Date()
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const animRef = useRef(null);

  // Calculate simulated clock time
  const simDate = new Date(baseTime.getTime() + simHour * 3600 * 1000);
  const clockStr = `${String(simDate.getHours()).padStart(2, '0')}:${String(simDate.getMinutes()).padStart(2, '0')} IST`;

  // Determine stage label
  let stageLabel = 'BASELINE RUNOFF';
  let stageClass = 'safe';
  if (simHour >= peakSurge) {
    stageLabel = 'RECEDING / POST-SURGE';
    stageClass = 'watch';
  } else if (simHour >= earliestOnset) {
    stageLabel = 'ACTIVE SURGE / INUNDATION';
    stageClass = 'breach';
  } else if (simHour > 0) {
    stageLabel = 'TIDAL RUNUP / PRE-ONSET';
    stageClass = 'warn';
  }

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) clearInterval(animRef.current);
      return;
    }

    const intervalMs = 250 / speed;
    animRef.current = setInterval(() => {
      onChangeHour((prev) => {
        const next = Math.round((prev + 0.25) * 10) / 10;
        if (next > 12.0) {
          setIsPlaying(false);
          return 12.0;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [isPlaying, speed, onChangeHour]);

  const handleReset = () => {
    setIsPlaying(false);
    onChangeHour(0);
  };

  const handleJump = (target) => {
    setIsPlaying(false);
    onChangeHour(Math.max(0, Math.min(12, target)));
  };

  return (
    <div className="temporal-scrubber-hud hud-panel">
      <div className="scrubber-top-row">
        <div className="scrubber-clock-group">
          <div className="scrubber-live-indicator">
            <span className={`pulse-dot ${isPlaying ? 'active' : ''}`} />
            <Clock size={13} style={{ opacity: 0.7 }} />
            <span className="scrubber-clock mono">{clockStr}</span>
            <span className="scrubber-delta mono signal">T+{simHour.toFixed(1)}h</span>
          </div>
          <span className={`scrubber-stage-badge ${stageClass}`}>{stageLabel}</span>
        </div>

        <div className="scrubber-stats mono">
          <Waves size={13} style={{ color: 'var(--sev-breach)' }} />
          <span>Active Inundated Grids:</span>
          <strong className={activeBreachCount > 0 ? 'signal-breach' : ''}>
            {activeBreachCount} / {totalRiskCount}
          </strong>
        </div>

        <div className="scrubber-controls">
          <button
            className="hud-ctrl-btn"
            onClick={handleReset}
            title="Reset to T+0h"
            aria-label="Reset to T+0h"
          >
            <RotateCcw size={13} />
          </button>

          <button
            className={`hud-ctrl-btn primary ${isPlaying ? 'playing' : ''}`}
            onClick={() => {
              if (!isPlaying && simHour >= 12.0) {
                onChangeHour(0);
              }
              setIsPlaying(!isPlaying);
            }}
            title={isPlaying ? 'Pause Simulation' : 'Play 4D Temporal Inundation'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY 4D'}</span>
          </button>

          <button
            className="hud-ctrl-btn speed-toggle"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            title="Toggle playback speed"
          >
            <FastForward size={12} />
            <span className="mono">{speed}x</span>
          </button>
        </div>
      </div>

      {/* Timeline Slider Track */}
      <div className="scrubber-slider-container">
        <input
          type="range"
          min="0"
          max="12"
          step="0.1"
          value={simHour}
          onChange={(e) => {
            setIsPlaying(false);
            onChangeHour(parseFloat(e.target.value));
          }}
          className="scrubber-range-slider"
          aria-label="Temporal Flood Clock Slider"
        />

        {/* Milestone Tick Markers */}
        <div className="scrubber-milestones">
          <button className={`milestone-btn ${simHour === 0 ? 'active' : ''}`} onClick={() => handleJump(0)}>
            <span>Now (T+0)</span>
          </button>
          <button
            className={`milestone-btn ${Math.abs(simHour - earliestOnset) < 0.3 ? 'active onset' : ''}`}
            onClick={() => handleJump(earliestOnset)}
          >
            <span>Onset (~T+{earliestOnset.toFixed(1)}h)</span>
          </button>
          <button
            className={`milestone-btn ${Math.abs(simHour - peakSurge) < 0.3 ? 'active peak' : ''}`}
            onClick={() => handleJump(peakSurge)}
          >
            <span>Peak Surge (~T+{peakSurge.toFixed(1)}h)</span>
          </button>
          <button className={`milestone-btn ${simHour >= 8 ? 'active' : ''}`} onClick={() => handleJump(8.0)}>
            <span>Receding (T+8h)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
