from pydantic import BaseModel


class WateringCreate(BaseModel):
    at: int
    plantIds: list[int] | None = None
