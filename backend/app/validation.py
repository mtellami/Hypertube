"""Shared server-side validation rules."""

import re

from email_validator import EmailNotValidError, validate_email

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
NAME_RE = re.compile(r"^[^\x00-\x1f<>]{1,64}$")
LANGUAGES = ("en", "fr", "es")


def check_username(value: str) -> str:
    value = value.strip()
    if not USERNAME_RE.match(value):
        raise ValueError(
            "Username must be 3-32 characters: letters, digits, '.', '_' or '-'."
        )
    return value


def check_name(value: str) -> str:
    value = value.strip()
    if not NAME_RE.match(value):
        raise ValueError("Must be 1-64 characters and must not contain '<' or '>'.")
    return value


def clean_name(value: str | None, fallback: str = "User") -> str:
    """Names coming from OAuth providers are not user input we can reject: strip what our
    rules forbid (control characters, '<' and '>') and keep at most 64 characters."""
    for candidate in (value, fallback, "User"):
        cleaned = re.sub(r"[\x00-\x1f\x7f<>]", "", candidate or "").strip()[:64].strip()
        if cleaned:
            return cleaned
    return "User"


def check_email(value: str) -> str:
    try:
        return validate_email(
            value.strip(), check_deliverability=False
        ).normalized.lower()
    except EmailNotValidError:
        raise ValueError("Invalid email address.") from None


COMMON_PASSWORDS = {
    "password",
    "password1",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty123",
    "azerty123",
    "iloveyou",
    "letmein1",
    "welcome1",
    "admin123",
    "abc12345",
    "hypertube1",
}


def check_password(value: str) -> str:
    if len(value) < 8 or len(value) > 128:
        raise ValueError("Password must be 8-128 characters long.")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one digit.")
    if value.lower() in COMMON_PASSWORDS:
        raise ValueError("This password is too common.")
    return value


def check_language(value: str) -> str:
    if value not in LANGUAGES:
        raise ValueError(f"Language must be one of: {', '.join(LANGUAGES)}.")
    return value


def check_avatar_url(value: str) -> str:
    value = value.strip()
    if value.startswith("/api/media/avatars/") and re.match(
        r"^/api/media/avatars/[A-Za-z0-9_-]+\.webp$", value
    ):
        return value
    if re.match(r"^https://[^\s\"'<>]{1,500}$", value):
        return value
    raise ValueError(
        "Profile picture URL must be an https:// URL or an uploaded avatar."
    )
