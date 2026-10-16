"""Přihlášení a oprávnění — sdílí část AGC (main.py) i část Reprofilace (repair.py).

Každý účet patří k jedné firmě: AGC (location_id NULL), nebo firma reprofilace
(location_id = její místo reprofilace). Účty firmy smí jen do /api/repair/...,
do evidence AGC nemají přístup — a obráceně.
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import hash_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_session_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Přihlášený uživatel libovolné role (AGC i reprofilace)."""
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Přihlášení je vyžadováno")
    now = models.utc_now()
    session = db.scalar(
        select(models.UserSession).where(
            models.UserSession.token_hash == hash_token(credentials.credentials),
            models.UserSession.ended_at.is_(None),
            models.UserSession.expires_at > now,
        )
    )
    if not session or not session.user or not session.user.is_active:
        raise HTTPException(401, "Přihlášení vypršelo nebo bylo ukončeno")
    if session.user.location_id is not None and (
        session.user.location is None or not session.user.location.is_active
    ):
        session.ended_at = now
        db.commit()
        raise HTTPException(401, "Spolupráce s vaší firmou byla ukončena. Kontaktujte AGC.")
    session.last_seen_at = now
    db.commit()
    return session.user


def get_current_user(user: models.User = Depends(get_session_user)) -> models.User:
    """Uživatel AGC — účty firem reprofilace sem nemají přístup."""
    if user.location_id is not None:
        raise HTTPException(403, "Účet reprofilace nemá přístup do evidence AGC")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role not in {models.UserRole.ADMIN, models.UserRole.MEGA_ADMIN}:
        raise HTTPException(403, "Tato funkce je dostupná pouze administrátorům")
    return user


def require_repair(user: models.User = Depends(get_session_user)) -> models.User:
    """Účet některé firmy reprofilace (libovolná role uvnitř firmy)."""
    if user.location_id is None:
        raise HTTPException(403, "Tato část je jen pro účty firem reprofilace")
    return user


def require_repair_admin(user: models.User = Depends(require_repair)) -> models.User:
    """Administrátor (nebo megaAdmin) firmy reprofilace."""
    if user.role not in {models.UserRole.ADMIN, models.UserRole.MEGA_ADMIN}:
        raise HTTPException(403, "Tato funkce je dostupná pouze administrátorům firmy")
    return user


def require_mega_admin(user: models.User = Depends(require_admin)) -> models.User:
    """Jen megaAdmin AGC (firmy reprofilace, ceny kotoučů, analýza útrat)."""
    if user.role != models.UserRole.MEGA_ADMIN:
        raise HTTPException(403, "Tato funkce je dostupná pouze megaAdminovi AGC")
    return user
