from pydantic import BaseModel


class WateringCreate(BaseModel):
    at: int