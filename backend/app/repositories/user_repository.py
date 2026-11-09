from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User


def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(
        User.username == username
    ).first()


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(
        User.email == email
    ).first()


def get_user_by_login(db: Session, login: str):
    return db.query(User).filter(
        or_(
            User.username == login,
            User.email == login
        )
    ).first()


def get_user_by_id(db: Session, user_id: int):
    return db.query(User).filter(
        User.id == user_id
    ).first()


def create_user(db: Session, user_data: dict):
    user = User(**user_data)

    try:
        db.add(user)
        db.commit()
        db.refresh(user)

        return user

    except Exception:
        db.rollback()
        raise
def update_user_profile(db: Session, user, update_data: dict):
    try:
        for key, value in update_data.items():
            setattr(user, key, value)

        db.commit()
        db.refresh(user)

        return user

    except Exception:
        db.rollback()
        raise


def delete_user(db: Session, user):
    try:
        db.delete(user)
        db.commit()

    except Exception:
        db.rollback()
        raise
