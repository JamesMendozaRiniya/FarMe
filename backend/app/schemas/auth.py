import re
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator
)


class AvatarSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    style: Literal[
        "sprouts",
        "thumbs",
        "fun-emoji",
        "big-smile",
        "micah",
        "personas",
        "miniavs",
        "avataaars",
        "pixel-art",
        "lorelei"
    ]

    seed: str = Field(min_length=1, max_length=100)

    background: Literal[
        "dec59e",
        "c4866d",
        "a9b88a",
        "fbf6ea",
        "6a784d"
    ] | None = None


class RegisterRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid"
    )

    first_name: str = Field(alias="firstName", min_length=1, max_length=100)
    last_name: str = Field(alias="lastName", min_length=1, max_length=100)

    username: str = Field(min_length=3, max_length=50)
    email: EmailStr

    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(alias="confirmPassword", min_length=8, max_length=128)

    avatar: AvatarSchema | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, value):
        value = value.strip()

        if not value:
            raise ValueError("This field is required.")

        if not re.fullmatch(r"[\w\s.'’-]+", value, flags=re.UNICODE):
            raise ValueError("Please enter a valid name.")

        return value

    @field_validator("username")
    @classmethod
    def validate_username(cls, value):
        value = value.strip().lower()

        if not re.fullmatch(r"[a-z0-9_]+", value):
            raise ValueError(
                "Username can only contain lowercase letters, numbers, and underscores."
            )

        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")

        if not re.search(r"[A-Za-z]", self.password):
            raise ValueError("Password must contain at least one letter.")

        if not re.search(r"\d", self.password):
            raise ValueError("Password must contain at least one number.")

        return self


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid"
    )

    login: str = Field(alias="identifier", min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    remember: bool = False

    @field_validator("login")
    @classmethod
    def normalize_login(cls, value):
        return value.strip().lower()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    username: str
    email: EmailStr
    avatar: AvatarSchema | None = None
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value):
        if not re.search(r"[A-Za-z]", value):
            raise ValueError("Password must contain at least one letter.")

        if not re.search(r"\d", value):
            raise ValueError("Password must contain at least one number.")

        return value