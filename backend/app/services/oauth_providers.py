"""OAuth2 authorization-code flows for 42 and GitHub, implemented with plain HTTP calls."""
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from ..config import get_settings


@dataclass
class OAuthProfile:
    provider_user_id: str
    email: str | None
    username: str
    first_name: str
    last_name: str
    avatar_url: str | None


class OAuthError(Exception):
    pass


PROVIDERS = {
    "42": {
        "authorize": "https://api.intra.42.fr/oauth/authorize",
        "token": "https://api.intra.42.fr/oauth/token",
        "scope": "public",
    },
    "github": {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "scope": "read:user user:email",
    },
}


def credentials(provider: str) -> tuple[str, str]:
    s = get_settings()
    if provider == "42":
        return s.ft_client_id, s.ft_client_secret
    return s.github_client_id, s.github_client_secret


def is_configured(provider: str) -> bool:
    cid, secret = credentials(provider)
    return bool(cid and secret)


def redirect_uri(provider: str) -> str:
    return f"{get_settings().public_url}/api/auth/oauth/{provider}/callback"


def authorize_url(provider: str, state: str) -> str:
    cid, _ = credentials(provider)
    params = {
        "client_id": cid,
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "scope": PROVIDERS[provider]["scope"],
        "state": state,
    }
    return f"{PROVIDERS[provider]['authorize']}?{urlencode(params)}"


def _split_name(full: str | None, fallback: str) -> tuple[str, str]:
    parts = (full or "").strip().split(None, 1)
    if not parts:
        return fallback, fallback
    return parts[0][:64], (parts[1] if len(parts) > 1 else parts[0])[:64]


async def fetch_profile(provider: str, code: str) -> OAuthProfile:
    cid, secret = credentials(provider)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            tok = await client.post(
                PROVIDERS[provider]["token"],
                data={
                    "grant_type": "authorization_code",
                    "client_id": cid,
                    "client_secret": secret,
                    "code": code,
                    "redirect_uri": redirect_uri(provider),
                },
                headers={"Accept": "application/json"},
            )
            access = tok.json().get("access_token") if tok.status_code == 200 else None
            if not access:
                raise OAuthError("Token exchange failed")
            headers = {"Authorization": f"Bearer {access}", "Accept": "application/json"}

            if provider == "42":
                r = await client.get("https://api.intra.42.fr/v2/me", headers=headers)
                if r.status_code != 200:
                    raise OAuthError("Profile request failed")
                me = r.json()
                image = (me.get("image") or {}).get("link")
                return OAuthProfile(
                    provider_user_id=str(me["id"]),
                    email=me.get("email"),
                    username=me.get("login") or f"student{me['id']}",
                    first_name=(me.get("first_name") or me.get("login") or "Student")[:64],
                    last_name=(me.get("last_name") or me.get("login") or "Student")[:64],
                    avatar_url=image if image and image.startswith("https://") else None,
                )

            r = await client.get("https://api.github.com/user", headers=headers)
            if r.status_code != 200:
                raise OAuthError("Profile request failed")
            me = r.json()
            email = None
            emails = await client.get("https://api.github.com/user/emails", headers=headers)
            if emails.status_code == 200:
                verified = [e for e in emails.json() if e.get("verified")]
                primary = [e for e in verified if e.get("primary")]
                if primary or verified:
                    email = (primary or verified)[0]["email"]
            first, last = _split_name(me.get("name"), me.get("login") or "User")
            avatar = me.get("avatar_url")
            return OAuthProfile(
                provider_user_id=str(me["id"]),
                email=email,
                username=me.get("login") or f"gh{me['id']}",
                first_name=first,
                last_name=last,
                avatar_url=avatar if avatar and avatar.startswith("https://") else None,
            )
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise OAuthError(str(exc)) from exc
