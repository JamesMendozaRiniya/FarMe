from typing import Literal

from pydantic import BaseModel, Field, field_validator


SoilType = Literal["Clay", "Loam", "Sandy", "Silty"]


class SlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    soil: SoilType
    widthM: float = Field(ge=0.5, le=200)
    lengthM: float = Field(ge=0.5, le=200)
    location: str = Field(min_length=1, max_length=255)
    lat: float | None = None
    lon: float | None = None
    place: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        value = value.strip()

        if not value:
            raise ValueError("Field name is required.")

        if not all(char.isalnum() or char in " _.'’-" for char in value):
            raise ValueError("Please enter a valid field name.")

        return value

    @field_validator("location")
    @classmethod
    def validate_location(cls, value):
        value = value.strip()

        if not value:
            raise ValueError("Location is required.")

        return value

    @field_validator("place")
    @classmethod
    def validate_place(cls, value):
        if value is None:
            return value

        value = value.strip()
        return value or None


class SlotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    soil: SoilType | None = None
    widthM: float | None = Field(default=None, ge=0.5, le=200)
    lengthM: float | None = Field(default=None, ge=0.5, le=200)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    lat: float | None = None
    lon: float | None = None
    place: str | None = None
    lastWatered: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        if value is None:
            return value

        value = value.strip()

        if not value:
            raise ValueError("Field name is required.")

        if not all(char.isalnum() or char in " _.'’-" for char in value):
            raise ValueError("Please enter a valid field name.")

        return value

    @field_validator("location")
    @classmethod
    def validate_location(cls, value):
        if value is None:
            return value

        value = value.strip()

        if not value:
            raise ValueError("Location is required.")

        return value

    @field_validator("place")
    @classmethod
    def validate_place(cls, value):
        if value is None:
            return value

        value = value.strip()
        return value or None