"""
Sandbox Router — What-If Action Simulator (isolated, additive only).
Compares baseline forecast vs intervention scenario by re-running
zone inference with adjusted weather/elevation. No existing code touched.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional

from ..schemas import WeatherScenario
from ..models import get_models
from .forecast import run_zone_inference

router = APIRouter(prefix="/api/v1/sandbox", tags=["sandbox"])


class SandboxIntervention(BaseModel):
    rain_delta_mm: float = Field(default=0.0, description="+/- rain applied to rain_1h/3h/6h")
    tide_delta_m: float = Field(default=0.0, description="+/- tide height adjustment")
    pump_depth_relief_m: float = Field(default=0.0, description="Mobile pumps reduce predicted depth by this much (0-1m)")
    sandbag_elev_gain_m: float = Field(default=0.0, description="Sandbags/temporary bunds raise effective elevation")
    target: str = Field(default="all", description="'all' or 'high_only' — which zones the physical works apply to")


class SandboxRequest(BaseModel):
    weather: WeatherScenario = Field(default_factory=WeatherScenario)
    intervention: SandboxIntervention = Field(default_factory=SandboxIntervention)


def _summarize(zones):
    high = sum(1 for z in zones if z["risk_level"] == "HIGH")
    med = sum(1 for z in zones if z["risk_level"] == "MEDIUM")
    low = sum(1 for z in zones if z["risk_level"] == "LOW")
    avg_depth = round(sum(z["pred_depth_med"] for z in zones) / max(len(zones), 1), 3)
    return {"total": len(zones), "high": high, "medium": med, "low": low, "avg_depth_med": avg_depth}


@router.post("/compare")
def compare_sandbox(req: SandboxRequest):
    bundle = get_models()
    baseline = run_zone_inference(bundle, req.weather)

    iv = req.intervention
    adj_weather = req.weather.model_copy(update={
        "rain_1h": max(0.0, req.weather.rain_1h + iv.rain_delta_mm / 3.0),
        "rain_3h": max(0.0, req.weather.rain_3h + iv.rain_delta_mm),
        "rain_6h": max(0.0, req.weather.rain_6h + iv.rain_delta_mm * 1.5),
        "tide_height_msl": req.weather.tide_height_msl + iv.tide_delta_m,
    })
    scenario = run_zone_inference(bundle, adj_weather)

    # ponytail: physical works applied as post-hoc depth/elevation shift,
    # not re-trained physics. Upgrade to surrogate model when available.
    baseline_ids_high = {z["zone_id"] for z in baseline if z["risk_level"] == "HIGH"}
    out_zones = []
    improved = 0
    for b, s in zip(baseline, scenario):
        applies = (iv.target == "all") or (b["zone_id"] in baseline_ids_high)
        relief = iv.pump_depth_relief_m if applies else 0.0
        # sandbag gain lowers depth roughly 1:1 for shallow water
        relief += iv.sandbag_elev_gain_m * 0.8 if applies else 0.0
        d_med = max(0.0, round(s["pred_depth_med"] - relief, 2))
        d_lo = max(0.0, round(s["pred_depth_lo"] - relief, 2))
        d_hi = max(0.0, round(s["pred_depth_hi"] - relief, 2))
        p = s["pred_prob"]
        if p >= 0.65 or d_med >= 0.45:
            risk = "HIGH"
        elif p >= 0.30 or d_med >= 0.15:
            risk = "MEDIUM"
        else:
            risk = "LOW"
        rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
        if rank[risk] < rank[b["risk_level"]]:
            improved += 1
        out_zones.append({**s, "pred_depth_med": d_med, "pred_depth_lo": d_lo,
                          "pred_depth_hi": d_hi, "risk_level": risk})

    base_sum = _summarize(baseline)
    scen_sum = _summarize(out_zones)
    global _last_weather
    _last_weather = req.weather
    refuges = _nearest_refuges(out_zones)
    briefing = _gemma_sandbox_brief(req.weather, iv, base_sum, scen_sum, refuges)
    return {
        "disclaimer": "Simulated intervention — simplified depth shift, not a guaranteed outcome.",
        "baseline_summary": base_sum,
        "scenario_summary": scen_sum,
        "zones_improved": improved,
        "high_saved": base_sum["high"] - scen_sum["high"],
        "baseline": baseline,
        "scenario": out_zones,
        "refuges": refuges,
        "ai_briefing": briefing,
    }


def _centroid(z):
    coords = z["geometry"]["coordinates"][0]
    cx = sum(p[0] for p in coords) / len(coords)
    cy = sum(p[1] for p in coords) / len(coords)
    return cx, cy


def _drivers(weather: WeatherScenario, z: dict):
    d = []
    if weather.tide_height_msl >= 2.0:
        d.append(f"high tide ({weather.tide_height_msl:.2f}m)")
    if weather.rain_3h >= 60.0:
        d.append(f"{weather.rain_3h:.0f}mm rain (3h)")
    if z["elevation_m"] <= 3.0:
        d.append(f"low elevation ({z['elevation_m']:.1f}m)")
    if weather.wave_height_m >= 1.8:
        d.append(f"wave setup ({weather.wave_height_m:.1f}m)")
    if not d:
        d = ["estuary surge", f"cumulative rain ({weather.rain_6h:.0f}mm)"]
    return d


def _nearest_refuges(scenario_zones, top_n: int = 5):
    """For worst HIGH zones, find nearest LOW zone as walkable refuge + flag reason."""
    import numpy as np
    highs = sorted([z for z in scenario_zones if z["risk_level"] == "HIGH"],
                   key=lambda z: -z["pred_depth_med"])[:top_n]
    lows = [z for z in scenario_zones if z["risk_level"] == "LOW"]
    if not highs or not lows:
        return []
    out = []
    for h in highs:
        hx, hy = _centroid(h)
        best, best_d = None, 1e18
        for lo in lows:
            lx, ly = _centroid(lo)
            d = float(np.sqrt(((ly - hy) * 111000.0) ** 2 +
                              ((lx - hx) * 111000.0 * np.cos(np.radians(hy))) ** 2))
            if d < best_d:
                best, best_d = lo, d
        eta = max(1.0, round(best_d / (5000.0 / 3600.0) / 60.0, 1))  # 5 km/h walk
        out.append({
            "from_zone": h["zone_id"],
            "depth_med": h["pred_depth_med"],
            "onset_hours": h["onset_hours"],
            "flag_reason": " + ".join(_drivers(_last_weather, h)),
            "refuge_zone": best["zone_id"],
            "distance_m": round(best_d, 0),
            "walk_eta_min": eta,
        })
    return out


_last_weather: WeatherScenario = None


def _gemma_sandbox_brief(weather, iv, base_sum, scen_sum, refuges):
    """Local Ollama gemma3:4b severity + refuge explainer with heuristic fallback."""
    import json, time, urllib.request
    # refresh flag reasons now that weather is known
    for r in refuges:
        pass
    t0 = time.time()
    refuge_txt = "; ".join(
        f"{r['from_zone']}→{r['refuge_zone']} ({r['walk_eta_min']}min walk)" for r in refuges[:3]) or "no HIGH zones"
    prompt = (
        f"You are FloodSight AI. Baseline HIGH zones {base_sum['high']}, "
        f"with action HIGH zones {scen_sum['high']} "
        f"(pumps {iv.pump_depth_relief_m}m, sandbags {iv.sandbag_elev_gain_m}m). "
        f"Weather: rain {weather.rain_3h:.0f}mm/3h, tide {weather.tide_height_msl:.2f}m. "
        f"Refuges: {refuge_txt}. "
        f"In 2 sentences explain severity and why zones are flagged, "
        f"then 1 line starting 'Refuge:' naming the nearest safe zone and walk time."
    )
    try:
        req_data = json.dumps({"model": "gemma3:4b", "prompt": prompt,
                               "stream": False,
                               "options": {"num_predict": 90, "num_ctx": 512, "temperature": 0.2}}).encode()
        req = urllib.request.Request("http://127.0.0.1:11434/api/generate",
                                     data=req_data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=25.0) as res:
            if res.status == 200:
                txt = json.loads(res.read().decode()).get("response", "").strip()
                return {"model": "gemma3:4b (Local Ollama)", "status": "success",
                        "text": txt, "latency_sec": round(time.time() - t0, 2)}
    except Exception as e:
        print(f"[Sandbox gemma fallback]: {e}")
    sev = "SEVERE" if scen_sum["high"] > 10 else ("MODERATE" if scen_sum["high"] > 0 else "LOW")
    if refuges:
        r0 = refuges[0]
        fb = (f"Severity {sev}: {scen_sum['high']} HIGH zones remain (avg depth "
              f"{scen_sum['avg_depth_med']}m), flagged for {r0['flag_reason']}. "
              f"Refuge: move {r0['from_zone']} → {r0['refuge_zone']} "
              f"({r0['distance_m']:.0f}m, ~{r0['walk_eta_min']}min walk).")
    else:
        fb = (f"Severity {sev}: {scen_sum['high']} HIGH zones remain "
              f"(avg depth {scen_sum['avg_depth_med']}m). No refuge needed — all zones LOW.")
    return {"model": "gemma3:4b (Heuristic Fallback)", "status": "fallback",
            "text": fb, "latency_sec": round(time.time() - t0, 2)}
