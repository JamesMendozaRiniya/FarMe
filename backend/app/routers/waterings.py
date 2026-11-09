from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models import Slot, Watering
from app.models.user import User
from app.schemas.watering import WateringCreate


router = APIRouter(tags=["Waterings"])


@router.post("/slots/{slot_id}/waterings", status_code=201)
def create_watering(
    slot_id: int,
    data: WateringCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = db.query(Slot).filter(
        Slot.id == slot_id,
        Slot.user_id == current_user.id
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Farm slot not found.")

    watered_at = datetime.fromtimestamp(
        data.at / 1000,
        tz=timezone.utc
    )

    watering = Watering(
        slot_id=slot.id,
        at=watered_at
    )

    slot.last_watered = watered_at
    
    db.add(watering)
    db.commit()
    db.refresh(watering)

    return {
        "id": watering.id,
        "at": int(watering.at.timestamp() * 1000)
    }