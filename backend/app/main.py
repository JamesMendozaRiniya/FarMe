from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.database import Base, engine
from app.models import (
    User,
    Slot,
    Plant,
    Harvest,
    Note,
    Watering,
    NotificationState,
    Crop,
    PasswordReset,
)
from app.routers.auth import router as auth_router
from app.routers.slots import router as slots_router
from app.routers.plants import router as plants_router
from app.routers.harvests import router as harvests_router
from app.routers.notes import router as notes_router
from app.routers.waterings import router as waterings_router
from app.routers.notifications import router as notifications_router
from app.routers.crops import router as crops_router
from app.routers.users import router as users_router
from app.routers.ai import router as ai_router

app = FastAPI(
    title="FarMe API",
    description="Backend API for the FarMe farm management simulation",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


app.include_router(auth_router)
app.include_router(slots_router)
app.include_router(plants_router)
app.include_router(harvests_router)
app.include_router(notes_router)
app.include_router(waterings_router)
app.include_router(notifications_router)
app.include_router(crops_router)
app.include_router(users_router)
app.include_router(ai_router)


Base.metadata.create_all(bind=engine)


@app.get("/")
def home():
    return {
        "message": "Welcome to the FarMe API!"
    }


@app.get("/db-check")
def check_database():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "message": "Successfully connected to the Supabase database!"
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not connect to the database. Check the backend configuration."
        )