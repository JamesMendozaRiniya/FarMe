
import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_password_reset_email(recipient: str, reset_link: str):
    message = EmailMessage()
    message["Subject"] = "FarMe Password Reset"
    message["From"] = settings.SMTP_EMAIL
    message["To"] = recipient

    message.set_content(
        f"""
        We received a request to reset your FarMe password.

        Click the link below to create a new password:

        {reset_link}

        If you did not request this, you can ignore this email.
        """
    )

    message.add_alternative(
        f"""
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your FarMe password.</p>
        <p>Click the link below to create a new password:</p>
        <a href="{reset_link}">Reset My Password</a>
        <p>If you did not request this, you can ignore this email.</p>
        """,
        subtype="html"
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
        return server.send_message(message)
