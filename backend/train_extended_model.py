"""
FloodSight — Phase 1: Machine Learning Model Training & Extended Intelligence Pipeline

Outputs:
  backend/floodsight_models.pkl
Contains:
  - Median depth regressor (LGBMRegressor)
  - Lower quantile depth regressor (LGBMRegressor, alpha=0.10)
  - Upper quantile depth regressor (LGBMRegressor, alpha=0.90)
  - Flood classifier (LGBMClassifier)
  - Flood onset regressor (LGBMRegressor)
  - Peak time regressor (LGBMRegressor)
  - SHAP TreeExplainer
  - Spatial grid GeoDataFrame & features metadata
"""

import time
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import box
import joblib
import lightgbm as lgb
import shap
from sklearn.metrics import mean_absolute_error, r2_score, roc_auc_score, f1_score
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")

RANDOM_STATE = 42
FLOOD_DEPTH_M = 0.25

BBOX = {
    "min_lon": 74.825,
    "min_lat": 12.810,
    "max_lon": 74.865,
    "max_lat": 12.860
}
STEP_DEG = 0.0025  # ~250m grid resolution


def build_spatial_grid(bbox, step):
    print("Creating dynamic 250m spatial mesh...")
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

    # Synthetic realistic elevations for coastal river estuary
    # Estuary basin / coast: 0.8m - 3.0m, inland hills: up to 18m
    np.random.seed(42)
    dist_norm = (gdf["dist_coast_m"] / gdf["dist_coast_m"].max()).values
    lat_center = (gdf["centroid_lat"] - bbox["min_lat"]) / (bbox["max_lat"] - bbox["min_lat"])
    
    # Low terrain near coast and river mouth (lat_center ~ 0.5)
    elevations = 0.8 + 12.0 * (dist_norm ** 1.5) + 3.0 * np.abs(lat_center - 0.5) + np.random.uniform(-0.3, 0.3, len(gdf))
    gdf["elevation_m"] = np.clip(elevations, 0.5, 25.0).round(2)

    print(f"[OK] Dynamic mesh ready: {len(gdf)} zone polygons. Elevation range: {gdf['elevation_m'].min()}m - {gdf['elevation_m'].max()}m")
    return gdf


def generate_synthetic_monsoon_events(spatial_grid, n_episodes=50):
    print("Generating hydrological storm sequences for model training...")
    records = []
    
    # Features:
    # rain_1h, rain_3h, rain_6h, tide_height_msl, wave_height_m, wind_speed_kmh, elevation_m, dist_coast_m, hydraulic_head, tide_trend
    
    np.random.seed(RANDOM_STATE)
    
    for episode_idx in range(n_episodes):
        # Episode duration: 12 to 24 hours
        duration_hours = np.random.randint(12, 25)
        
        # Peak timing in episode
        peak_hour = np.random.randint(3, duration_hours - 2)
        
        # Storm intensity
        max_rain_1h = np.random.uniform(10.0, 90.0)
        tide_amplitude = np.random.uniform(0.6, 1.8)
        base_tide = np.random.uniform(0.5, 1.2)
        wave_max = np.random.uniform(0.8, 3.5)
        wind_max = np.random.uniform(20.0, 65.0)

        # Generate time series for episode
        time_series = []
        for h in range(duration_hours):
            # Rain profile (Gaussian curve around peak_hour)
            r_1h = max_rain_1h * np.exp(-0.5 * ((h - peak_hour) / 2.5) ** 2) + np.random.uniform(0, 3)
            r_1h = max(0.0, r_1h)
            
            # Semi-diurnal tide
            tide = base_tide + tide_amplitude * np.sin(2 * np.pi * (h + episode_idx * 5) / 12.42)
            tide_next = base_tide + tide_amplitude * np.sin(2 * np.pi * (h + 1 + episode_idx * 5) / 12.42)
            tide_trend = tide_next - tide
            
            wave = wave_max * (0.6 + 0.4 * (r_1h / (max_rain_1h + 1e-5)))
            wind = wind_max * (0.5 + 0.5 * (r_1h / (max_rain_1h + 1e-5)))
            
            time_series.append({
                "hour": h,
                "rain_1h": r_1h,
                "tide_height_msl": tide,
                "tide_trend": tide_trend,
                "wave_height_m": wave,
                "wind_speed_kmh": wind
            })
            
        df_ts = pd.DataFrame(time_series)
        df_ts["rain_3h"] = df_ts["rain_1h"].rolling(3, min_periods=1).sum()
        df_ts["rain_6h"] = df_ts["rain_1h"].rolling(6, min_periods=1).sum()
        
        for _, t_row in df_ts.iterrows():
            batch = spatial_grid[["zone_id", "elevation_m", "dist_coast_m"]].copy()
            batch["episode_id"] = episode_idx
            batch["hour"] = t_row["hour"]
            batch["rain_1h"] = t_row["rain_1h"]
            batch["rain_3h"] = t_row["rain_3h"]
            batch["rain_6h"] = t_row["rain_6h"]
            batch["tide_height_msl"] = t_row["tide_height_msl"]
            batch["tide_trend"] = t_row["tide_trend"]
            batch["wave_height_m"] = t_row["wave_height_m"]
            batch["wind_speed_kmh"] = t_row["wind_speed_kmh"]
            
            # Physical hydrodynamic coupling
            batch["hydraulic_head"] = batch["elevation_m"] - batch["tide_height_msl"]
            excess_rain = np.maximum(0, batch["rain_3h"] - 35.0)
            tide_lock = np.maximum(0, batch["tide_height_msl"] - batch["elevation_m"])
            surge = batch["wave_height_m"] * 0.15
            
            # Continuous physical water depth simulation (with realistic noise)
            raw_depth = (
                (excess_rain / 90.0) * 0.50 +
                (tide_lock * 0.85) +
                surge -
                (batch["elevation_m"] * 0.08) -
                (batch["dist_coast_m"] / 12000.0) +
                np.random.normal(0, 0.03, len(batch))
            )
            batch["depth_m"] = np.clip(raw_depth, 0.0, 3.5).round(3)
            batch["is_flooded"] = (batch["depth_m"] >= FLOOD_DEPTH_M).astype(int)
            records.append(batch)
            
    df_all = pd.concat(records, ignore_index=True)
    
    # Calculate episode-level onset and peak time targets for each zone
    print("Computing episode onset and peak hour targets...")
    
    onset_list = []
    peak_list = []
    
    # Group by episode and zone to find when flood starts and peaks
    for (ep_id, z_id), group in df_all.groupby(["episode_id", "zone_id"]):
        group = group.sort_values("hour")
        flooded_hours = group[group["is_flooded"] == 1]["hour"].values
        max_depth_hour = group.loc[group["depth_m"].idxmax()]["hour"]
        
        for _, row in group.iterrows():
            cur_h = row["hour"]
            # Future flooded hours in this episode
            future_flooded = [fh for fh in flooded_hours if fh >= cur_h]
            if len(future_flooded) > 0:
                onset_hours = float(future_flooded[0] - cur_h)
            else:
                onset_hours = 24.0  # Safe upper cap if no flood expected
                
            peak_hours = max(0.0, float(max_depth_hour - cur_h)) if max_depth_hour >= cur_h else 0.0
            
            onset_list.append(onset_hours)
            peak_list.append(peak_hours)
            
    df_all["onset_hours"] = onset_list
    df_all["peak_hours"] = peak_list
    
    print(f"[OK] Training dataset created: {len(df_all):,} records across {n_episodes} storm episodes.")
    print(f"  Flooded sample ratio: {df_all['is_flooded'].mean():.2%}")
    return df_all


FEATURES = [
    "rain_1h", "rain_3h", "rain_6h",
    "tide_height_msl", "tide_trend", "wave_height_m", "wind_speed_kmh",
    "elevation_m", "dist_coast_m", "hydraulic_head"
]


def train_models(df):
    print("\nTraining LightGBM Multi-Model Suite...")
    X = df[FEATURES]
    y_depth = df["depth_m"]
    y_flooded = df["is_flooded"]
    y_onset = df["onset_hours"]
    y_peak = df["peak_hours"]

    # Honest event-level split (split by episode_id to avoid temporal data leakage)
    episodes = df["episode_id"].unique()
    train_eps, test_eps = train_test_split(episodes, test_size=0.2, random_state=RANDOM_STATE)
    
    train_idx = df["episode_id"].isin(train_eps)
    test_idx = df["episode_id"].isin(test_eps)

    X_train, X_test = X[train_idx], X[test_idx]
    y_d_train, y_d_test = y_depth[train_idx], y_depth[test_idx]
    y_f_train, y_f_test = y_flooded[train_idx], y_flooded[test_idx]
    y_o_train, y_o_test = y_onset[train_idx], y_onset[test_idx]
    y_p_train, y_p_test = y_peak[train_idx], y_peak[test_idx]

    # 1. Median Regressor
    regressor = lgb.LGBMRegressor(n_estimators=180, learning_rate=0.04, random_state=RANDOM_STATE, verbose=-1)
    regressor.fit(X_train, y_d_train)

    # 2. Lower Quantile Regressor (10th percentile)
    reg_lo = lgb.LGBMRegressor(objective='quantile', alpha=0.10, n_estimators=180, learning_rate=0.04, random_state=RANDOM_STATE, verbose=-1)
    reg_lo.fit(X_train, y_d_train)

    # 3. Upper Quantile Regressor (90th percentile)
    reg_hi = lgb.LGBMRegressor(objective='quantile', alpha=0.90, n_estimators=180, learning_rate=0.04, random_state=RANDOM_STATE, verbose=-1)
    reg_hi.fit(X_train, y_d_train)

    # 4. Classifier (Probability of breach)
    classifier = lgb.LGBMClassifier(n_estimators=150, learning_rate=0.04, random_state=RANDOM_STATE, verbose=-1)
    classifier.fit(X_train, y_f_train)

    # 5. Onset Regressor (Hours until onset)
    onset_model = lgb.LGBMRegressor(n_estimators=150, learning_rate=0.04, random_state=RANDOM_STATE, verbose=-1)
    onset_model.fit(X_train[y_f_train == 1], y_o_train[y_f_train == 1])

    # 6. Peak Regressor (Hours until peak depth)
    peak_model = lgb.LGBMRegressor(n_estimators=150, learning_rate=0.04, random_state=RANDOM_STATE, verbose=-1)
    peak_model.fit(X_train[y_f_train == 1], y_p_train[y_f_train == 1])

    # Evaluation
    pred_d = regressor.predict(X_test)
    pred_lo = reg_lo.predict(X_test)
    pred_hi = reg_hi.predict(X_test)
    pred_prob = classifier.predict_proba(X_test)[:, 1]
    pred_bin = classifier.predict(X_test)

    print("=" * 55)
    print("         HONEST HELD-OUT EVENT EVALUATION METRICS       ")
    print("=" * 55)
    print(f" Depth Median MAE : {mean_absolute_error(y_d_test, pred_d):.3f} m")
    print(f" Depth R²         : {r2_score(y_d_test, pred_d):.3f}")
    print(f" 80% Conf Interval: {np.mean(pred_hi - pred_lo):.3f} m avg width")
    print(f" Detection AUC    : {roc_auc_score(y_f_test, pred_prob):.3f}")
    print(f" Detection F1     : {f1_score(y_f_test, pred_bin):.3f}")
    print("=" * 55)

    # SHAP Explainer
    print("Fitting SHAP TreeExplainer for feature attribution...")
    explainer = shap.TreeExplainer(classifier)

    return {
        "regressor": regressor,
        "reg_lo": reg_lo,
        "reg_hi": reg_hi,
        "classifier": classifier,
        "onset_model": onset_model,
        "peak_model": peak_model,
        "shap_explainer": explainer,
        "features": FEATURES,
        "bbox": BBOX,
        "flood_depth_m": FLOOD_DEPTH_M,
    }


def main():
    grid = build_spatial_grid(BBOX, STEP_DEG)
    df_data = generate_synthetic_monsoon_events(grid, n_episodes=40)
    bundle = train_models(df_data)

    # Attach spatial grid to bundle
    bundle["spatial_grid"] = grid

    output_path = "backend/floodsight_models.pkl"
    joblib.dump(bundle, output_path)
    print(f"\n[OK] Successfully exported trained ML bundle to '{output_path}'")


if __name__ == "__main__":
    main()
