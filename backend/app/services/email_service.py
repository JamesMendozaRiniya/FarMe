import base64
import html
import logging
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
TIMEOUT_SECONDS = 10

_token = {"value": None, "expires_at": 0.0}
_token_lock = threading.Lock()


def _access_token(force_refresh: bool = False) -> str:
    with _token_lock:
        if (
            not force_refresh
            and _token["value"]
            and time.time() < _token["expires_at"] - 60
        ):
            return _token["value"]

        missing = [
            name
            for name in (
                "GMAIL_CLIENT_ID",
                "GMAIL_CLIENT_SECRET",
                "GMAIL_REFRESH_TOKEN",
                "GMAIL_SENDER",
            )
            if not getattr(settings, name)
        ]
        if missing:
            raise ValueError(f"Email is not configured. Missing: {', '.join(missing)}")

        response = requests.post(
            TOKEN_URL,
            data={
                "client_id": settings.GMAIL_CLIENT_ID,
                "client_secret": settings.GMAIL_CLIENT_SECRET,
                "refresh_token": settings.GMAIL_REFRESH_TOKEN,
                "grant_type": "refresh_token",
            },
            timeout=TIMEOUT_SECONDS,
        )

        if not response.ok:
            raise RuntimeError(
                f"Google refused the sign-in ({response.status_code}): {response.text}"
            )

        data = response.json()
        _token["value"] = data["access_token"]
        _token["expires_at"] = time.time() + int(data.get("expires_in", 3600))
        return _token["value"]


def _send_email(recipient: str, subject: str, text: str, html_body: str) -> dict:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(("FarMe", settings.GMAIL_SENDER))
    message["To"] = recipient
    message.set_content(text)
    message.add_alternative(html_body, subtype="html")

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    for attempt in range(2):
        response = requests.post(
            SEND_URL,
            headers={"Authorization": f"Bearer {_access_token(force_refresh=attempt > 0)}"},
            json={"raw": raw},
            timeout=TIMEOUT_SECONDS,
        )

        if response.status_code == 401 and attempt == 0:
            continue

        break

    if not response.ok:
        raise RuntimeError(
            f"Gmail rejected the email ({response.status_code}): {response.text}"
        )

    return response.json()


def send_password_reset_email(recipient: str, reset_link: str):
    safe_link = html.escape(reset_link, quote=True)

    text = (
        "We received a request to reset your FarMe password.\n\n"
        "Open the link below to create a new password:\n\n"
        f"{reset_link}\n\n"
        "This link expires in 15 minutes.\n"
        "If you did not request this, you can ignore this email."
    )

    html_body = f"""
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your FarMe password.</p>
        <p>Click the link below to create a new password:</p>
        <p><a href="{safe_link}">Reset My Password</a></p>
        <p>This link expires in 15 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
    """

    return _send_email(recipient, "FarMe Password Reset", text, html_body)
