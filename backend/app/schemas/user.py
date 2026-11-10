import re

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator
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
    first_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=40
    )
    last_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=40
    )
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=20
    )
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
    new_email: EmailStr = Field(max_length=100)
    current_password: str = Field(min_length=1)

    @field_validator("new_email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()


class UpdatePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=72)
    confirm_new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value):
        if value != value.strip():
            raise ValueError(
                "Password cannot start or end with whitespace."
            )

        if not re.search(r"[A-Za-z]", value):
            raise ValueError("Password must contain at least one letter.")

        if not re.search(r"\d", value):
            raise ValueError("Password must contain at least one number.")

        return value

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.new_password != self.confirm_new_password:
            raise ValueError("Passwords do not match.")

        return self


class DeleteAccountRequest(BaseModel):
    current_password: str = Field(min_length=1)