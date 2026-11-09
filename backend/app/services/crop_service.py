from sqlalchemy.orm import Session

from app.repositories import crop_repository


def get_all_crops(
    db: Session,
    search: str | None = None,
    category: str | None = None
):
    return crop_repository.get_all_crops(
        db,
        search=search,
        category=category
    )


def get_crop_by_key(db: Session, crop_key: str):
    return crop_repository.get_crop_by_key(db, crop_key)


def get_crop_categories(db: Session):
    return crop_repository.get_crop_categories(db)