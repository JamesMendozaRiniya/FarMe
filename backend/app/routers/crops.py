from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.crop import CropResponse
from app.services import crop_service


router = APIRouter(
    prefix="/crops",
    tags=["Crop Library"]
)


@router.get("", response_model=list[CropResponse])
def get_crops(
    search: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db)
):
    return crop_service.get_all_crops(
        db,
        search=search,
        category=category
    )


@router.get("/categories", response_model=list[str])
def get_categories(db: Session = Depends(get_db)):
    return crop_service.get_crop_categories(db)


@router.get("/{crop_key}", response_model=CropResponse)
def get_crop(crop_key: str, db: Session = Depends(get_db)):
    crop = crop_service.get_crop_by_key(db, crop_key)

    if not crop:
        raise HTTPException(
            status_code=404,
            detail="Crop not found."
        )

    return crop