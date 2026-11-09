from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class CropResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    en: str
    emoji: str
    type: Literal["vegetable", "fruit"]
    maturity: int
    soils: list[str]
    seasons: list[Literal["wet", "dry"]]
    temp: tuple[int, int]
    big: bool = False