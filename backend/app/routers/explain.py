"""
Explainability Router — SHAP TreeExplainer & Natural Language Attributions
"""

from fastapi import APIRouter, HTTPException, Query
import pandas as pd
import numpy as np
from typing import Dict, Any

from ..schemas import WeatherScenario, ExplainResponse, FactorContribution
from ..models import get_models

router = APIRouter(prefix="/api/v1", tags=["explainability"])

FACTOR_NAMES_MAP = {
    "tide_height_msl": ("Tide Height", "High tide pushing sea water inland into coastal drains"),
    "rain_3h": ("3-Hour Rainfall", "Heavy 3-hour rainfall accumulating in low elevation areas"),
    "rain_6h": ("6-Hour Rainfall", "Sustained monsoon downpour overwhelming regional drainage"),
    "rain_1h": ("1-Hour Rainfall Peak", "Intense short-duration rainfall burst"),
    "elevation_m": ("Terrain Elevation", "Low-lying ground level offering minimal natural barrier"),
    "dist_coast_m": ("Proximity to Coast", "Close distance to estuary and coastal shoreline"),
    "hydraulic_head": ("Hydraulic Head Margin", "Reduced elevation delta relative to sea level"),
    "tide_trend": ("Rising Tide Trend", "Incoming tide creating reverse pressure in drainage network"),
    "wave_height_m": ("Storm Surge / Wave Height", "Ocean wave swell increasing coastal water level"),
    "wind_speed_kmh": ("Wind Speed", "Strong coastal winds driving water surge inland")
}


@router.post("/explain/{zone_id}", response_model=ExplainResponse)
def explain_zone(
    zone_id: str,
    weather: WeatherScenario
):
    bundle = get_models()
    grid = bundle["spatial_grid"]
    features_list = bundle["features"]
    explainer = bundle["shap_explainer"]
    classifier = bundle["classifier"]

    matching = grid[grid["zone_id"] == zone_id]
    if matching.empty:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found in spatial mesh.")

    z = matching.iloc[0]
    elevation = float(z["elevation_m"])
    dist_coast = float(z["dist_coast_m"])
    hydraulic_head = elevation - weather.tide_height_msl

    feature_vals = {
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

    df_row = pd.DataFrame([feature_vals])[features_list]
    prob = float(classifier.predict_proba(df_row)[0, 1])

    risk_level = "HIGH" if prob >= 0.65 else ("MEDIUM" if prob >= 0.30 else "LOW")

    # Compute SHAP values
    shap_vals = explainer.shap_values(df_row)
    if isinstance(shap_vals, list):
        # binary classification list: [class0, class1]
        vals = shap_vals[1][0]
    else:
        vals = shap_vals[0]

    # Rank factors by absolute contribution
    ranked_indices = np.argsort(np.abs(vals))[::-1][:4]

    factors = []
    plain_reasons = []

    for idx in ranked_indices:
        feat_name = features_list[idx]
        contrib_val = float(vals[idx])
        
        display_name, desc_template = FACTOR_NAMES_MAP.get(
            feat_name, (feat_name, f"This signal changed the model estimate")
        )

        sign = "+" if contrib_val >= 0 else ""
        contrib_str = f"{sign}{contrib_val:.2f}"
        
        # Format human readable value
        val_raw = feature_vals[feat_name]
        val_str = f"{val_raw:.1f}m" if "m" in feat_name or "elevation" in feat_name else f"{val_raw:.1f}mm"
        
        plain_reasons.append(f"{display_name} ({val_str})")

        factors.append(FactorContribution(
            factor=display_name,
            contribution=contrib_str,
            plain_text=f"{desc_template}. Observed value: {val_str}."
        ))

    top_driver_names = ', '.join(plain_reasons[:3])
    ai_explanation = (
        f"The ML model estimates a {risk_level.lower()} flood risk for this zone "
        f"with a {prob:.0%} breach probability. The strongest signals were {top_driver_names}."
    )
    ai_action = (
        "Evacuate low-lying occupants and alert responders."
        if risk_level == "HIGH" else
        "Prepare shelters and keep responders ready."
        if risk_level == "MEDIUM" else
        "Keep monitoring; no evacuation action is indicated yet."
    )

    summary_text = (
        f"{risk_level} risk, {prob:.0%} breach probability. Main signals: {top_driver_names}."
    )

    return ExplainResponse(
        zone_id=zone_id,
        risk_level=risk_level,
        top_factors=factors,
        summary=summary_text,
        ai_explanation=ai_explanation,
        ai_action=ai_action,
        ai_model="SHAP + Gemma 3:4B Ready"
    )


@router.post("/explain/{zone_id}/gemma")
def explain_zone_with_gemma(
    zone_id: str,
    weather: WeatherScenario
) -> Dict[str, Any]:
    """
    Executes local Ollama model gemma3:4b to generate an explainability
    briefing for emergency operators based on SHAP feature values.
    """
    import urllib.request
    import json
    import time

    bundle = get_models()
    grid = bundle["spatial_grid"]
    features_list = bundle["features"]
    explainer = bundle["shap_explainer"]
    classifier = bundle["classifier"]

    matching = grid[grid["zone_id"] == zone_id]
    if matching.empty:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")

    z = matching.iloc[0]
    elevation = float(z["elevation_m"])
    dist_coast = float(z["dist_coast_m"])
    hydraulic_head = elevation - weather.tide_height_msl

    feature_vals = {
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

    df_row = pd.DataFrame([feature_vals])[features_list]
    prob = float(classifier.predict_proba(df_row)[0, 1])
    risk_level = "HIGH" if prob >= 0.65 else ("MEDIUM" if prob >= 0.30 else "LOW")

    shap_vals = explainer.shap_values(df_row)
    vals = shap_vals[1][0] if isinstance(shap_vals, list) else shap_vals[0]
    ranked_indices = np.argsort(np.abs(vals))[::-1][:3]
    top_drivers = []
    for idx in ranked_indices:
        fn = features_list[idx]
        dn, _ = FACTOR_NAMES_MAP.get(fn, (fn, ""))
        top_drivers.append(f"{dn} ({vals[idx]:+.2f})")

    prompt = (
        f"You are FloodSight AI, explaining coastal flood hazards. "
        f"Zone: {zone_id}. Risk: {risk_level} ({prob:.0%} breach probability). "
        f"Elevation: {elevation:.1f}m MSL, Distance to coast: {dist_coast:.0f}m. "
        f"Weather: 3h Rain {weather.rain_3h:.0f}mm, Tide {weather.tide_height_msl:.2f}m MSL. "
        f"Top SHAP drivers: {', '.join(top_drivers)}. "
        f"In 2 concise sentences, explain the physical flood mechanism to emergency responders, "
        f"then provide 1 immediate priority action starting with 'Action:'."
    )

    t0 = time.time()
    try:
        req_data = json.dumps({
            "model": "gemma3:4b",
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 75,
                "num_ctx": 512,
                "temperature": 0.2
            }
        }).encode("utf-8")

        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=req_data,
            headers={"Content-Type": "application/json"}
        )

        with urllib.request.urlopen(req, timeout=25.0) as res:
            if res.status == 200:
                out = json.loads(res.read().decode("utf-8"))
                response_text = out.get("response", "").strip()
                elapsed = round(time.time() - t0, 2)
                return {
                    "zone_id": zone_id,
                    "model": "gemma3:4b (Local Ollama)",
                    "status": "success",
                    "explanation": response_text,
                    "latency_sec": elapsed,
                    "top_drivers": top_drivers
                }
    except Exception as e:
        print(f"[Ollama gemma3:4b fallback]: {e}")

    # Fallback if Ollama times out or is offline
    fallback_text = (
        f"Zone {zone_id} is facing {risk_level} flood risk ({prob:.0%} probability) due to "
        f"{', '.join(top_drivers[:2])} overwhelming natural drainage at elevation {elevation:.1f}m MSL. "
        f"Action: {'Evacuate low-lying occupants immediately and pre-position flood rescue craft.' if risk_level == 'HIGH' else 'Monitor tidal run-up and inspect coastal sluice gates.'}"
    )
    return {
        "zone_id": zone_id,
        "model": "gemma3:4b (Heuristic Fallback)",
        "status": "fallback",
        "explanation": fallback_text,
        "latency_sec": round(time.time() - t0, 2),
        "top_drivers": top_drivers
    }
