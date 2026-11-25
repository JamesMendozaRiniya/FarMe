from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.core.security import hash_password, verify_password
from app.repositories import user_repository


def get_user_profile(user):
    return user



def update_user_profile(db: Session, user, update_data: dict):
    if not update_data:
        return user

    username = update_data.get("username")

    if username is not None:
        username = username.strip()

        if not username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username cannot be empty."
            )

        existing_user = user_repository.get_user_by_username(db, username)

        if existing_user and existing_user.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username is already taken."
            )

        update_data["username"] = username

    return user_repository.update_user_profile(
        db,
        user,
        update_data
    )


def update_user_email(db: Session, user, new_email: str, current_password: str):
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    new_email = new_email.strip().lower()

    if new_email == user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is already your current email address."
        )

    existing_user = user_repository.get_user_by_email(db, new_email)

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already registered."
        )

    return user_repository.update_user_profile(
        db,
        user,
        {"email": new_email}
    )


def update_user_password(
    db: Session,
    user,
    current_password: str,
    new_password: str,
    confirm_new_password: str
):
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    if new_password != confirm_new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New passwords do not match."
        )

    if verify_password(new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your current password."
        )

    user.hashed_password = hash_password(new_password)

    db.commit()
    db.refresh(user)

    return user


def delete_user_account(db: Session, user, current_password: str):
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    user_repository.delete_user(db, user)
