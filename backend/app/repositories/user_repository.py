from sqlalchemy import or_, text
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
        user_id = user.id

        db.execute(text("""
            DELETE FROM field_harvests
            WHERE field_id IN (
                SELECT id FROM fields WHERE user_id = :user_id
            )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM planted_crops
            WHERE field_id IN (
                SELECT id FROM fields WHERE user_id = :user_id
            )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM journal_notes
            WHERE user_id = :user_id
               OR field_id IN (
                   SELECT id FROM fields WHERE user_id = :user_id
               )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM fields WHERE user_id = :user_id
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM notes
            WHERE slot_id IN (
                SELECT id FROM slots WHERE user_id = :user_id
            )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM waterings
            WHERE slot_id IN (
                SELECT id FROM slots WHERE user_id = :user_id
            )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM harvests
            WHERE slot_id IN (
                SELECT id FROM slots WHERE user_id = :user_id
            )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM plants
            WHERE slot_id IN (
                SELECT id FROM slots WHERE user_id = :user_id
            )
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM slots WHERE user_id = :user_id
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM notification_states
            WHERE user_id = :user_id
        """), {"user_id": user_id})

        db.execute(text("""
            DELETE FROM password_resets
            WHERE user_id = :user_id
        """), {"user_id": user_id})

        db.delete(user)
        db.commit()

    except Exception:
        db.rollback()
        raise