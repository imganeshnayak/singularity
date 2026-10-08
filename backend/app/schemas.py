"""
Pydantic Schemas for API Request and Response Payload Validation
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class SectorConfig(BaseModel):
    city_name: str = Field(default="Mangaluru / Ullal Estuary Sector")
    center_lat: float = Field(default=12.835)
    center_lon: float = Field(default=74.845)
    step_deg: float = Field(default=0.0025, description="Grid resolution (~250m step)")


class WeatherScenario(BaseModel):
    rain_1h: float = Field(default=60.0, description="1-hour rainfall in mm")
    rain_3h: float = Field(default=115.0, description="3-hour cumulative rainfall in mm")
    rain_6h: float = Field(default=160.0, description="6-hour cumulative rainfall in mm")
    tide_height_msl: float = Field(default=2.75, description="Tide height above mean sea level in meters")
    tide_trend: float = Field(default=0.15, description="Tide rate of change in meters/hour")
    wave_height_m: float = Field(default=2.1, description="Wave height in meters")
    wind_speed_kmh: float = Field(default=40.0, description="Wind speed in km/h")


class ZonePrediction(BaseModel):
    zone_id: str
    pred_prob: float
    pred_depth_lo: float
    pred_depth_med: float
    pred_depth_hi: float
    onset_hours: float
    peak_hours: float
    risk_level: str  # HIGH, MEDIUM, LOW
    elevation_m: float
    dist_coast_m: float
    geometry: Dict[str, Any]


class ZoneAlert(BaseModel):
    zone_id: str
    risk_level: str
    alert_text: str
    onset_time_str: str
    peak_time_str: str
    primary_drivers: List[str]
    depth_med_m: float
    depth_lo_m: float
    depth_hi_m: float
    uncertainty_pct: float
    trend: str
    recommended_action: str
    threatened_facilities: List[str] = []
    status: str = "new"


class SafeRouteRequest(BaseModel):
    origin_lat: float = Field(default=12.835)
    origin_lon: float = Field(default=74.845)
    weather: WeatherScenario = Field(default_factory=WeatherScenario)


class ShelterRouteResponse(BaseModel):
    shelter_name: str
    shelter_lat: float
    shelter_lon: float
    eta_minutes: float
    distance_m: float
    route_coords: List[List[float]]  # [[lat, lon], ...]
    is_reachable: bool
    capacity_score: str  # HIGH, MEDIUM


class EmergencyPriorityItem(BaseModel):
    rank: int
    zone_id: str
    risk_level: str
    onset_hours: float
    peak_hours: float
    threatened_facilities: List[str]
    responder_eta_minutes: float
    priority_score: float
    reason: str
    recommended_vehicle: str
    vehicle_reason: str


class FactorContribution(BaseModel):
    factor: str
    contribution: str
    plain_text: str


class ExplainResponse(BaseModel):
    zone_id: str
    risk_level: str
    top_factors: List[FactorContribution]
    summary: str
    ai_explanation: Optional[str] = None
    ai_action: Optional[str] = None
    ai_model: Optional[str] = "gemma3:4b (Ollama)"
