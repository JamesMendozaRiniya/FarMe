from datetime import date as Date
from pydantic import BaseModel, Field


class HarvestCreate(BaseModel):
    cropKey: str = Field(min_length=1, max_length=100)
    row: int = Field(ge=0)
    col: int = Field(ge=0)
    plantedOn: Date
    date: Date
    amount: str = Field(min_length=1, max_length=100)
    kept: bool = False


class HarvestUpdate(BaseModel):
    cropKey: str | None = Field(default=None, min_length=1, max_length=100)
    row: int | None = Field(default=None, ge=0)
    col: int | None = Field(default=None, ge=0)
    plantedOn: Date | None = None
    date: Date | None = None
    amount: str | None = Field(default=None, min_length=1, max_length=100)
    kept: bool | None = None