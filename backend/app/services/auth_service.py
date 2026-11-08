
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.repositories import user_repository
from app.schemas.auth import RegisterRequest


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
