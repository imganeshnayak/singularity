"""
Alerts Router — Explainable Early Warnings with Depth, Uncertainty, Trend & Action
"""

from fastapi import APIRouter
from datetime import datetime, timedelta
from typing import List

from ..schemas import WeatherScenario, ZoneAlert
from ..models import get_models
from .forecast import run_zone_inference

router = APIRouter(prefix="/api/v1", tags=["alerts"])

# Simple coastal proximity-based facility exposure pass.
# In production this should be a real facility registry with buffered geometries.
FACILITY_CATALOG = [
    {"name": "Mangaluru General Hospital", "lat": 12.848, "lon": 74.845, "type": "hospital"},
    {"name": "Ullal Health Clinic", "lat": 12.820, "lon": 74.832, "type": "clinic"},
    {"name": "Central Relief Hub Shelter", "lat": 12.850, "lon": 74.850, "type": "shelter"},
    {"name": "Civic High School Refuge", "lat": 12.855, "lon": 74.855, "type": "shelter"},
    {"name": "Coastal Primary School", "lat": 12.836, "lon": 74.842, "type": "school"},
]


def nearby_facilities(zone_id: str, zone_cx: float, zone_cy: float, flooded_zone_ids: set, catalog: list = None) -> List[str]:
    threatened = []
    for f in (catalog or FACILITY_CATALOG):
        d_km = ((f["lat"] - zone_cy) ** 2 + (f["lon"] - zone_cx) ** 2) ** 0.5
        if d_km <= 0.02:  # ~2km proximity threshold for this demo grid
            if f["type"] in {"hospital", "clinic"}:
                threatened.append(f"{f['name']} ({f['type']})")
            elif f["type"] == "shelter":
                if zone_id in flooded_zone_ids:
                    threatened.append(f"{f['name']} unreachable")
                else:
                    threatened.append(f"{f['name']} reachable")
            else:
                threatened.append(f"{f['name']} ({f['type']})")
    return threatened


def recommended_action(risk_level: str, onset_hours: float, threatened: List[str]) -> str:
    if risk_level == "HIGH" and onset_hours <= 6.0:
        if threatened:
            return "IMMEDIATE EVACUATE + PRIORITIZE CRITICAL FACILITIES"
        return "IMMEDIATE EVACUATE LOW-LYING COASTAL ZONES"
    if risk_level == "HIGH":
        return "PREPARE EVACUATION, CLOSE COASTAL ACCESS, PRE-POSITION RESPONDERS"
    if risk_level == "MEDIUM":
        if threatened:
            return "MONITOR CLOSELY, READY SHELTER PLAN FOR CRITICAL FACILITIES"
        return "MONITOR CLOSELY, READY SHELTER PLAN"
    return "MONITOR AND VERIFY"


def trend_from_zone(z: dict, prev_prob: float) -> str:
    p = z["pred_prob"]
    if prev_prob is None:
        return "stable"
    delta = p - prev_prob
    if delta >= 0.10:
        return "deteriorating"
    if delta <= -0.10:
        return "improving"
    return "stable"


def onset_window_str(oh: float, ph: float, prob: float) -> str:
    if prob < 0.40:
        return f"{oh:.1f}h+ (low confidence)"
    if oh < 24.0:
        return f"{oh:.1f}h (peak ~{ph:.1f}h)"
    return ">24h or not expected this cycle"


@router.post("/alerts", response_model=List[ZoneAlert])
def generate_alerts(weather: WeatherScenario):
    bundle = get_models()
    zones = run_zone_inference(bundle, weather)

    flooded_zone_ids = {z["zone_id"] for z in zones if z["pred_depth_med"] >= bundle["flood_depth_m"]}

    # Dynamic facility catalog anchored to active grid center (works for any coastline)
    try:
        grid = bundle["spatial_grid"]
        tb = grid.total_bounds
        c_lat = float((tb[1] + tb[3]) / 2.0)
        c_lon = float((tb[0] + tb[2]) / 2.0)
        catalog = [
            {"name": "District General Hospital", "lat": c_lat + 0.008, "lon": c_lon + 0.004, "type": "hospital"},
            {"name": "Coastal Health Clinic", "lat": c_lat - 0.010, "lon": c_lon - 0.006, "type": "clinic"},
            {"name": "Central Relief Hub Shelter", "lat": c_lat + 0.010, "lon": c_lon + 0.008, "type": "shelter"},
            {"name": "Civic High School Refuge", "lat": c_lat + 0.014, "lon": c_lon + 0.010, "type": "shelter"},
            {"name": "Coastal Primary School", "lat": c_lat - 0.002, "lon": c_lon + 0.002, "type": "school"},
        ]
    except Exception:
        catalog = FACILITY_CATALOG

    now = datetime.now()
    alerts = []
    prev_probs: dict[str, float] = {}

    for z in zones:
        if z["risk_level"] == "LOW":
            continue

        zone_id = z["zone_id"]
        risk = z["risk_level"]
        oh = z["onset_hours"]
        ph = z["peak_hours"]
        prob = z["pred_prob"]

        depth_med = z["pred_depth_med"]
        depth_hi = z["pred_depth_hi"]
        depth_lo = z["pred_depth_lo"]
        width = max(depth_hi - depth_lo, 0.0)
        uncertainty_pct = 100.0 * width / (depth_med + 1e-6)

        # Centroid from GeoJSON polygon
        coords = z["geometry"]["coordinates"][0]
        xs = [pt[0] for pt in coords]
        ys = [pt[1] for pt in coords]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)

        trend = trend_from_zone(z, prev_probs.get(zone_id))
        prev_probs[zone_id] = prob

        icon = "🔴" if risk == "HIGH" else "🟡"
        onset_window = onset_window_str(oh, ph, prob)
        drivers = _driver_list(weather, z)
        threatened = nearby_facilities(zone_id, cx, cy, flooded_zone_ids, catalog)
        action = recommended_action(risk, oh, threatened)

        alert_text = (
            f"{icon} {risk} FLOOD RISK — {zone_id}. "
            f"Onset window: {onset_window}. "
            f"Drivers: {' + '.join(drivers)}."
        )

        alerts.append(ZoneAlert(
            zone_id=zone_id,
            risk_level=risk,
            alert_text=alert_text,
            onset_time_str=onset_window,
            peak_time_str=f"peak ~{ph:.1f}h" if ph < 24.0 else "peak >24h",
            primary_drivers=drivers,
            depth_med_m=depth_med,
            depth_lo_m=depth_lo,
            depth_hi_m=depth_hi,
            uncertainty_pct=round(uncertainty_pct, 1),
            trend=trend,
            recommended_action=action,
            threatened_facilities=threatened,
            status="new"
        ))

    alerts.sort(key=lambda x: (0 if x.risk_level == "HIGH" else 1, x.onset_time_str))

    return alerts


def _driver_list(weather: WeatherScenario, z: dict) -> List[str]:
    drivers = []
    if weather.tide_height_msl >= 2.0:
        drivers.append(f"high tide ({weather.tide_height_msl:.2f}m MSL)")
    if weather.rain_3h >= 60.0:
        drivers.append(f"{weather.rain_3h:.0f} mm rain (3h)")
    if z["elevation_m"] <= 3.0:
        drivers.append(f"low elevation ({z['elevation_m']:.1f}m)")
    if weather.wave_height_m >= 1.8:
        drivers.append(f"wave setup ({weather.wave_height_m:.1f}m)")
    if weather.tide_trend > 0.1:
        drivers.append(f"rising tide (+{weather.tide_trend:.2f}m/h)")
    if not drivers:
        drivers = ["estuary surge", f"cumulative rain ({weather.rain_6h:.0f}mm)"]
    return drivers
