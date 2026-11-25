from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.password_reset import PasswordReset


def invalidate_user_tokens(db: Session, user_id: int):
    tokens = db.query(PasswordReset).filter(
        PasswordReset.user_id == user_id,
        PasswordReset.used_at.is_(None)
    ).all()

    now = datetime.now(timezone.utc)

    for token in tokens:
        token.used_at = now

    db.commit()


def create_reset_token(db: Session, token_data: dict):
    reset_token = PasswordReset(**token_data)

    db.add(reset_token)
    db.commit()
    db.refresh(reset_token)

    return reset_token


def get_reset_token(db: Session, token_hash: str):
    return db.query(PasswordReset).filter(
        PasswordReset.token_hash == token_hash
    ).first()


def mark_token_used(db: Session, reset_token: PasswordReset):
    reset_token.used_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reset_token)

    return reset_token