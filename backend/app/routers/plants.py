from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.database import get_db
from app.core.dependencies import get_current_user
from app.models import Plant, Slot
from app.schemas.plant import PlantCreate, PlantUpdate, PlantsMove


router = APIRouter(tags=["Plants"])


def serialize_plant(plant):
    return {
        "id": plant.id,
        "cropKey": plant.crop_key,
        "row": plant.row,
        "col": plant.col,
        "plantedOn": plant.planted_on.isoformat(),
        "lastHarvested": (
            plant.last_harvested.isoformat()
            if plant.last_harvested else None
        ),
        "lastWatered": (
            int(plant.last_watered.timestamp() * 1000)
            if plant.last_watered else None
        )
    }


@router.post("/slots/{slot_id}/plants")
def add_plant(
    slot_id: int,
    data: PlantCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    slot = db.query(Slot).filter(
        Slot.id == slot_id,
        Slot.user_id == current_user.id
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Farm slot not found.")

    plant = Plant(
        slot_id=slot.id,
        crop_key=data.cropKey,
        row=data.row,
        col=data.col,
        planted_on=data.plantedOn
    )

    db.add(plant)

    try:
        db.commit()
        db.refresh(plant)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This grid position is already occupied."
        )

    return serialize_plant(plant)


@router.post("/slots/{slot_id}/plants/move")
def move_plants(
    slot_id: int,
    data: PlantsMove,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Move many plants in one request and one transaction."""
    slot = db.query(Slot).filter(
        Slot.id == slot_id,
        Slot.user_id == current_user.id
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Farm slot not found.")

    targets = {m.id: (m.row, m.col) for m in data.moves}
    plants = {p.id: p for p in slot.plants}

    if any(pid not in plants for pid in targets):
        raise HTTPException(
            status_code=404,
            detail="One or more plants were not found in this slot."
        )

    final_spots = list(targets.values())
    staying = {
        (p.row, p.col) for pid, p in plants.items() if pid not in targets
    }

    if len(set(final_spots)) != len(final_spots) or staying & set(final_spots):
        raise HTTPException(
            status_code=409,
            detail="This grid position is already occupied."
        )

    try:
        for pid in targets:
            plants[pid].row = -pid
            plants[pid].col = -1
        db.flush()

        for pid, (row, col) in targets.items():
            plants[pid].row = row
            plants[pid].col = col

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This grid position is already occupied."
        )

    return {"moved": [serialize_plant(plants[pid]) for pid in targets]}


@router.patch("/plants/{plant_id}")
def update_plant(
    plant_id: int,
    data: PlantUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    plant = db.query(Plant).join(Slot).filter(
        Plant.id == plant_id,
        Slot.user_id == current_user.id
    ).first()

    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found.")

    updates = data.model_dump(exclude_unset=True, exclude_none=True)

    field_mapping = {
        "cropKey": "crop_key",
        "plantedOn": "planted_on",
        "lastHarvested": "last_harvested",
        "row": "row",
        "col": "col"
    }

    for field, value in updates.items():
        setattr(plant, field_mapping[field], value)

    try:
        db.commit()
        db.refresh(plant)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This grid position is already occupied."
        )

    return serialize_plant(plant)


@router.delete("/plants/{plant_id}")
def delete_plant(
    plant_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    plant = db.query(Plant).join(Slot).filter(
        Plant.id == plant_id,
        Slot.user_id == current_user.id
    ).first()

    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found.")

    db.delete(plant)
    db.commit()

    return {"message": "Plant deleted successfully."}