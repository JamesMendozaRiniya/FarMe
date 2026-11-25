from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.dashboard import (
    Slot,
    Plant,
    Harvest,
    Note,
    Watering,
    NotificationState,
)
from app.models.password_reset import PasswordReset
from app.models.chat import ChatConversation, ChatMessage


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

        conversation_ids = [
            row[0]
            for row in db.query(ChatConversation.id).filter(
                ChatConversation.user_id == user_id
            ).all()
        ]

        if conversation_ids:
            db.query(ChatMessage).filter(
                ChatMessage.conversation_id.in_(conversation_ids)
            ).delete(synchronize_session=False)

            db.query(ChatConversation).filter(
                ChatConversation.id.in_(conversation_ids)
            ).delete(synchronize_session=False)

        slot_ids = [
            row[0]
            for row in db.query(Slot.id).filter(
                Slot.user_id == user_id
            ).all()
        ]

        if slot_ids:
            db.query(Note).filter(
                Note.slot_id.in_(slot_ids)
            ).delete(synchronize_session=False)

            db.query(Watering).filter(
                Watering.slot_id.in_(slot_ids)
            ).delete(synchronize_session=False)

            db.query(Harvest).filter(
                Harvest.slot_id.in_(slot_ids)
            ).delete(synchronize_session=False)

            db.query(Plant).filter(
                Plant.slot_id.in_(slot_ids)
            ).delete(synchronize_session=False)

            db.query(Slot).filter(
                Slot.id.in_(slot_ids)
            ).delete(synchronize_session=False)

        db.query(NotificationState).filter(
            NotificationState.user_id == user_id
        ).delete(synchronize_session=False)

        db.query(PasswordReset).filter(
            PasswordReset.user_id == user_id
        ).delete(synchronize_session=False)

        db.delete(user)
        db.commit()

    except Exception:
        db.rollback()
        raise
