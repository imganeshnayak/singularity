import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Volume2,
  VolumeX,
  Copy,
  Check,
  X,
  Radio,
  Clock,
  AlertTriangle,
  Building2,
  Waves,
  FileText
} from 'lucide-react';

export default function CommandBriefingModal({ weather, onClose }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [copied, setCopied] = useState(false);
  const synthRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/v1/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weather)
    })
      .then((res) => res.json())
      .then((data) => {
        setBriefing(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch command briefing:', err);
        setLoading(false);
      });

    return () => {
      // Clean up speech on unmount
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [weather]);

  /**
   * Generates authentic dual-tone EAS radio chime using standard Web Audio API,
   * then triggers the tactical speech synthesis broadcast.
   */
  const playEmergencyChime = (onChimeEnd) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        onChimeEnd();
        return;
      }
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      // Standard dual emergency warning tones (853Hz & 960Hz)
      osc1.frequency.value = 853;
      osc2.frequency.value = 960;
      osc1.type = 'sine';
      osc2.type = 'sine';

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 0.45);

      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
        onChimeEnd();
      }, 500);
    } catch (e) {
      console.warn('Audio chime fallback:', e);
      onChimeEnd();
    }
  };

  const handleToggleBroadcast = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
      return;
    }

    if (isBroadcasting) {
      window.speechSynthesis.cancel();
      setIsBroadcasting(false);
      return;
    }

    if (!briefing || !briefing.radio_script) return;

    setIsBroadcasting(true);
    playEmergencyChime(() => {
      const utterance = new SpeechSynthesisUtterance(briefing.radio_script);
      utterance.rate = 1.0;
      utterance.pitch = 0.95; // Slightly deeper, authoritative command tone

      // Pick an English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('Daniel'))
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => {
        setIsBroadcasting(false);
      };
      utterance.onerror = () => {
        setIsBroadcasting(false);
      };

      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  };

  const handleCopyMemo = () => {
    if (!briefing) return;
    const text = `${briefing.summary_memo}\n\nTACTICAL DIRECTIVES:\n${briefing.directives.join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="modal-backdrop">
      <div className="briefing-modal-window">
        {/* Modal Header */}
        <div className="briefing-header">
          <div className="briefing-title-group">
            <Radio size={20} className="signal-breach pulse-icon" />
            <div>
              <h3>AI INCIDENT COMMANDER // SITREP</h3>
              <span className="mono briefing-sub">
                {briefing?.incident_code || 'SITREP-ALPHA'} · {briefing?.timestamp_ist || 'LIVE'}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close Briefing">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="briefing-loading mono">
            <ShieldAlert size={28} className="signal pulse-icon" />
            <p>Synthesizing multi-zone hydrodynamic telemetry and dispatch directives...</p>
          </div>
        ) : briefing ? (
          <div className="briefing-body">
            {/* Threat Level Banner */}
            <div className={`threat-banner ${briefing.badge_variant}`}>
              <ShieldAlert size={22} />
              <div className="threat-banner-text">
                <span className="threat-kicker">INCIDENT CLASSIFICATION</span>
                <strong>{briefing.threat_level}</strong>
              </div>
              <div className="golden-window-pill mono">
                <Clock size={14} />
                <span>GOLDEN WINDOW: <strong>{briefing.golden_window_str || `${briefing.golden_window_minutes} MINS`}</strong></span>
              </div>
            </div>

            {/* Quick Metrics Matrix */}
            <div className="briefing-matrix">
              <div className="matrix-card">
                <label>EARLIEST BREACH ONSET</label>
                <val className="mono signal-breach">{briefing.earliest_onset_clock}</val>
                <small>First low-lying road cut-off</small>
              </div>
              <div className="matrix-card">
                <label>PEAK SURGE CREST</label>
                <val className="mono">{briefing.peak_surge_clock}</val>
                <small>High tide compounding crest</small>
              </div>
              <div className="matrix-card">
                <label>CRITICAL INFRASTRUCTURE</label>
                <val className="mono">{briefing.threatened_facilities?.length || 0} ASSETS</val>
                <small>Hospitals & transit nodes</small>
              </div>
              <div className="matrix-card">
                <label>HIGH-RISK SECTORS</label>
                <val className="mono signal-breach">{briefing.high_zones_count} GRIDS</val>
                <small>Depth &gt; 0.45m or Prob &ge; 65%</small>
              </div>
            </div>

            {/* Broadcast Voice Dispatch Toolbar */}
            <div className="audio-dispatch-strip">
              <div className="audio-info">
                <button
                  className={`broadcast-btn ${isBroadcasting ? 'active' : ''}`}
                  onClick={handleToggleBroadcast}
                >
                  {isBroadcasting ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  <span>{isBroadcasting ? 'HALT BROADCAST' : 'BROADCAST RADIO DISPATCH'}</span>
                </button>
                {isBroadcasting && (
                  <div className="audio-waveform-anim">
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                  </div>
                )}
              </div>

              <button className="copy-memo-btn" onClick={handleCopyMemo}>
                {copied ? <Check size={14} className="safe" /> : <Copy size={14} />}
                <span>{copied ? 'COPIED MEMORANDUM' : 'COPY SITREP'}</span>
              </button>
            </div>

            {/* Radio Transcript Preview */}
            <div className="radio-transcript-box">
              <span className="transcript-label mono">
                <Radio size={12} /> RADIO DISPATCH TRANSCRIPT (TRANSMITTED TO FIELD CONVOYS)
              </span>
              <p className="mono transcript-text">{briefing.radio_script}</p>
            </div>

            {/* Tactical Directives List */}
            <div className="directives-section">
              <h4>
                <AlertTriangle size={15} className="signal" /> TACTICAL COMMAND DIRECTIVES
              </h4>
              <ul className="directives-list">
                {briefing.directives.map((dir, i) => (
                  <li key={i} className="directive-item">
                    <span className="directive-index mono">0{i + 1}</span>
                    <span className="directive-text">{dir.substring(3)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Threatened Critical Facilities */}
            {briefing.threatened_facilities?.length > 0 && (
              <div className="facilities-section">
                <h4>
                  <Building2 size={15} style={{ color: 'var(--sev-breach)' }} />
                  THREATENED CRITICAL INFRASTRUCTURE
                </h4>
                <div className="facilities-chips">
                  {briefing.threatened_facilities.map((fac, idx) => (
                    <div key={idx} className="facility-chip mono">
                      <span className="fac-dot" />
                      <strong>{fac.name}</strong>
                      <span className="fac-type">({fac.type})</span>
                      <span className="fac-risk">{fac.risk_level}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="briefing-error">Unable to generate command briefing. Check backend connectivity.</div>
        )}
      </div>
    </div>
  );
}
