from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.dashboard import Slot
from app.schemas.slot import SlotCreate, SlotUpdate


router = APIRouter(
    prefix="/slots",
    tags=["Farm Slots"]
)

def serialize_slot(slot):
    return {
        "id": slot.id,
        "name": slot.name,
        "soil": slot.soil,
        "widthM": slot.width_m,
        "lengthM": slot.length_m,
        "location": slot.location,
        "lat": slot.lat,
        "lon": slot.lon,
        "place": slot.place,
        "lastWatered": (
            int(slot.last_watered.timestamp() * 1000)
            if slot.last_watered else None
        ),
        "plants": [
            {
                "id": plant.id,
                "row": plant.row,
                "col": plant.col,
                "cropKey": plant.crop_key,
                "plantedOn": plant.planted_on.isoformat(),
                "lastHarvested": (
                    plant.last_harvested.isoformat()
                    if plant.last_harvested else None
                )
            }
            for plant in slot.plants
        ],
        "harvests": [
            {
                "id": harvest.id,
                "cropKey": harvest.crop_key,
                "row": harvest.row,
                "col": harvest.col,
                "plantedOn": harvest.planted_on.isoformat(),
                "date": harvest.date.isoformat(),
                "amount": harvest.amount,
                "kept": harvest.kept
            }
            for harvest in slot.harvests
        ],
        "notes": [
            {
                "id": note.id,
                "cropKeys": note.crop_keys,
                "plantIds": note.plant_ids,
                "date": note.date.isoformat(),
                "text": note.text
            }
            for note in slot.notes
        ]
    }


# GET /slots
@router.get("")
def get_slots(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    slots = (
        db.query(Slot)
        .filter(Slot.user_id == current_user.id)
        .all()
    )

    return [serialize_slot(slot) for slot in slots]


# POST /slots
@router.post("", status_code=status.HTTP_201_CREATED)
def create_slot(
    slot_data: SlotCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):

    if not slot_data.name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Farm slot name cannot be empty."
        )

    slot = Slot(
        user_id=current_user.id,
        name=slot_data.name.strip(),
        soil=slot_data.soil,
        width_m=slot_data.widthM,
        length_m=slot_data.lengthM,
        location=slot_data.location,
        lat=slot_data.lat,
        lon=slot_data.lon,
        place=slot_data.place
    )

    try:
        db.add(slot)
        db.commit()
        db.refresh(slot)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A farm slot with this name already exists."
        )

    return serialize_slot(slot)


# PATCH /slots/{slot_id}
@router.patch("/{slot_id}")
def update_slot(
    slot_id: int,
    slot_data: SlotUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    slot = (
        db.query(Slot)
        .filter(
            Slot.id == slot_id,
            Slot.user_id == current_user.id
        )
        .first()
    )

    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farm slot not found."
        )

    updates = slot_data.model_dump(exclude_unset=True)

    field_mapping = {
        "widthM": "width_m",
        "lengthM": "length_m",
        "lastWatered": "last_watered"
    }

    for field, value in updates.items():
        if value is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null."
            )

        if field == "name":
            value = value.strip()

            if not value:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Farm slot name cannot be empty."
                )
            
        if field == "lastWatered" and value is not None:
            value = datetime.fromtimestamp(
                value / 1000,
                tz=timezone.utc
            )

        setattr(slot, field_mapping.get(field, field), value)

    try:
        db.commit()
        db.refresh(slot)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A farm slot with this name already exists."
        )

    return serialize_slot(slot)


# DELETE /slots/{slot_id}
@router.delete("/{slot_id}")
def delete_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    slot = (
        db.query(Slot)
        .filter(
            Slot.id == slot_id,
            Slot.user_id == current_user.id
        )
        .first()
    )

    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farm slot not found."
        )

    db.delete(slot)
    db.commit()

    return {
        "message": "Farm slot deleted successfully."
    }
