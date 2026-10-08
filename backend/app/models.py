"""
Model Bundle Singleton Loader
"""

import os
from typing import Optional, Dict, Any
import joblib

_model_bundle: Optional[Dict[str, Any]] = None

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "floodsight_models.pkl")


def load_models() -> Dict[str, Any]:
    global _model_bundle
    if _model_bundle is not None:
        return _model_bundle

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model bundle not found at {MODEL_PATH}. Run 'python train_extended_model.py' first!"
        )

    print(f"Loading FloodSight model bundle from {MODEL_PATH}...")
    _model_bundle = joblib.load(MODEL_PATH)
    if "spatial_grid" in _model_bundle:
        _model_bundle["default_grid"] = _model_bundle["spatial_grid"].copy()
    _model_bundle["current_sector"] = {
        "city_name": "Mangaluru / Ullal Sector",
        "center_lat": 12.835,
        "center_lon": 74.845,
        "step_deg": 0.0025
    }
    print("[OK] Model bundle successfully loaded into memory.")
    return _model_bundle


def get_models() -> Dict[str, Any]:
    if _model_bundle is None:
        return load_models()
    return _model_bundle
