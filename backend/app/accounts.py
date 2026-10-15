"""Správa účtů — stejná pro AGC i pro každou firmu reprofilace, ale úplně oddělená.

Každá firma (AGC = location_id NULL, firma reprofilace = její místo reprofilace) má vlastního
megaAdmina, adminy a uživatele. Administrátor vidí a spravuje jen účty své firmy,
přihlášení své firmy a audit mazání své firmy. Pravidla jsou stejná jako v AGC (větev jara):
  - megaAdmin je ve firmě jediný a nejde vytvořit ani mazat přes administraci,
  - admin spravuje běžné uživatele, adminy spravuje jen megaAdmin.
"""
import re
from collections.abc import Callable
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas
from .database import get_db
from .security import hash_password, verify_password

ACTIVE_WINDOW_MINUTES = 2
USERNAME_RE = r"[a-z0-9][a-z0-9_.-]{2,31}"
R = models.UserRole


def in_org(column, org_id: int | None):
    """Podmínka „patří k této firmě“ (NULL = AGC)."""
    return column.is_(None) if org_id is None else column == org_id


def username_scope(org_id: int | None) -> str:
    """Databázový rozsah jména: AGC nebo konkrétní firma reprofilace."""
    return "agc" if org_id is None else f"repair:{org_id}"


def validate_new_account(db: Session, username: str, password: str, org_id: int | None) -> str:
    username = username.strip().lower()
    if not re.fullmatch(USERNAME_RE, username):
        raise HTTPException(400, "Uživatelské jméno musí mít 3–32 znaků (písmena bez diakritiky, čísla, . _ -)")
    if len(password) < 10:
        raise HTTPException(400, "Heslo musí mít alespoň 10 znaků")
    # Jméno musí být jedinečné v rámci firmy. Firmy reprofilace mohou mít
    # stejně pojmenované účty, pokud se jejich hesla liší.
    if db.scalar(select(models.User.id).where(
        models.User.username == username, in_org(models.User.location_id, org_id)
    )):
        raise HTTPException(409, "Uživatel s tímto jménem už existuje")
    if org_id is not None:
        other_repair_users = db.scalars(select(models.User).where(
            models.User.username == username,
            models.User.location_id.is_not(None),
            models.User.location_id != org_id,
        )).all()
        if any(verify_password(password, other.password_hash) for other in other_repair_users):
            raise HTTPException(409, "Stejné uživatelské jméno mohou mít různé firmy reprofilace jen s odlišným heslem")
    return username


def make_accounts_router(prefix: str, require_admin: Callable[..., models.User], tag: str) -> APIRouter:
    """Endpointy správy účtů pro jednu „stranu“ (AGC nebo reprofilace); firma se bere z přihlášeného admina."""
    router = APIRouter(prefix=prefix, tags=[tag])

    def get_member(db: Session, user_id: int, admin: models.User) -> models.User:
        user = db.get(models.User, user_id)
        # Účet jiné firmy se tváří jako neexistující
        if not user or user.location_id != admin.location_id:
            raise HTTPException(404, "Uživatel nenalezen")
        return user

    def check_manage(user: models.User, admin: models.User, action: str) -> None:
        if user.role == R.MEGA_ADMIN:
            raise HTTPException(403, f"{action} megaAdmina nelze z administrace")
        if user.role == R.ADMIN and admin.role != R.MEGA_ADMIN:
            raise HTTPException(403, f"{action} administrátorů může pouze megaAdmin")

    @router.get("/users", response_model=list[schemas.UserOut])
    def list_users(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
        return db.scalars(
            select(models.User).where(in_org(models.User.location_id, admin.location_id)).order_by(models.User.username)
        ).all()

    @router.post("/users", response_model=schemas.UserOut, status_code=201)
    def create_user(data: schemas.UserCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
        if data.role == R.MEGA_ADMIN:
            raise HTTPException(403, "MegaAdmin je jediný a nelze ho vytvořit přes administraci")
        if data.role not in (R.USER, R.ADMIN):
            raise HTTPException(400, "Neplatná role účtu")
        username = validate_new_account(db, data.username, data.password, admin.location_id)
        user = models.User(username=username, password_hash=hash_password(data.password), role=data.role,
                           location_id=admin.location_id, username_scope=username_scope(admin.location_id))
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @router.put("/users/{user_id}/password", status_code=204)
    def reset_password(user_id: int, data: schemas.UserPasswordReset, db: Session = Depends(get_db),
                       admin: models.User = Depends(require_admin)):
        user = get_member(db, user_id, admin)
        check_manage(user, admin, "Heslo")
        if len(data.password) < 10:
            raise HTTPException(400, "Heslo musí mít alespoň 10 znaků")
        if user.location_id is not None:
            other_repair_users = db.scalars(select(models.User).where(
                models.User.username == user.username,
                models.User.location_id.is_not(None),
                models.User.location_id != user.location_id,
            )).all()
            if any(verify_password(data.password, other.password_hash) for other in other_repair_users):
                raise HTTPException(409, "Stejné uživatelské jméno mohou mít různé firmy reprofilace jen s odlišným heslem")
        user.password_hash = hash_password(data.password)
        for session in user.sessions:
            if session.ended_at is None:
                session.ended_at = models.utc_now()
        db.commit()
        return Response(status_code=204)

    @router.put("/users/{user_id}/username", response_model=schemas.UserOut)
    def rename_user(user_id: int, data: schemas.UserRename, db: Session = Depends(get_db),
                    admin: models.User = Depends(require_admin)):
        user = get_member(db, user_id, admin)
        check_manage(user, admin, "Uživatelské jméno")
        username = data.username.strip().lower()
        if not re.fullmatch(USERNAME_RE, username):
            raise HTTPException(400, "Uživatelské jméno musí mít 3–32 znaků (písmena bez diakritiky, čísla, . _ -)")
        if db.scalar(select(models.User.id).where(
            models.User.username == username, models.User.id != user.id,
            in_org(models.User.location_id, admin.location_id),
        )):
            raise HTTPException(409, "Uživatel s tímto jménem už existuje")
        if admin.location_id is not None and db.scalar(select(models.User.id).where(
            models.User.username == username,
            models.User.location_id.is_not(None),
            models.User.location_id != admin.location_id,
        )):
            raise HTTPException(409, "Toto jméno už používá jiná firma reprofilace; při změně jména zvolte jiné")
        user.username = username
        for session in user.sessions:
            session.username = username
        db.commit()
        db.refresh(user)
        return user

    @router.delete("/users/{user_id}", status_code=204)
    def delete_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
        user = get_member(db, user_id, admin)
        if user.id == admin.id:
            raise HTTPException(400, "Svůj vlastní administrátorský účet nelze odstranit")
        check_manage(user, admin, "Odstranit účet")
        for session in user.sessions:
            if session.ended_at is None:
                session.ended_at = models.utc_now()
        db.add(models.UserDeletionAudit(
            actor_user_id=admin.id, actor_username=admin.username,
            deleted_user_id=user.id, deleted_username=user.username, deleted_role=user.role,
            deleted_at=models.utc_now(), location_id=admin.location_id,
        ))
        db.delete(user)
        db.commit()
        return Response(status_code=204)

    @router.get("/sessions", response_model=list[schemas.UserSessionOut])
    def list_sessions(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
        now = models.utc_now()
        active_after = now - timedelta(minutes=ACTIVE_WINDOW_MINUTES)
        rows = db.scalars(
            select(models.UserSession)
            .where(in_org(models.UserSession.location_id, admin.location_id))
            .order_by(models.UserSession.created_at.desc())
            .limit(250)
        ).all()
        return [{
            "id": s.id, "username": s.username, "ip_address": s.ip_address, "user_agent": s.user_agent,
            "created_at": s.created_at, "last_seen_at": s.last_seen_at, "expires_at": s.expires_at, "ended_at": s.ended_at,
            "is_active": s.ended_at is None and s.expires_at > now and s.last_seen_at >= active_after,
        } for s in rows]

    @router.get("/audits/user-deletions", response_model=list[schemas.UserDeletionAuditOut])
    def list_deletions(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
        return db.scalars(
            select(models.UserDeletionAudit)
            .where(in_org(models.UserDeletionAudit.location_id, admin.location_id))
            .order_by(models.UserDeletionAudit.deleted_at.desc())
        ).all()

    return router
