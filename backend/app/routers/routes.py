"""
Routes Router — Safe Shelters Reachability (Civilian) & Emergency Response Priority (Responders)
"""

from fastapi import APIRouter
import numpy as np
from typing import List

from ..schemas import SafeRouteRequest, ShelterRouteResponse, EmergencyPriorityItem, WeatherScenario
from ..models import get_models
from .forecast import run_zone_inference

router = APIRouter(prefix="/api/v1/routes", tags=["routing"])

SHELTERS = [
    {"name": "St. Agnes College Shelter", "lat": 12.845, "lon": 74.850, "zone_id": "zone_020", "capacity": "HIGH"},
    {"name": "City Flood Relief Camp A", "lat": 12.855, "lon": 74.855, "zone_id": "zone_028", "capacity": "HIGH"},
    {"name": "Govt High School Shelter", "lat": 12.860, "lon": 74.860, "zone_id": "zone_035", "capacity": "MEDIUM"},
    {"name": "Ullal Town Hall Emergency Center", "lat": 12.815, "lon": 74.830, "zone_id": "zone_002", "capacity": "MEDIUM"},
    {"name": "Nitte University Campus Shelter", "lat": 12.860, "lon": 74.860, "zone_id": "zone_035", "capacity": "HIGH"},
    {"name": "Dwaraka Nagar Refuge Center", "lat": 12.815, "lon": 74.830, "zone_id": "zone_002", "capacity": "MEDIUM"},
    {"name": "Bajpe Community High School", "lat": 12.858, "lon": 74.850, "zone_id": "zone_050", "capacity": "MEDIUM"},
    {"name": "Surathkal Relief Station", "lat": 12.850, "lon": 74.835, "zone_id": "zone_065", "capacity": "HIGH"},
    {"name": "Moodabidri Emergency Facility", "lat": 12.840, "lon": 74.860, "zone_id": "zone_080", "capacity": "MEDIUM"},
]

URBAN_SPEED_KMH = 20.0  # travel speed km/h


import networkx as nx
import logging

logger = logging.getLogger(__name__)

# Cache OSM graph per BBOX key to avoid re-downloading on every request
_osm_graph_cache: dict = {}

def _get_osm_graph_for_bbox(bbox_tuple: tuple):
    """
    Download & cache real OSM drive graph for bbox.
    bbox_tuple: (min_lon, min_lat, max_lon, max_lat)
    Matches exactly: ox.graph_from_bbox(bbox=(minx, miny, maxx, maxy))
    """
    key = tuple(round(x, 4) for x in bbox_tuple)
    if key not in _osm_graph_cache:
        try:
            import osmnx as ox
            ox.settings.use_cache = True  # cache OSM queries to disk like Colab
            minx, miny, maxx, maxy = bbox_tuple
            G = ox.graph_from_bbox(bbox=(minx, miny, maxx, maxy), network_type="drive")
            _osm_graph_cache[key] = G
            logger.info(f"OSM graph cached for bbox {key}: {len(G.nodes)} nodes")
        except Exception as e:
            logger.warning(f"OSM graph download failed: {e}")
            _osm_graph_cache[key] = None
    return _osm_graph_cache.get(key)


@router.post("/safe", response_model=List[ShelterRouteResponse])
def get_safe_shelter_routes(req: SafeRouteRequest):
    import traceback
    bundle = get_models()
    zones = run_zone_inference(bundle, req.weather)
    grid = bundle["spatial_grid"]

    flooded_zones = {z["zone_id"] for z in zones if z["pred_depth_med"] >= bundle["flood_depth_m"]}

    orig_lat, orig_lon = req.origin_lat, req.origin_lon
    # Default origin = grid center (matching Colab CENTER_LAT/CENTER_LON)
    total_bounds = grid.total_bounds  # (minx, miny, maxx, maxy)
    if abs(orig_lat - 12.835) < 0.01 and abs(orig_lon - 74.845) < 0.01:
        orig_lat = float((total_bounds[1] + total_bounds[3]) / 2.0)
        orig_lon = float((total_bounds[0] + total_bounds[2]) / 2.0)

    # Static shelter list with real Mangaluru coords (used as route destinations)
    shelter_defs = [
        ("St. Agnes College Shelter",        12.845, 74.850, "HIGH"),
        ("Govt High School Shelter",          12.855, 74.855, "HIGH"),
        ("Ullal Town Hall Emergency Center",  12.815, 74.831, "MEDIUM"),
        ("Bajpe Community High School",       12.858, 74.850, "MEDIUM"),
        ("Surathkal Relief Station",          12.850, 74.840, "HIGH"),
    ]

    routes_output = []
    
    # ── Define default local fallback shelters early in case of early OSM failure ──
    c_lat = (total_bounds[1] + total_bounds[3]) / 2.0
    c_lon = (total_bounds[0] + total_bounds[2]) / 2.0
    step = 0.005
    shelter_defs = [
        ("North Refuge Center",        c_lat + step, c_lon, "HIGH"),
        ("East Relief Hub",            c_lat, c_lon + step, "MEDIUM"),
        ("South Safety Depot",         c_lat - step, c_lon, "HIGH"),
        ("West Coast Clinic",          c_lat, c_lon - step, "MEDIUM"),
    ]

    # ── Try real OSM routing (Colab-identical logic) ──────────────────────────
    try:
        import osmnx as ox
        from shapely.geometry import MultiPolygon, Polygon, box as sbox
        from shapely.ops import unary_union

        # 1. Build flood union geometry (matching Colab flood_ll)
        flooded_geoms = [row.geometry for _, row in grid.iterrows()
                         if row["zone_id"] in flooded_zones]
        flood_union = unary_union(flooded_geoms) if flooded_geoms else None

        # 2. Get real OSM road graph for the sector BBOX (Colab: graph_from_bbox)
        bbox_tuple = (total_bounds[0], total_bounds[1], total_bounds[2], total_bounds[3])
        G_roads = _get_osm_graph_for_bbox(bbox_tuple)

        if G_roads is None:
            raise RuntimeError("OSM graph unavailable, using fallback")

        # 2.5 Fetch real Safe Shelters from OSM
        try:
            amenity_tags = {"amenity": ["school", "college", "community_centre", "place_of_worship"]}
            try:
                facilities = ox.features_from_bbox(bbox=bbox_tuple, tags=amenity_tags)
            except AttributeError:
                facilities = ox.geometries_from_bbox(bbox=bbox_tuple, tags=amenity_tags)
            
            facilities = facilities[facilities.geometry.type.isin(["Point", "Polygon", "MultiPolygon"])].copy()
            if flood_union is not None:
                facilities["is_flooded"] = facilities.geometry.intersects(flood_union)
            else:
                facilities["is_flooded"] = False
            
            safe_shelters_gdf = facilities[~facilities["is_flooded"]]
            
            # Convert to list to route to (limit to top 8 closest to origin maybe? or just all)
            dynamic_shelters = []
            for idx, row in safe_shelters_gdf.iterrows():
                name = row.get("name")
                if not isinstance(name, str):
                    name = "Unnamed Shelter"
                dynamic_shelters.append((name, row.geometry.centroid.y, row.geometry.centroid.x, "MEDIUM"))
            
            # Sort by distance from origin to avoid routing to 100 shelters, just pick top 5
            dynamic_shelters.sort(key=lambda s: (s[1]-orig_lat)**2 + (s[2]-orig_lon)**2)
            if dynamic_shelters:
                shelter_defs = dynamic_shelters[:6]
            else:
                raise RuntimeError("No OSM safe shelters found")
        except Exception as e:
            logger.warning(f"OSM shelters fetch failed or empty, using local grid fallback: {e}")
            # shelter_defs remains the local default generated above

        # 3. Build roads GDF and mark blocked edges (Colab: roads_gdf["is_blocked"])
        roads_gdf = ox.graph_to_gdfs(G_roads, nodes=False, edges=True)
        if flood_union is not None:
            roads_gdf["is_blocked"] = roads_gdf.geometry.intersects(flood_union)
        else:
            roads_gdf["is_blocked"] = False

        # 4. Build G_clear — subgraph of unblocked nodes (exact Colab pattern)
        clear_edges = roads_gdf[~roads_gdf["is_blocked"]]
        clear_nodes_set = (
            set(clear_edges.index.get_level_values(0))
            .union(set(clear_edges.index.get_level_values(1)))
        )
        G_clear = G_roads.subgraph(clear_nodes_set).copy()

        # 5. Origin node (Colab: ox.nearest_nodes(G_clear, ORIGIN_LON, ORIGIN_LAT))
        origin_node = ox.nearest_nodes(G_clear, orig_lon, orig_lat)

        # 6. Route to each shelter (Colab: nx.shortest_path + PolyLine)
        for sname, s_lat, s_lon, cap in shelter_defs:
            # Check if shelter zone is flooded
            s_zone_flooded = (flood_union is not None and
                              flood_union.contains(
                                  __import__('shapely.geometry', fromlist=['Point']).Point(s_lon, s_lat)
                              ))
            try:
                dest_node = ox.nearest_nodes(G_clear, s_lon, s_lat)
                route = nx.shortest_path(G_clear, origin_node, dest_node, weight="length")

                # Colab: route_coordinates = [(node['y'], node['x']) for node in route]
                route_coords = [[G_clear.nodes[n]['y'], G_clear.nodes[n]['x']] for n in route]

                # Colab: total_length_m calculation
                total_length_m = sum(
                    min(d.get('length', 10.0) for d in G_clear.get_edge_data(u, v).values())
                    for u, v in zip(route[:-1], route[1:])
                )
                travel_speed_mps = URBAN_SPEED_KMH * 1000.0 / 3600.0
                eta_min = max(1.0, round(total_length_m / travel_speed_mps / 60.0, 1))

                routes_output.append(ShelterRouteResponse(
                    shelter_name=sname,
                    shelter_lat=s_lat,
                    shelter_lon=s_lon,
                    eta_minutes=eta_min,
                    distance_m=round(total_length_m, 0),
                    route_coords=route_coords,
                    is_reachable=not s_zone_flooded,
                    capacity_score=cap
                ))

            except (nx.NetworkXNoPath, nx.NodeNotFound):
                logger.warning(f"No clear OSM route to {sname}")
                # Mark unreachable but still show with dashed red (Colab skips, we keep)
                _append_fallback_route(routes_output, sname, cap, orig_lat, orig_lon,
                                       s_lat, s_lon, flooded_zones, is_blocked=True)

        routes_output.sort(key=lambda x: x.eta_minutes)
        return routes_output

    except Exception as e:
        import traceback
        logger.error(f"OSM routing failed, using fallback: {e}\n{traceback.format_exc()}")


    # ── Fallback: straight-line routes when OSM unavailable ──────────────────
    for sname, s_lat, s_lon, cap in shelter_defs:
        sz_flooded = any(
            z["zone_id"] in flooded_zones
            for z in zones
            if abs(z.get("centroid_lat", 0) - s_lat) < 0.005
        )
        _append_fallback_route(routes_output, sname, cap, orig_lat, orig_lon,
                               s_lat, s_lon, flooded_zones, is_blocked=sz_flooded)

    routes_output.sort(key=lambda x: x.eta_minutes)
    return routes_output


def _append_fallback_route(routes_output, sname, cap, orig_lat, orig_lon,
                            s_lat, s_lon, flooded_zones, is_blocked):
    d_lat = (s_lat - orig_lat) * 111000.0
    d_lon = (s_lon - orig_lon) * 111000.0 * np.cos(np.radians(orig_lat))
    dist_m = float(np.sqrt(d_lat**2 + d_lon**2))
    mid_lat = (orig_lat + s_lat) / 2.0 + (0.003 if is_blocked else 0.0005)
    mid_lon = (orig_lon + s_lon) / 2.0 + (-0.002 if is_blocked else 0.0005)
    effective_dist = dist_m * (1.4 if is_blocked else 1.1)
    travel_speed_mps = URBAN_SPEED_KMH * 1000.0 / 3600.0
    eta_min = max(1.0, round(effective_dist / travel_speed_mps / 60.0, 1))
    routes_output.append(ShelterRouteResponse(
        shelter_name=sname,
        shelter_lat=s_lat,
        shelter_lon=s_lon,
        eta_minutes=eta_min,
        distance_m=round(effective_dist, 0),
        route_coords=[[orig_lat, orig_lon], [mid_lat, mid_lon], [s_lat, s_lon]],
        is_reachable=not is_blocked,
        capacity_score=cap
    ))







@router.post("/responders", response_model=List[EmergencyPriorityItem])
def get_responder_priorities(weather: WeatherScenario):
    bundle = get_models()
    zones = run_zone_inference(bundle, weather)

    depot_lat, depot_lon = 12.830, 74.845

    priorities = []
    risk_zones = [z for z in zones if z["risk_level"] in ["HIGH", "MEDIUM"]]

    for z in risk_zones:
        zid = z["zone_id"]
        prob = z["pred_prob"]
        oh = z["onset_hours"]
        ph = z["peak_hours"]
        risk = z["risk_level"]
        
        centroid_lat = z["geometry"]["coordinates"][0][0][1]
        centroid_lon = z["geometry"]["coordinates"][0][0][0]

        d_lat = (centroid_lat - depot_lat) * 111000.0
        d_lon = (centroid_lon - depot_lon) * 111000.0 * np.cos(np.radians(depot_lat))
        dist_m = float(np.sqrt(d_lat**2 + d_lon**2))
        eta_min = round(float(dist_m / ((URBAN_SPEED_KMH * 1000.0) / 3600.0) / 60.0), 1)

        threatened = []
        if zid in ["zone_005", "zone_006"]:
            threatened.append("Mangaluru General Hospital")
        if zid in ["zone_012"]:
            threatened.append("Ullal Health Clinic")
        if z["elevation_m"] <= 1.5:
            threatened.append("Ground Floor Residential Colony")

        facility_weight = 2.5 if threatened else 1.0
        score = prob * (1.0 / (oh + 0.2)) * facility_weight
        recommended_vehicle, vehicle_reason = recommend_response_vehicle(
            onset_hours=oh,
            distance_m=dist_m,
            depth_m=float(z["pred_depth_hi"]),
            elevation_m=float(z["elevation_m"]),
            threatened=threatened,
        )
        
        reason = (
            f"Breach prob {prob:.0%}, onset in {oh:.1f}h. "
            f"{'Critical facility ' + threatened[0] + ' threatened! ' if threatened else ''}"
            f"Drivers: rain {weather.rain_3h:.0f}mm, tide {weather.tide_height_msl:.2f}m."
        )

        priorities.append({
            "zone_id": zid,
            "risk_level": risk,
            "onset_hours": oh,
            "peak_hours": ph,
            "threatened_facilities": threatened,
            "responder_eta_minutes": eta_min,
            "priority_score": round(float(score), 3),
            "reason": reason
            ,"recommended_vehicle": recommended_vehicle,
            "vehicle_reason": vehicle_reason
        })

    priorities.sort(key=lambda x: x["priority_score"], reverse=True)

    result = []
    for rank, p in enumerate(priorities, 1):
        result.append(EmergencyPriorityItem(
            rank=rank,
            zone_id=p["zone_id"],
            risk_level=p["risk_level"],
            onset_hours=p["onset_hours"],
            peak_hours=p["peak_hours"],
            threatened_facilities=p["threatened_facilities"],
            responder_eta_minutes=p["responder_eta_minutes"],
            priority_score=p["priority_score"],
            reason=p["reason"],
            recommended_vehicle=p["recommended_vehicle"],
            vehicle_reason=p["vehicle_reason"]
        ))

    return result


def recommend_response_vehicle(onset_hours: float, distance_m: float, depth_m: float,
                               elevation_m: float, threatened: list[str]) -> tuple[str, str]:
    """Choose the fastest practical response mode from forecast and exposure signals."""
    if onset_hours <= 2.0 and (threatened or distance_m >= 7000):
        return "HELICOPTER", "Fastest option for critical urgency or distant access."
    if depth_m >= 0.45 or elevation_m <= 1.5:
        return "BOAT", "Best fit for deep or low-lying flooded access where roads may fail."
    return "TRUCK", "Road access is the most practical and fastest response mode."
