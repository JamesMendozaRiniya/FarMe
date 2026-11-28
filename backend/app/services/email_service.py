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
            raise ValueError(
                f"Email is not configured. Missing: {', '.join(missing)}"
            )

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


def _send_email(
    recipient: str,
    subject: str,
    text: str,
    html_body: str
) -> dict:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(("FarMe Support", settings.GMAIL_SENDER))
    message["To"] = recipient

    message.set_content(text)
    message.add_alternative(html_body, subtype="html")

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    for attempt in range(2):
        response = requests.post(
            SEND_URL,
            headers={
                "Authorization": (
                    f"Bearer {_access_token(force_refresh=attempt > 0)}"
                )
            },
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

    result = response.json()

    logger.info(
        "FarMe email accepted by Gmail. Message ID: %s",
        result.get("id", "unknown")
    )

    return result


def send_password_reset_email(recipient: str, reset_link: str):
    safe_link = html.escape(reset_link, quote=True)

    subject = "Reset Your FarMe Password"

    text = (
        "Hello!\n\n"
        "We received a request to reset your FarMe password.\n\n"
        "Use the link below to create a new password:\n\n"
        f"{reset_link}\n\n"
        "This password-reset link expires in 15 minutes.\n\n"
        "If you did not request a password reset, you can safely ignore "
        "this email. Your current password will remain unchanged.\n\n"
        "Thank you,\n"
        "FarMe Support"
    )

    html_body = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Reset Your FarMe Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f2e9;font-family:Arial,Helvetica,sans-serif;color:#263015;">

    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        Reset your FarMe password using your secure 15-minute link.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f2e9;padding:32px 12px;">
        <tr>
            <td align="center">

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#fffdf5;border:1px solid #dce0cd;border-radius:14px;overflow:hidden;">

                    <tr>
                        <td align="center" style="background-color:#34452b;padding:27px 24px;">
                            <div style="color:#ffffff;font-size:28px;font-weight:800;letter-spacing:1px;">
                                FarMe
                            </div>
                            <p style="margin:8px 0 0;color:#e4edcf;font-size:13px;">
                                Your growing journey starts here.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:34px 30px 28px;">

                            <p style="margin:0 0 10px;color:#81945c;font-size:12px;font-weight:bold;letter-spacing:1.3px;text-transform:uppercase;">
                                Account Security
                            </p>

                            <h1 style="margin:0 0 18px;color:#263015;font-size:26px;line-height:1.35;">
                                Reset Your Password
                            </h1>

                            <p style="margin:0 0 14px;color:#58604d;font-size:15px;line-height:1.8;">
                                Hello!
                            </p>

                            <p style="margin:0 0 25px;color:#58604d;font-size:15px;line-height:1.8;">
                                We received a request to reset your FarMe password. Click the button below to create a new password and get back to your growing journey.
                            </p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center">
                                        <a href="__RESET_LINK__" target="_blank" style="display:inline-block;padding:15px 32px;background-color:#526b3d;border-radius:8px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">
                                            Reset My Password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                                <tr>
                                    <td style="padding:13px 15px;background-color:#f1f2e9;border:1px solid #dce0cd;border-radius:8px;">
                                        <p style="margin:0;color:#526b3d;font-size:13px;line-height:1.7;">
                                            <strong>Time-sensitive:</strong> This password-reset link expires in <strong>15 minutes</strong>.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:24px 0 8px;color:#58604d;font-size:13px;line-height:1.7;">
                                If the button doesn't work, copy and paste this link into your browser:
                            </p>

                            <p style="margin:0 0 24px;font-size:12px;line-height:1.7;word-break:break-all;">
                                <a href="__RESET_LINK__" target="_blank" style="color:#526b3d;text-decoration:underline;">
                                    __RESET_LINK__
                                </a>
                            </p>

                            <hr style="border:0;border-top:1px solid #e5e5d8;margin:22px 0;">

                            <p style="margin:0 0 18px;color:#58604d;font-size:13px;line-height:1.7;">
                                <strong>Didn't request a password reset?</strong> You can safely ignore this email. Your current password will remain unchanged.
                            </p>

                            <p style="margin:0;color:#58604d;font-size:14px;line-height:1.7;">
                                Thank you,<br>
                                <strong style="color:#34452b;">FarMe Support</strong>
                            </p>

                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:21px 24px;background-color:#f1f2e9;border-top:1px solid #e1e4d6;">
                            <p style="margin:0 0 6px;color:#526b3d;font-size:13px;font-weight:bold;">
                                FarMe
                            </p>
                            <p style="margin:0;color:#858b7a;font-size:11px;line-height:1.7;">
                                This is an automated account-security message. Please do not reply directly to this email.
                            </p>
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>
"""

    html_body = html_body.replace("__RESET_LINK__", safe_link)

    return _send_email(
        recipient,
        subject,
        text,
        html_body
    )
