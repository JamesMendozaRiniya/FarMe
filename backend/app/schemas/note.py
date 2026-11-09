from datetime import date as Date
from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    cropKeys: list[str] = Field(default_factory=list)
    plantIds: list[int] | None = None
    date: Date
    text: str = Field(min_length=1)


class NoteUpdate(BaseModel):
    cropKeys: list[str] | None = None
    plantIds: list[int] | None = None
    date: Date | None = None
    text: str | None = Field(default=None, min_length=1)