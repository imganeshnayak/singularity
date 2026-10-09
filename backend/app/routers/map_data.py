"""
Map Data Router — Roads, Buildings & Infrastructure GeoJSON queries
"""

from fastapi import APIRouter
import numpy as np
from typing import List, Dict, Any

from ..schemas import WeatherScenario
from ..models import get_models
from .forecast import run_zone_inference

router = APIRouter(prefix="/api/v1/map", tags=["map_data"])

# Scrape-once cache: OSM facilities per sector bbox so repeat severity
# changes only re-filter (cheap) instead of re-scraping (slow).
_fac_cache: dict = {}
_safe_cache: dict = {}


def _cached_facilities(bbox_tuple: tuple):
    import osmnx as ox
    key = tuple(round(x, 4) for x in bbox_tuple)
    if key not in _fac_cache:
        ox.settings.use_cache = True
        tags = {"amenity": ["hospital", "clinic", "school", "college",
                            "community_centre", "place_of_worship"]}
        try:
            fac = ox.features_from_bbox(bbox=bbox_tuple, tags=tags)
        except AttributeError:
            fac = ox.geometries_from_bbox(bbox=bbox_tuple, tags=tags)
        fac = fac[fac.geometry.type.isin(["Point", "Polygon", "MultiPolygon"])].copy()
        _fac_cache[key] = fac
    return _fac_cache[key].copy()


@router.post("/roads")
def get_road_status(weather: WeatherScenario):
    """
    Returns urban road network segments across the active spatial grid sector.
    Roads intersecting flooded zones are flagged as blocked (Red polylines).
    Roads in safe zones are clear (Green polylines).
    """
    import logging
    logger = logging.getLogger(__name__)

    bundle = get_models()
    zones = run_zone_inference(bundle, weather)
    grid = bundle["spatial_grid"]

    flooded_zones = {z["zone_id"] for z in zones if z["pred_depth_med"] >= bundle["flood_depth_m"]}
    
    roads_list = []
    
    try:
        import osmnx as ox
        from shapely.geometry import MultiPolygon, Polygon, box as sbox
        from shapely.ops import unary_union
        from .routes import _get_osm_graph_for_bbox

        total_bounds = grid.total_bounds
        bbox_tuple = (total_bounds[0], total_bounds[1], total_bounds[2], total_bounds[3])
        G_roads = _get_osm_graph_for_bbox(bbox_tuple)

        if G_roads is not None:
            flooded_geoms = [row.geometry for _, row in grid.iterrows() if row["zone_id"] in flooded_zones]
            flood_union = unary_union(flooded_geoms) if flooded_geoms else None

            roads_gdf = ox.graph_to_gdfs(G_roads, nodes=False, edges=True)
            if flood_union is not None:
                # Blocked only if a meaningful share of the segment lies
                # inside flood water (≥25% of its length), not on a mere touch.
                def _frac_blocked(g):
                    try:
                        if not g.intersects(flood_union):
                            return False
                        inter = g.intersection(flood_union)
                        return (inter.length / (g.length + 1e-12)) >= 0.25
                    except Exception:
                        return True
                roads_gdf["is_blocked"] = roads_gdf.geometry.map(_frac_blocked)
            else:
                roads_gdf["is_blocked"] = False

            # We iterate over the geometries and convert them to simple linestrings
            for idx, row in roads_gdf.iterrows():
                # get coordinate sequence
                geom = row.geometry
                is_blocked = bool(row["is_blocked"])
                if geom.geom_type == 'LineString':
                    coords = [[lat, lon] for lon, lat in geom.coords]
                    roads_list.append({
                        "road_id": f"osm_{idx[0]}_{idx[1]}",
                        "zone_id": "unknown",
                        "name": row.get("name", "Unknown Road") if isinstance(row.get("name"), str) else "Unknown Road",
                        "is_blocked": is_blocked,
                        "coordinates": coords
                    })
                elif geom.geom_type == 'MultiLineString':
                    for line in geom.geoms:
                        coords = [[lat, lon] for lon, lat in line.coords]
                        roads_list.append({
                            "road_id": f"osm_{idx[0]}_{idx[1]}_part",
                            "zone_id": "unknown",
                            "name": row.get("name", "Unknown Road") if isinstance(row.get("name"), str) else "Unknown Road",
                            "is_blocked": is_blocked,
                            "coordinates": coords
                        })
            
            # Ship ONLY blocked segments: clear streets are already visible on
            # the OSM basemap, so sending the full network just bloats the
            # payload and the frontend ignores non-blocked segments anyway.
            blocked_osm = [r for r in roads_list if r["is_blocked"]]
            return {
                "total_roads": len(roads_list),
                "blocked_count": len(blocked_osm),
                "roads": blocked_osm
            }
    except Exception as e:
        logger.error(f"Failed to use real OSM roads in /api/v1/map/roads: {e}")

    # Fallback to synthetic logic if osmnx fails
    centroids = []
    for idx, z in grid.iterrows():
        zid = z["zone_id"]
        geom = z.geometry
        minx, miny, maxx, maxy = geom.bounds
        midx = (minx + maxx) / 2.0
        midy = (miny + maxy) / 2.0
        centroids.append((midy, midx, zid))

    num_cells = len(centroids)
    for i in range(num_cells):
        lat1, lon1, zid1 = centroids[i]
        for j in range(i + 1, min(i + 30, num_cells)):
            lat2, lon2, zid2 = centroids[j]
            d_m = np.sqrt(((lat2 - lat1) * 111000.0)**2 + ((lon2 - lon1) * 111000.0 * np.cos(np.radians(lat1)))**2)
            if 150.0 <= d_m <= 450.0:
                is_blocked = (zid1 in flooded_zones) or (zid2 in flooded_zones)
                mid_lat = (lat1 + lat2) / 2.0
                mid_lon = (lon1 + lon2) / 2.0
                roads_list.append({
                    "road_id": f"street_{i}_{j}",
                    "zone_id": zid1,
                    "name": f"Urban Link #{i+1}-{j+1}",
                    "is_blocked": is_blocked,
                    "coordinates": [[lat1, lon1], [mid_lat, mid_lon], [lat2, lon2]]
                })

    # Only ship BLOCKED segments to the frontend: clear streets are already
    # visible on the OSM basemap, so rendering the full synthetic mesh just
    # buries the map under a green hatch (and wastes ~1000x payload).
    blocked_roads = [r for r in roads_list if r["is_blocked"]]

    return {
        "total_roads": len(roads_list),
        "blocked_count": len(blocked_roads),
        "roads": blocked_roads
    }


@router.post("/buildings")
def get_building_status(weather: WeatherScenario):
    """
    Returns comprehensive list of safe shelters and medical facilities across the sector.
    """
    import logging
    logger = logging.getLogger(__name__)

    bundle = get_models()
    zones = run_zone_inference(bundle, weather)
    grid = bundle["spatial_grid"]

    # Unsafe = flooded depth OR any flagged risk zone (HIGH/MEDIUM),
    # so shelters inside yellow/red-risk areas are never marked safe.
    flooded_zones = {z["zone_id"]: z for z in zones if z["pred_depth_med"] >= bundle["flood_depth_m"] or z["risk_level"] in ("HIGH", "MEDIUM")}
    total_bounds = grid.total_bounds
    
    buildings = []

    try:
        import osmnx as ox
        from shapely.geometry import MultiPolygon, Polygon, box as sbox
        from shapely.ops import unary_union
        
        bbox_tuple = (total_bounds[0], total_bounds[1], total_bounds[2], total_bounds[3])
        
        # We can cache facilities just like graph to avoid repeated slow overpass queries
        # But for now, we'll fetch them using osmnx's built-in cache
        # Scrape-once per sector; severity changes only re-filter below
        facilities = _cached_facilities(bbox_tuple)

        flooded_geoms = [row.geometry for _, row in grid.iterrows() if row["zone_id"] in flooded_zones]
        flood_union = unary_union(flooded_geoms) if flooded_geoms else None

        if flood_union is not None:
            facilities["is_flooded"] = facilities.geometry.intersects(flood_union)
        else:
            facilities["is_flooded"] = False

        for idx, row in facilities.iterrows():
            geom = row.geometry
            lat, lon = geom.centroid.y, geom.centroid.x
            is_flooded = bool(row["is_flooded"])
            
            amenity = row.get("amenity", "unknown")
            btype = "hospital" if amenity in ["hospital", "clinic"] else "shelter"
            
            name = row.get("name")
            if not isinstance(name, str):
                name = f"Unnamed {amenity.capitalize()}"

            buildings.append({
                "name": name,
                "type": btype,
                "zone_id": "unknown",
                "is_flooded": is_flooded,
                "flood_depth_m": 0.5 if is_flooded else 0.0,
                "coordinates": [lat, lon]
            })

        if any(b["type"] == "shelter" for b in buildings):
            return {
                "total_facilities": len(buildings),
                "threatened_hospitals": sum(1 for b in buildings if b["is_flooded"] and b["type"] == "hospital"),
                "safe_shelters": sum(1 for b in buildings if not b["is_flooded"] and b["type"] == "shelter"),
                "facilities": buildings
            }
        logger.warning("No OSM shelters found in the active sector; using dynamic fallback facilities")
    except Exception as e:
        logger.error(f"Failed to fetch real OSM facilities: {e}")

    # Fallback to dynamic local grid shelters if OSM fails or returns empty
    c_lat = (total_bounds[1] + total_bounds[3]) / 2.0
    c_lon = (total_bounds[0] + total_bounds[2]) / 2.0
    step = 0.005
    
    shelter_titles = [
        ("North Relief Hub", "shelter", c_lat + step, c_lon),
        ("East Rescue Depot", "depot", c_lat, c_lon + step),
        ("South Medical Center", "hospital", c_lat - step, c_lon),
        ("West Primary Clinic", "clinic", c_lat, c_lon - step),
    ]

    for title, btype, b_lat, b_lon in shelter_titles:
        # Find closest grid zone to assign flood status
        distances = (grid["centroid_lat"] - b_lat)**2 + (grid["centroid_lon"] - b_lon)**2
        closest_idx = distances.idxmin()
        zid = grid.iloc[closest_idx]["zone_id"]

        is_flooded = zid in flooded_zones
        depth = flooded_zones[zid]["pred_depth_med"] if is_flooded else 0.0

        buildings.append({
            "name": title,
            "type": btype,
            "zone_id": zid,
            "is_flooded": is_flooded,
            "flood_depth_m": depth,
            "coordinates": [b_lat, b_lon]
        })

    return {
        "total_facilities": len(buildings),
        "threatened_hospitals": sum(1 for b in buildings if b["is_flooded"] and b["type"] in ["hospital", "clinic"]),
        "safe_shelters": sum(1 for b in buildings if not b["is_flooded"] and b["type"] == "shelter"),
        "facilities": buildings
    }


@router.post("/safe-zones")
def get_safe_zones(weather: WeatherScenario):
    """New safe locations only — LOW zones outside all red/yellow risk areas."""
    import time
    cache_key = (round(weather.rain_3h, 1), round(weather.tide_height_msl, 2),
                 round(weather.wave_height_m, 2), round(weather.wind_speed_kmh, 1))
    now = time.time()
    entry = _safe_cache.get(cache_key)
    if entry and now - entry["_ts"] < 60.0:
        return entry["data"]
    bundle = get_models()
    zones = run_zone_inference(bundle, weather)
    safe = []
    for z in zones:
        if z["risk_level"] != "LOW":
            continue
        coords = z["geometry"]["coordinates"][0]
        cx = sum(p[0] for p in coords) / len(coords)
        cy = sum(p[1] for p in coords) / len(coords)
        safe.append({"zone_id": z["zone_id"], "coordinates": [cy, cx],
                     "elevation_m": z["elevation_m"],
                     "pred_depth_med": z["pred_depth_med"]})
    data = {"count": len(safe), "safe_zones": safe}
    _safe_cache[cache_key] = {"data": data, "_ts": now}
    return data
