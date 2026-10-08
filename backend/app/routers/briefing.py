"""
Briefing Router — Generates Tactical Incident Commander SITREPs & Radio Dispatch Broadcasts
"""

from fastapi import APIRouter
from datetime import datetime, timedelta
from typing import List, Dict, Any

from ..schemas import WeatherScenario
from ..models import get_models
from .forecast import run_zone_inference
from .alerts import FACILITY_CATALOG

router = APIRouter(prefix="/api/v1", tags=["briefing"])


@router.post("/briefing")
def generate_incident_briefing(weather: WeatherScenario) -> Dict[str, Any]:
    bundle = get_models()
    zones = run_zone_inference(bundle, weather)
    now = datetime.now()

    high_zones = [z for z in zones if z["risk_level"] == "HIGH"]
    med_zones = [z for z in zones if z["risk_level"] == "MEDIUM"]
    flooded_count = len(high_zones) + len(med_zones)

    # Calculate earliest onset and peak surge windows
    onsets = [z["onset_hours"] for z in high_zones if z["onset_hours"] < 24]
    earliest_onset = min(onsets) if onsets else (min([z["onset_hours"] for z in med_zones if z["onset_hours"] < 24], default=4.0))
    peaks = [z["peak_hours"] for z in high_zones if z["peak_hours"] < 24]
    surge_peak = min(peaks) if peaks else (earliest_onset + 1.8)

    onset_clock = (now + timedelta(hours=earliest_onset)).strftime("%H:%M IST")
    peak_clock = (now + timedelta(hours=surge_peak)).strftime("%H:%M IST")

    # Threatened critical infrastructure identification
    threatened_facilities = []
    high_zone_ids = {z["zone_id"] for z in high_zones}
    for f in FACILITY_CATALOG:
        for z in high_zones:
            cx = z["geometry"]["coordinates"][0][0][0]
            cy = z["geometry"]["coordinates"][0][0][1]
            dist_km = ((f["lat"] - cy) ** 2 + (f["lon"] - cx) ** 2) ** 0.5 * 111.0
            if dist_km <= 1.2:
                threatened_facilities.append({
                    "name": f["name"],
                    "type": f["type"],
                    "zone_id": z["zone_id"],
                    "risk_level": "CRITICAL" if z["pred_depth_hi"] >= 0.5 else "HIGH",
                    "onset_hours": z["onset_hours"]
                })
                break

    # Golden evacuation window in minutes
    golden_window_minutes = max(15, int(earliest_onset * 60 - 20))
    if golden_window_minutes >= 60:
        hrs = golden_window_minutes // 60
        mins = golden_window_minutes % 60
        golden_window_str = f"{hrs}h {mins}m" if mins > 0 else f"{hrs} hours"
    else:
        golden_window_str = f"{golden_window_minutes} mins"

    # Determine Tactical Threat Level
    if len(high_zones) >= 8 or weather.tide_height_msl >= 2.5:
        threat_level = "DEFCON-1 : CATASTROPHIC SURGE INUNDATION"
        badge_variant = "breach"
    elif len(high_zones) >= 3 or weather.rain_3h >= 70:
        threat_level = "DEFCON-2 : SEVERE COMPOUND FLOOD SURGE"
        badge_variant = "warn"
    else:
        threat_level = "DEFCON-3 : LOCALIZED ESTUARY BREACH WATCH"
        badge_variant = "watch"

    # Tactical Directives
    directives = [
        f"1. MANDATORY EVACUATION: Issue immediate siren & cellular alert for {len(high_zones)} high-risk coastal grids below 2.0m MSL.",
        f"2. ACCESS CORRIDOR CONTROL: Restrict civilian traffic along coastal slipways before {onset_clock}; reserve routes for emergency convoys.",
        f"3. ASSET PROTECTION: Pre-stage inflatable rescue craft and flood pumps at {threatened_facilities[0]['name'] if threatened_facilities else 'Central Relief Hub'}.",
        f"4. GOLDEN EVACUATION WINDOW: Response teams have {golden_window_minutes} minutes before high tide compound crest at {peak_clock}.",
        f"5. SHELTER ACTIVATION: Divert low-elevation evacuees to inland centers (St. Agnes & City Relief Camp A)."
    ]

    # Executive Summary Memo
    summary_memo = (
        f"OPERATIONAL SITREP // INCIDENT COMMAND\n"
        f"SECTOR: Coastal Estuary Basin | THREAT: {threat_level}\n\n"
        f"METEOROLOGICAL HAZARD: Sustained 3-hour precipitation of {weather.rain_3h:.0f}mm coupled with "
        f"astronomical tide at {weather.tide_height_msl:.2f}m MSL and {weather.wave_height_m:.1f}m swell waves.\n"
        f"HYDRAULIC STATUS: {len(high_zones)} zones are projected for critical breach. Earliest road inundation onset at {onset_clock}, "
        f"with maximum hydraulic head peak at {peak_clock}.\n"
        f"EXPOSURE: {len(threatened_facilities)} critical medical/civic structures threatened. Actionable window before access severance: {golden_window_minutes} minutes."
    )

    # Synthesized radio dispatch script for Voice Broadcasting
    radio_script = (
        f"Attention all coastal emergency units. This is FloodSight AI Command dispatch. "
        f"Threat status: {threat_level}. "
        f"High risk inundation detected across {len(high_zones)} sectors. "
        f"Earliest water breach commences at {onset_clock}. Peak surge crest projected for {peak_clock}. "
        f"Golden evacuation window is {golden_window_str}. "
        f"All non-amphibious vehicles must clear low elevation corridors immediately. "
        f"Execute tactical order Alpha. Stand by for zone updates."
    )

    return {
        "incident_code": f"SITREP-FLS-{now.strftime('%m%d-%H%M')}",
        "timestamp_ist": now.strftime("%H:%M:%S IST"),
        "threat_level": threat_level,
        "badge_variant": badge_variant,
        "high_zones_count": len(high_zones),
        "total_flooded_zones": flooded_count,
        "earliest_onset_clock": onset_clock,
        "peak_surge_clock": peak_clock,
        "golden_window_minutes": golden_window_minutes,
        "golden_window_str": golden_window_str,
        "threatened_facilities": threatened_facilities,
        "directives": directives,
        "summary_memo": summary_memo,
        "radio_script": radio_script,
        "weather_telemetry": {
            "rain_3h": weather.rain_3h,
            "tide_msl": weather.tide_height_msl,
            "wave_m": weather.wave_height_m,
            "wind_kmh": weather.wind_speed_kmh
        }
    }
