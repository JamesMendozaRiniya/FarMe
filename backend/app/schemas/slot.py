from pydantic import BaseModel, Field
from typing import Literal


SoilType = Literal["Clay", "Loam", "Sandy", "Silty"]


class SlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    soil: SoilType
    widthM: float = Field(ge=0.5, le=200)
    lengthM: float = Field(ge=0.5, le=200)
    location: str = Field(min_length=1, max_length=255)
    lat: float | None = None
    lon: float | None = None
    place: str | None = None


class SlotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    soil: SoilType | None = None
    widthM: float | None = Field(default=None, ge=0.5, le=200)
    lengthM: float | None = Field(default=None, ge=0.5, le=200)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    lat: float | None = None
    lon: float | None = None
    place: str | None = None
    lastWatered: int | None = None