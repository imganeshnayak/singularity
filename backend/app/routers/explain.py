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
            feat_name, (feat_name, f"Influence from {feat_name}")
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
            plain_text=f"{display_name}: {desc_template}"
        ))

    summary_text = (
        f"Zone {zone_id} is at {risk_level} flood risk (Breach probability: {prob:.0%}). "
        f"Key contributing drivers are {', '.join(plain_reasons[:3])}."
    )

    return ExplainResponse(
        zone_id=zone_id,
        risk_level=risk_level,
        top_factors=factors,
        summary=summary_text
    )
