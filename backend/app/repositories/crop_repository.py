from sqlalchemy.orm import Session

from app.models.crop import Crop


def get_all_crops(db: Session, search: str | None = None, category: str | None = None):
    query = db.query(Crop)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            Crop.name.ilike(search_term) |
            Crop.en.ilike(search_term)
        )

    if category:
        query = query.filter(Crop.type.ilike(category.strip()))

    return query.order_by(Crop.name.asc()).all()


def get_crop_by_key(db: Session, crop_key: str):
    return db.query(Crop).filter(Crop.key == crop_key).first()


def get_crop_categories(db: Session):
    results = (
        db.query(Crop.type)
        .distinct()
        .order_by(Crop.type.asc())
        .all()
    )

    return [result[0] for result in results]