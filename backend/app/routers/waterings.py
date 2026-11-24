from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models import Plant, Slot, Watering
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

    if data.plantIds is None:
        target_ids = [p.id for p in slot.plants]
    else:
        wanted = set(data.plantIds)
        target_ids = [p.id for p in slot.plants if p.id in wanted]

        if len(target_ids) != len(wanted):
            raise HTTPException(
                status_code=404,
                detail="One or more plants were not found in this slot."
            )

    if target_ids:
        db.query(Plant).filter(Plant.id.in_(target_ids)).update(
            {Plant.last_watered: watered_at},
            synchronize_session=False
        )

    db.add(watering)
    db.commit()
    db.refresh(watering)

    return {
        "id": watering.id,
        "at": int(watering.at.timestamp() * 1000),
        "plantIds": target_ids
    }