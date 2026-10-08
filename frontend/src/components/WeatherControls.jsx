import React from 'react';
import { Radio, Sliders, Zap, CloudRain, Waves, Wind } from 'lucide-react';

export default function WeatherControls({
  weather,
  setWeather,
  isLive,
  setIsLive,
  onRefreshLive
}) {
  const PRESETS = {
    normal: { rain_1h: 5, rain_3h: 12, rain_6h: 20, tide_height_msl: 0.8, tide_trend: 0.05, wave_height_m: 0.8, wind_speed_kmh: 15 },
    moderate: { rain_1h: 25, rain_3h: 55, rain_6h: 80, tide_height_msl: 1.8, tide_trend: 0.1, wave_height_m: 1.4, wind_speed_kmh: 28 },
    severe: { rain_1h: 60, rain_3h: 115, rain_6h: 160, tide_height_msl: 2.75, tide_trend: 0.15, wave_height_m: 2.1, wind_speed_kmh: 42 }
  };

  const applyPreset = (key) => {
    setIsLive(false);
    setWeather(PRESETS[key]);
  };

  return (
    <div className="weather-controls-card">
      <div className="controls-header">
        <div className="mode-toggle">
          <button
            className={isLive ? 'mode-btn active' : 'mode-btn'}
            onClick={() => { setIsLive(true); onRefreshLive(); }}
          >
            <Radio size={14} className="icon-pulse" /> Live Telemetry
          </button>
          <button
            className={!isLive ? 'mode-btn active' : 'mode-btn'}
            onClick={() => setIsLive(false)}
          >
            <Sliders size={14} /> Simulation Engine
          </button>
        </div>

        <div className="preset-buttons">
          <button onClick={() => applyPreset('normal')}>Baseline Weather</button>
          <button onClick={() => applyPreset('moderate')}>Moderate Monsoon</button>
          <button className="danger-preset" onClick={() => applyPreset('severe')}>
            <Zap size={13} /> Severe Surge Scenario
          </button>
        </div>
      </div>

      <div className="sliders-grid">
        <div className="slider-group">
          <label>
            <span className="label-with-icon"><CloudRain size={14} /> 3h Rainfall</span>
            <strong>{weather.rain_3h} mm</strong>
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={weather.rain_3h}
            disabled={isLive}
            onChange={(e) => {
              const val = Number(e.target.value);
              setWeather(w => ({ ...w, rain_3h: val, rain_1h: Math.round(val / 2), rain_6h: Math.round(val * 1.4) }));
            }}
          />
        </div>

        <div className="slider-group">
          <label>
            <span className="label-with-icon"><Waves size={14} /> Tide Elevation</span>
            <strong>{weather.tide_height_msl} m MSL</strong>
          </label>
          <input
            type="range"
            min="-0.5"
            max="3.5"
            step="0.1"
            value={weather.tide_height_msl}
            disabled={isLive}
            onChange={(e) => setWeather(w => ({ ...w, tide_height_msl: Number(e.target.value) }))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span className="label-with-icon"><Waves size={14} /> Wave Height</span>
            <strong>{weather.wave_height_m} m</strong>
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={weather.wave_height_m}
            disabled={isLive}
            onChange={(e) => setWeather(w => ({ ...w, wave_height_m: Number(e.target.value) }))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span className="label-with-icon"><Wind size={14} /> Wind Speed</span>
            <strong>{weather.wind_speed_kmh} km/h</strong>
          </label>
          <input
            type="range"
            min="0"
            max="90"
            value={weather.wind_speed_kmh}
            disabled={isLive}
            onChange={(e) => setWeather(w => ({ ...w, wind_speed_kmh: Number(e.target.value) }))}
          />
        </div>
      </div>
    </div>
  );
}
