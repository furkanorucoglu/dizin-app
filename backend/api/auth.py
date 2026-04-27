"""JWT auth + dev-mode bypass.

Production: NextAuth.js issues an HS256 JWT; we verify with the shared secret.
Dev mode: passing X-Dev-User header is accepted as-is (skip JWT entirely).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings


@dataclass
class CurrentUser:
    id: str
    email: Optional[str] = None


def _decode_jwt(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


def get_current_user(
    authorization: str | None = Header(default=None),
    x_dev_user: str | None = Header(default=None),
) -> CurrentUser:
    settings = get_settings()

    if settings.dev_mode and x_dev_user:
        return CurrentUser(id=x_dev_user, email=None)

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization must be a Bearer token",
        )
    token = authorization.split(" ", 1)[1].strip()
    claims = _decode_jwt(token)
    user_id = claims.get("sub") or claims.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim")
    return CurrentUser(id=str(user_id), email=claims.get("email"))


def require_user() -> CurrentUser:
    return Depends(get_current_user)
