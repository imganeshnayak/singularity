"""
Live Data Fetcher — Open-Meteo Weather & Marine API integration
"""

import time
import requests
import numpy as np
from datetime import datetime
from typing import Dict, Any

CENTER_LAT = 12.835
CENTER_LON = 74.845

_cache: Dict[str, Any] = {}
CACHE_TTL = 600.0  # 10 minutes cache TTL


def fetch_live_weather(lat: float = CENTER_LAT, lon: float = CENTER_LON) -> Dict[str, Any]:
    """Fetches real-time weather & marine features for given latitude and longitude."""
    global _cache
    now_ts = time.time()
    cache_key = f"{round(lat, 3)}_{round(lon, 3)}"

    if cache_key in _cache and (now_ts - _cache[cache_key]["_ts"] < CACHE_TTL):
        return _cache[cache_key]["data"]

    target_lat = lat
    target_lon = lon

    try:
        # 1. Hourly Precipitation & Wind Speed
        w = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": target_lat,
                "longitude": target_lon,
                "hourly": ["rain", "wind_speed_10m"],
                "past_hours": 6,
                "forecast_days": 1,
                "timezone": "Asia/Kolkata"
            },
            timeout=10
        ).json()

        times = [datetime.fromisoformat(t) for t in w["hourly"]["time"]]
        rains = w["hourly"]["rain"]
        winds = w["hourly"]["wind_speed_10m"]

        now_dt = datetime.now()
        # Filter up to current hour
        valid_indices = [i for i, t in enumerate(times) if t <= now_dt]
        if not valid_indices:
            valid_indices = [-1]

        cur_idx = valid_indices[-1]
        rain_1h = float(rains[cur_idx]) if rains[cur_idx] is not None else 0.0
        
        # 3h & 6h sums
        start_3h = max(0, cur_idx - 2)
        start_6h = max(0, cur_idx - 5)
        rain_3h = float(sum([r for r in rains[start_3h:cur_idx + 1] if r is not None]))
        rain_6h = float(sum([r for r in rains[start_6h:cur_idx + 1] if r is not None]))
        wind_speed = float(winds[cur_idx]) if winds[cur_idx] is not None else 15.0

    except Exception as e:
        print(f"Warning: Live weather fetch failed ({e}). Using default storm parameters.")
        rain_1h, rain_3h, rain_6h, wind_speed = 45.0, 85.0, 120.0, 35.0

    try:
        # 2. Marine Wave Height
        m = requests.get(
            "https://marine-api.open-meteo.com/v1/marine",
            params={
                "latitude": target_lat,
                "longitude": target_lon,
                "hourly": ["wave_height"],
                "past_hours": 2,
                "forecast_days": 1,
                "timezone": "Asia/Kolkata"
            },
            timeout=10
        ).json()
        wave_height = float(m["hourly"]["wave_height"][0]) if m.get("hourly", {}).get("wave_height") else 1.2
    except Exception:
        wave_height = 1.2

    # 3. Semi-diurnal Tide calculation based on current time
    h = datetime.now().hour + datetime.now().minute / 60.0
    tide = 0.5 + 0.8 * np.sin(2 * np.pi * h / 12.42)
    tide_next = 0.5 + 0.8 * np.sin(2 * np.pi * (h + 1) / 12.42)
    tide_trend = tide_next - tide

    result = {
        "rain_1h": round(rain_1h, 2),
        "rain_3h": round(rain_3h, 2),
        "rain_6h": round(rain_6h, 2),
        "tide_height_msl": round(float(tide), 3),
        "tide_trend": round(float(tide_trend), 3),
        "wave_height_m": round(wave_height, 2),
        "wind_speed_kmh": round(wind_speed, 1),
        "fetched_at": datetime.now().isoformat(),
        "source": "Open-Meteo Live API + Semi-Diurnal Tide Model"
    }

    _cache[cache_key] = {"data": result, "_ts": now_ts}
    return result
