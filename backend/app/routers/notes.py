from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models import Note, Slot
from app.models.user import User
from app.schemas.note import NoteCreate, NoteUpdate


router = APIRouter(tags=["Notes"])


def serialize_note(note: Note):
    return {
        "id": note.id,
        "cropKeys": note.crop_keys,
        "plantIds": note.plant_ids,
        "date": note.date.isoformat(),
        "text": note.text,
    }


def get_user_slot(db: Session, slot_id: int, user_id: int):
    return db.query(Slot).filter(
        Slot.id == slot_id,
        Slot.user_id == user_id
    ).first()


@router.post("/slots/{slot_id}/notes", status_code=201)
def create_note(
    slot_id: int,
    data: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = get_user_slot(db, slot_id, current_user.id)

    if not slot:
        raise HTTPException(status_code=404, detail="Farm slot not found.")

    note_text = data.text.strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="Note text cannot be empty.")

    note = Note(
        slot_id=slot.id,
        crop_keys=data.cropKeys,
        plant_ids=data.plantIds,
        date=data.date,
        text=note_text,
    )

    db.add(note)
    db.commit()
    db.refresh(note)

    return serialize_note(note)


@router.patch("/notes/{note_id}")
def update_note(
    note_id: int,
    data: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = (
        db.query(Note)
        .join(Slot, Note.slot_id == Slot.id)
        .filter(
            Note.id == note_id,
            Slot.user_id == current_user.id
        )
        .first()
    )

    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    updates = data.model_dump(exclude_unset=True)

    field_mapping = {
        "cropKeys": "crop_keys",
        "plantIds": "plant_ids",
        "date": "date",
        "text": "text",
    }

    for field, value in updates.items():
        if field == "text":
            if value is None or not value.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Note text cannot be empty."
                )
            value = value.strip()

        setattr(note, field_mapping[field], value)

    db.commit()
    db.refresh(note)

    return serialize_note(note)


@router.delete("/notes/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = (
        db.query(Note)
        .join(Slot, Note.slot_id == Slot.id)
        .filter(
            Note.id == note_id,
            Slot.user_id == current_user.id
        )
        .first()
    )

    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    db.delete(note)
    db.commit()

    return {"message": "Note deleted successfully."}