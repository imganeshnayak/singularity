from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .models import load_models
from .routers import forecast, map_data, routes, explain, alerts


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Pre-warming FloodSight ML models on startup...")
    try:
        load_models()
        print("[OK] Models pre-warmed successfully.")
    except Exception as e:
        print(f"[WARN] Model load deferred ({e}). Models will be loaded on demand.")
    yield


app = FastAPI(
    title="FloodSight — AI Coastal Flood Intelligence API",
    version="1.0.0",
    description="Real-time flood prediction, onset timing, SHAP explainability, and emergency dispatch routing.",
    lifespan=lifespan
)

# CORS middleware for React frontend (Vite port 5173 / localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(forecast.router)
app.include_router(map_data.router)
app.include_router(routes.router)
app.include_router(explain.router)
app.include_router(alerts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "FloodSight AI API", "version": "1.0.0"}
