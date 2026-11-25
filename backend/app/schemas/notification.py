from pydantic import BaseModel


class NotificationUpdate(BaseModel):
    read: bool