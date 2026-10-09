"""
Forecast Router — Simulation, Dynamic Sector & Live Weather Inference
"""

from fastapi import APIRouter
import pandas as pd
import numpy as np
import geopandas as gpd
from shapely.geometry import box
from typing import List, Dict, Any

from ..schemas import WeatherScenario, ZonePrediction, SectorConfig
from ..models import get_models
from ..live_data import fetch_live_weather

router = APIRouter(prefix="/api/v1", tags=["forecast"])


def build_dynamic_grid(center_lat: float, center_lon: float, step: float = 0.0025) -> gpd.GeoDataFrame:
    """Dynamically builds 250m spatial mesh centered around ANY lat/lon in the world."""
    lat_delta = 0.025
    lon_delta = 0.025 / np.cos(np.radians(center_lat))

    bbox = {
        "min_lat": center_lat - lat_delta,
        "max_lat": center_lat + lat_delta,
        "min_lon": center_lon - lon_delta,
        "max_lon": center_lon + lon_delta
    }

    lons = np.arange(bbox["min_lon"], bbox["max_lon"], step)
    lats = np.arange(bbox["min_lat"], bbox["max_lat"], step)

    cells, ids = [], []
    idx = 0
    for lon in lons:
        for lat in lats:
            cells.append(box(lon, lat, lon + step, lat + step))
            ids.append(f"zone_{idx:03d}")
            idx += 1

    gdf = gpd.GeoDataFrame({"zone_id": ids, "geometry": cells}, crs="EPSG:4326")
    gdf["centroid_lon"] = gdf.geometry.centroid.x
    gdf["centroid_lat"] = gdf.geometry.centroid.y

    lat_rad = np.radians(gdf["centroid_lat"].mean())
    gdf["dist_coast_m"] = (gdf["centroid_lon"] - bbox["min_lon"]) * (111320 * np.cos(lat_rad))

    np.random.seed(int(abs(center_lat * 100 + center_lon)))
    dist_norm = (gdf["dist_coast_m"] / (gdf["dist_coast_m"].max() + 1e-5)).values
    lat_center = (gdf["centroid_lat"] - bbox["min_lat"]) / (bbox["max_lat"] - bbox["min_lat"] + 1e-5)
    
    elevations = 0.8 + 12.0 * (dist_norm ** 1.5) + 3.0 * np.abs(lat_center - 0.5) + np.random.uniform(-0.3, 0.3, len(gdf))
    gdf["elevation_m"] = np.clip(elevations, 0.5, 25.0).round(2)
    return gdf


def run_zone_inference(bundle: Dict[str, Any], weather: WeatherScenario, custom_grid: gpd.GeoDataFrame = None) -> List[Dict[str, Any]]:
    grid = custom_grid if custom_grid is not None else bundle["spatial_grid"]
    features_list = bundle["features"]
    
    regressor = bundle["regressor"]
    reg_lo = bundle["reg_lo"]
    reg_hi = bundle["reg_hi"]
    classifier = bundle["classifier"]
    onset_model = bundle["onset_model"]
    peak_model = bundle["peak_model"]

    rows = []
    for _, z in grid.iterrows():
        elevation = z["elevation_m"]
        dist_coast = z["dist_coast_m"]
        hydraulic_head = elevation - weather.tide_height_msl
        
        row = {
            "rain_1h": weather.rain_1h,
            "rain_3h": weather.rain_3h,
            "rain_6h": weather.rain_6h,
            "tide_height_msl": weather.tide_height_msl,
            "tide_trend": weather.tide_trend,
            "wave_height_m": weather.wave_height_m,
            "wind_speed_kmh": weather.wind_speed_kmh,
            "elevation_m": elevation,
            "dist_coast_m": dist_coast,
            "hydraulic_head": hydraulic_head
        }
        rows.append(row)

    df_feats = pd.DataFrame(rows)[features_list]

    depth_med = regressor.predict(df_feats).clip(0.0).round(2)
    depth_lo = reg_lo.predict(df_feats).clip(0.0).round(2)
    depth_hi = reg_hi.predict(df_feats).clip(0.0).round(2)
    
    probs = classifier.predict_proba(df_feats)[:, 1].round(3)
    onset_hours = onset_model.predict(df_feats).clip(0.1, 24.0).round(1)
    peak_hours = peak_model.predict(df_feats).clip(0.2, 24.0).round(1)

    results = []
    for idx, (_, z) in enumerate(grid.iterrows()):
        p = float(probs[idx])
        d_med = float(depth_med[idx])
        d_lo = float(depth_lo[idx])
        d_hi = float(depth_hi[idx])
        oh = float(onset_hours[idx])
        ph = float(peak_hours[idx])

        if p >= 0.65 or d_med >= 0.45:
            risk = "HIGH"
        elif p >= 0.30 or d_med >= 0.15:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        geom_mapping = z.geometry.__geo_interface__

        results.append({
            "zone_id": z["zone_id"],
            "pred_prob": p,
            "pred_depth_lo": min(d_lo, d_med),
            "pred_depth_med": d_med,
            "pred_depth_hi": max(d_hi, d_med),
            "onset_hours": oh,
            "peak_hours": ph,
            "risk_level": risk,
            "elevation_m": float(z["elevation_m"]),
            "dist_coast_m": float(z["dist_coast_m"]),
            "geometry": geom_mapping
        })

    return results


@router.post("/forecast/simulate", response_model=List[ZonePrediction])
def simulate_forecast(weather: WeatherScenario):
    bundle = get_models()
    return run_zone_inference(bundle, weather)


@router.post("/sector/set")
def set_custom_sector(sector: SectorConfig):
    """Admin configures custom Lat/Lon sector anywhere in the world."""
    bundle = get_models()
    new_grid = build_dynamic_grid(sector.center_lat, sector.center_lon, sector.step_deg)
    bundle["spatial_grid"] = new_grid
    
    return {
        "status": "success",
        "city_name": sector.city_name,
        "center": [sector.center_lat, sector.center_lon],
        "total_zones": len(new_grid)
    }


@router.get("/live")
def get_live_forecast():
    bundle = get_models()
    # Use active grid center so live weather follows user-chosen coastline
    try:
        grid = bundle["spatial_grid"]
        lat = float(grid["centroid_lat"].mean())
        lon = float(grid["centroid_lon"].mean())
    except Exception:
        lat, lon = 12.835, 74.845
    weather_dict = fetch_live_weather(lat, lon)
    weather_obj = WeatherScenario(**weather_dict)
    bundle = get_models()
    zones = run_zone_inference(bundle, weather_obj)
    
    return {
        "weather": weather_dict,
        "zones": zones,
        "generated_at": weather_dict["fetched_at"]
    }
