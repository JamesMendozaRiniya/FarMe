from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.core.config import settings
from app.core.security import COOKIE_NAME
from app.schemas.user import (
    UserProfileResponse,
    UpdateUserProfileRequest,
    UpdateEmailRequest,
    UpdatePasswordRequest,
    DeleteAccountRequest
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(
    current_user=Depends(get_current_user)
):
    return user_service.get_user_profile(current_user)


@router.patch("/me", response_model=UserProfileResponse)
def update_my_profile(
    data: UpdateUserProfileRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    update_data = data.model_dump(exclude_unset=True)

    # a null first/last name/username would hit a NOT NULL column
    for required in ("first_name", "last_name", "username"):
        if required in update_data and update_data[required] is None:
            del update_data[required]

    return user_service.update_user_profile(
        db,
        current_user,
        update_data
    )


@router.patch("/me/email", response_model=UserProfileResponse)
def update_my_email(
    data: UpdateEmailRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return user_service.update_user_email(
        db,
        current_user,
        str(data.new_email),
        data.current_password
    )


@router.patch("/me/password")
def update_my_password(
    data: UpdatePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    user_service.update_user_password(
        db,
        current_user,
        data.current_password,
        data.new_password,
        data.confirm_new_password
    )

    return {
        "message": "Your password has been successfully changed."
    }


@router.delete("/me")
def delete_my_account(
    data: DeleteAccountRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    user_service.delete_user_account(
        db,
        current_user,
        data.current_password
    )

    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/"
    )

    return {
        "message": "Your FarMe account has been successfully deleted."
    }