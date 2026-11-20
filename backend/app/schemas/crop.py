from typing import Literal
from pydantic import BaseModel, ConfigDict


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
