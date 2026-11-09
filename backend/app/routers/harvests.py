from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models import Harvest, Slot
from app.models.user import User
from app.schemas.harvest import HarvestCreate, HarvestUpdate


router = APIRouter(tags=["Harvests"])


def serialize_harvest(harvest: Harvest):
    return {
        "id": harvest.id,
        "cropKey": harvest.crop_key,
        "row": harvest.row,
        "col": harvest.col,
        "plantedOn": harvest.planted_on.isoformat(),
        "date": harvest.date.isoformat(),
        "amount": harvest.amount,
        "kept": harvest.kept,
    }


@router.post(
    "/slots/{slot_id}/harvests",
    status_code=status.HTTP_201_CREATED
)
def create_harvest(
    slot_id: int,
    data: HarvestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = db.query(Slot).filter(
        Slot.id == slot_id,
        Slot.user_id == current_user.id
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Farm slot not found.")

    harvest = Harvest(
        slot_id=slot.id,
        crop_key=data.cropKey,
        row=data.row,
        col=data.col,
        planted_on=data.plantedOn,
        date=data.date,
        amount=data.amount.strip(),
        kept=data.kept,
    )

    if not harvest.amount:
        raise HTTPException(status_code=400, detail="Amount cannot be empty.")

    db.add(harvest)
    db.commit()
    db.refresh(harvest)

    return serialize_harvest(harvest)


@router.patch("/harvests/{harvest_id}")
def update_harvest(
    harvest_id: int,
    data: HarvestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    harvest = (
        db.query(Harvest)
        .join(Slot, Harvest.slot_id == Slot.id)
        .filter(
            Harvest.id == harvest_id,
            Slot.user_id == current_user.id
        )
        .first()
    )

    if not harvest:
        raise HTTPException(status_code=404, detail="Harvest not found.")

    updates = data.model_dump(exclude_unset=True)

    field_mapping = {
        "cropKey": "crop_key",
        "row": "row",
        "col": "col",
        "plantedOn": "planted_on",
        "date": "date",
        "amount": "amount",
        "kept": "kept",
    }

    for field, value in updates.items():
        if field == "amount":
            value = value.strip()
            if not value:
                raise HTTPException(
                    status_code=400,
                    detail="Amount cannot be empty."
                )

        setattr(harvest, field_mapping[field], value)

    db.commit()
    db.refresh(harvest)

    return serialize_harvest(harvest)


@router.delete("/harvests/{harvest_id}")
def delete_harvest(
    harvest_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    harvest = (
        db.query(Harvest)
        .join(Slot, Harvest.slot_id == Slot.id)
        .filter(
            Harvest.id == harvest_id,
            Slot.user_id == current_user.id
        )
        .first()
    )

    if not harvest:
        raise HTTPException(status_code=404, detail="Harvest not found.")

    db.delete(harvest)
    db.commit()

    return {"message": "Harvest deleted successfully."}