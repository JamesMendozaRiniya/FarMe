import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.repositories import password_reset_repository, user_repository
from app.schemas.auth import RegisterRequest
from app.services.email_service import send_password_reset_email

logger = logging.getLogger(__name__)


def register_user(db: Session, data: RegisterRequest):
    existing_username = user_repository.get_user_by_username(
        db,
        data.username
    )

    if existing_username:
        raise ValueError("Username is already taken.")

    existing_email = user_repository.get_user_by_email(
        db,
        str(data.email)
    )

    if existing_email:
        raise ValueError("Email is already registered.")

    user_data = {
        "first_name": data.first_name,
        "last_name": data.last_name,
        "username": data.username,
        "email": str(data.email),
        "hashed_password": hash_password(data.password),
        "avatar": data.avatar.model_dump() if data.avatar else None
    }

    try:
        return user_repository.create_user(db, user_data)

    except IntegrityError:
        raise ValueError("Username or email is already registered.")


def authenticate_user(db: Session, login: str, password: str):
    user = user_repository.get_user_by_login(db, login)

    if not user:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user
def request_password_reset(db: Session, email: str):
    # Always behaves the same whether or not the email exists,
    # so nobody can use this to find out which emails are registered.
    user = user_repository.get_user_by_email(db, email)

    if not user or not user.is_active:
        return

    password_reset_repository.invalidate_user_tokens(db, user.id)

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    password_reset_repository.create_reset_token(
        db,
        {
            "user_id": user.id,
            "token_hash": token_hash,
            "expires_at": expires_at
        }
    )

    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    try:
        send_password_reset_email(user.email, reset_link)

    except Exception:
        # Do not let an email problem change the response (it would reveal
        # that the account exists). The real reason goes to the server log.
        logger.exception("Could not send the password reset email.")


def reset_user_password(db: Session, token: str, new_password: str):
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    reset_record = password_reset_repository.get_reset_token(db, token_hash)

    if not reset_record:
        return False

    if reset_record.used_at is not None:
        return False

    if reset_record.expires_at <= datetime.now(timezone.utc):
        return False

    user = user_repository.get_user_by_id(db, reset_record.user_id)

    if not user or not user.is_active:
        return False

    user.hashed_password = hash_password(new_password)

    password_reset_repository.mark_token_used(db, reset_record)

    db.commit()

    return True
