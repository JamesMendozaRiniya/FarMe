from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.database import Base, engine
from app.models.user import User
from app.routers.auth import router as auth_router


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