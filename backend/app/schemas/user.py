import re

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator
)

from app.schemas.auth import AvatarSchema


class UserProfileResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    username: str
    email: EmailStr
    avatar: dict | None = None

    model_config = ConfigDict(from_attributes=True)



class UpdateUserProfileRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    username: str | None = Field(default=None, min_length=3, max_length=50)
    avatar: AvatarSchema | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, value):
        if value is None:
            return value

        value = value.strip()

        if not value:
            raise ValueError("This field is required.")

        if not re.fullmatch(r"[\w\s.'’-]+", value, flags=re.UNICODE):
            raise ValueError("Please enter a valid name.")

        return value

    # same rule as registration: login lowercases what you type, so a
    # username with capital letters could never log in again.
    @field_validator("username")
    @classmethod
    def validate_username(cls, value):
        if value is None:
            return value

        value = value.strip().lower()

        if not re.fullmatch(r"[a-z0-9_]+", value):
            raise ValueError(
                "Username can only contain lowercase letters, numbers, and underscores."
            )

        return value


class UpdateEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str = Field(min_length=1)


class UpdatePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value):
        if not re.search(r"[A-Za-z]", value):
            raise ValueError("Password must contain at least one letter.")

        if not re.search(r"\d", value):
            raise ValueError("Password must contain at least one number.")

        return value


class DeleteAccountRequest(BaseModel):
    current_password: str = Field(min_length=1)
