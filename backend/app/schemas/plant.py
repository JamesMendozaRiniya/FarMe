from datetime import date
from pydantic import BaseModel, Field


class PlantCreate(BaseModel):
    cropKey: str = Field(min_length=1, max_length=100)
    row: int = Field(ge=0)
    col: int = Field(ge=0)
    plantedOn: date


class PlantUpdate(BaseModel):
    cropKey: str | None = Field(default=None, min_length=1, max_length=100)
    row: int | None = Field(default=None, ge=0)
    col: int | None = Field(default=None, ge=0)
    plantedOn: date | None = None
    lastHarvested: date | None = None