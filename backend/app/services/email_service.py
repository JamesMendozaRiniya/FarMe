import html
import logging

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

# Resend is called over HTTPS (port 443), so it works on hosts that block
# SMTP ports (25, 465, 587), such as Render's free web services.
RESEND_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT_SECONDS = 10


def _send_email(recipient: str, subject: str, text: str, html_body: str) -> dict:
    if not settings.RESEND_API_KEY:
        raise ValueError("RESEND_API_KEY is not configured.")

    response = requests.post(
        RESEND_URL,
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "farme-backend/1.0",
        },
        json={
            "from": settings.EMAIL_FROM,
            "to": [recipient],
            "subject": subject,
            "text": text,
            "html": html_body,
        },
        timeout=RESEND_TIMEOUT_SECONDS,
    )

    if not response.ok:
        # Resend explains the problem in the body (for example an unverified
        # domain), so keep it in the error that gets logged.
        raise RuntimeError(
            f"Resend rejected the email ({response.status_code}): {response.text}"
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
