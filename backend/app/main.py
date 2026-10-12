import os
import re
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas, crud
from .database import Base, engine, get_db, SessionLocal
from .security import hash_password, hash_token, new_session_token, verify_password

app = FastAPI(title="Management kotoučů API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer_scheme = HTTPBearer(auto_error=False)
SESSION_HOURS = 12
ACTIVE_WINDOW_MINUTES = 2


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Přihlášení je vyžadováno")
    now = datetime.utcnow()
    session = db.scalar(
        select(models.UserSession).where(
            models.UserSession.token_hash == hash_token(credentials.credentials),
            models.UserSession.ended_at.is_(None),
            models.UserSession.expires_at > now,
        )
    )
    if not session or not session.user or not session.user.is_active:
        raise HTTPException(401, "Přihlášení vypršelo nebo bylo ukončeno")
    session.last_seen_at = now
    db.commit()
    return session.user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role not in {models.UserRole.ADMIN, models.UserRole.MEGA_ADMIN}:
        raise HTTPException(403, "Tato funkce je dostupná pouze administrátorům")
    return user


def initialize_admin() -> None:
    """Create the first admin from environment settings, without shipping a default password."""
    username = os.getenv("ADMIN_USERNAME", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not username and not password:
        # Keep legacy databases valid too: if an older version created more than
        # one, retain the oldest account as the sole mega admin.
        with SessionLocal() as db:
            mega_admins = db.scalars(select(models.User).where(
                models.User.role == models.UserRole.MEGA_ADMIN
            ).order_by(models.User.id)).all()
            for extra_admin in mega_admins[1:]:
                extra_admin.role = models.UserRole.ADMIN
            if len(mega_admins) > 1:
                db.commit()
        return
    if not username or len(password) < 10:
        raise RuntimeError("ADMIN_USERNAME a ADMIN_PASSWORD (alespoň 10 znaků) musí být nastavené společně.")
    with SessionLocal() as db:
        existing = db.scalar(select(models.User).where(models.User.username == username))
        if existing:
            existing.role = models.UserRole.MEGA_ADMIN
            db.execute(
                models.User.__table__.update()
                .where(models.User.id != existing.id, models.User.role == models.UserRole.MEGA_ADMIN)
                .values(role=models.UserRole.ADMIN)
            )
            db.commit()
            return
        db.execute(models.User.__table__.update().where(
            models.User.role == models.UserRole.MEGA_ADMIN
        ).values(role=models.UserRole.ADMIN))
        db.add(models.User(username=username, password_hash=hash_password(password), role=models.UserRole.MEGA_ADMIN))
        db.commit()


Base.metadata.create_all(bind=engine)
initialize_admin()


@app.post("/api/auth/login", response_model=schemas.LoginResponse)
def login(data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    user = db.scalar(select(models.User).where(models.User.username == username))
    if not user or not user.is_active or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Neplatné přihlašovací údaje")

    now = datetime.utcnow()
    token = new_session_token()
    user.last_login_at = now
    db.add(models.UserSession(
        user=user,
        username=user.username,
        token_hash=hash_token(token),
        ip_address=request.headers.get("x-real-ip") or (request.client.host if request.client else None),
        user_agent=request.headers.get("user-agent", "")[:500] or None,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=SESSION_HOURS),
    ))
    db.commit()
    db.refresh(user)
    return {"access_token": token, "user": user}


@app.get("/api/auth/me", response_model=schemas.UserOut)
def who_am_i(user: models.User = Depends(get_current_user)):
    return user


@app.post("/api/auth/logout", status_code=204)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if credentials:
        session = db.scalar(select(models.UserSession).where(
            models.UserSession.token_hash == hash_token(credentials.credentials),
            models.UserSession.ended_at.is_(None),
        ))
        if session:
            session.ended_at = datetime.utcnow()
            db.commit()
    return Response(status_code=204)


@app.get("/api/admin/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return db.scalars(select(models.User).order_by(models.User.username)).all()


@app.post("/api/admin/users", response_model=schemas.UserOut, status_code=201)
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    username = data.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,31}", username):
        raise HTTPException(400, "Uživatelské jméno musí mít 3–32 znaků (písmena bez diakritiky, čísla, . _ -)")
    if len(data.password) < 10:
        raise HTTPException(400, "Heslo musí mít alespoň 10 znaků")
    if data.role == models.UserRole.MEGA_ADMIN:
        raise HTTPException(403, "MegaAdmin je jediný a nelze ho vytvořit přes administraci")
    if db.scalar(select(models.User.id).where(models.User.username == username)):
        raise HTTPException(409, "Uživatel s tímto jménem už existuje")
    user = models.User(username=username, password_hash=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/admin/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "Uživatel nenalezen")
    if user.id == admin.id:
        raise HTTPException(400, "Svůj vlastní administrátorský účet nelze odstranit")
    if user.role == models.UserRole.MEGA_ADMIN:
        raise HTTPException(403, "Účet megaAdmina nelze odstranit z administrace")
    if user.role == models.UserRole.ADMIN and admin.role != models.UserRole.MEGA_ADMIN:
        raise HTTPException(403, "Administrátory může mazat pouze megaAdmin")
    for user_session in user.sessions:
        if user_session.ended_at is None:
            user_session.ended_at = datetime.utcnow()
    db.add(models.UserDeletionAudit(
        actor_user_id=admin.id,
        actor_username=admin.username,
        deleted_user_id=user.id,
        deleted_username=user.username,
        deleted_role=user.role,
        deleted_at=datetime.utcnow(),
    ))
    db.delete(user)
    db.commit()
    return Response(status_code=204)


@app.get("/api/admin/sessions", response_model=list[schemas.UserSessionOut])
def list_sessions(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    now = datetime.utcnow()
    active_after = now - timedelta(minutes=ACTIVE_WINDOW_MINUTES)
    rows = db.scalars(
        select(models.UserSession)
        .order_by(models.UserSession.created_at.desc())
        .limit(250)
    ).all()
    return [{
        "id": session.id,
        "username": session.username,
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "created_at": session.created_at,
        "last_seen_at": session.last_seen_at,
        "expires_at": session.expires_at,
        "ended_at": session.ended_at,
        "is_active": session.ended_at is None and session.expires_at > now and session.last_seen_at >= active_after,
    } for session in rows]


@app.get("/api/admin/audits/user-deletions", response_model=list[schemas.UserDeletionAuditOut])
def list_user_deletion_audits(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return db.scalars(select(models.UserDeletionAudit).order_by(models.UserDeletionAudit.deleted_at.desc())).all()


@app.get("/api/admin/audits/wheel-creations", response_model=list[schemas.WheelCreationAuditOut])
def list_wheel_creation_audits(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return db.scalars(select(models.WheelCreationAudit).order_by(models.WheelCreationAudit.created_at.desc())).all()


# ---------- Reference data ----------

@app.get("/api/manufacturers", response_model=list[schemas.ManufacturerOut])
def list_manufacturers(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return db.scalars(select(models.Manufacturer).order_by(models.Manufacturer.name)).all()


@app.post("/api/manufacturers", response_model=schemas.ManufacturerOut)
def create_manufacturer(data: schemas.ManufacturerCreate, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Název výrobce nesmí být prázdný")
    existing = db.scalar(select(models.Manufacturer).where(models.Manufacturer.name == name))
    if existing:
        raise HTTPException(400, "Výrobce s tímto názvem už existuje")
    m = models.Manufacturer(name=name)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@app.get("/api/profiles", response_model=list[schemas.ProfileOut])
def list_profiles(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return db.scalars(select(models.Profile).order_by(models.Profile.code)).all()


@app.post("/api/profiles", response_model=schemas.ProfileOut)
def create_profile(data: schemas.ProfileCreate, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    code = data.code.strip()
    if not code:
        raise HTTPException(400, "Kód profilu nesmí být prázdný")
    existing = db.scalar(select(models.Profile).where(models.Profile.code == code))
    if existing:
        raise HTTPException(400, "Profil s tímto kódem už existuje")
    p = models.Profile(code=code)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.get("/api/locations", response_model=list[schemas.LocationOut])
def list_locations(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return db.scalars(select(models.Location).order_by(models.Location.name)).all()


@app.post("/api/locations", response_model=schemas.LocationOut)
def create_location(data: schemas.LocationCreate, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    existing = db.scalar(select(models.Location).where(models.Location.name == data.name))
    if existing:
        raise HTTPException(400, "Lokace s tímto názvem už existuje")
    loc = models.Location(**data.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


# ---------- Dashboard ----------

@app.get("/api/dashboard", response_model=schemas.DashboardSummary)
def dashboard(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.dashboard_summary(db)


# ---------- Wheels ----------

@app.get("/api/wheels", response_model=list[schemas.WheelOut])
def list_wheels(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    status: models.WheelStatus | None = None,
    manufacturer: str | None = None,
    diameter: int | None = None,
    profile: str | None = None,
    location_id: int | None = None,
    search: str | None = Query(None, description="hledat podle čísla kotouče"),
):
    stmt = select(models.Wheel)
    if status:
        stmt = stmt.where(models.Wheel.status == status)
    if diameter:
        stmt = stmt.where(models.Wheel.diameter == diameter)
    if location_id:
        stmt = stmt.where(models.Wheel.location_id == location_id)
    if manufacturer:
        stmt = stmt.join(models.Manufacturer).where(models.Manufacturer.name == manufacturer)
    if profile:
        stmt = stmt.join(models.Profile).where(models.Profile.code == profile)
    if search:
        stmt = stmt.where(models.Wheel.serial_number.ilike(f"%{search}%"))

    wheels = db.scalars(stmt.order_by(models.Wheel.id.desc())).all()
    return [crud.to_wheel_out(db, w) for w in wheels]


@app.post("/api/wheels", response_model=schemas.WheelOut)
def create_wheel(data: schemas.WheelCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    existing = db.scalar(
        select(models.Wheel).where(models.Wheel.serial_number == data.serial_number.strip())
    )
    if existing:
        raise HTTPException(400, "Kotouč s tímto výrobním číslem už v databázi existuje")
    wheel = crud.create_wheel(db, data, created_by=user)
    return crud.to_wheel_out(db, wheel)


def _get_wheel_or_404(db: Session, wheel_id: int) -> models.Wheel:
    wheel = db.get(models.Wheel, wheel_id)
    if not wheel:
        raise HTTPException(404, "Kotouč nenalezen")
    return wheel


@app.get("/api/wheels/{wheel_id}", response_model=schemas.WheelDetailOut)
def get_wheel(wheel_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    out = schemas.WheelDetailOut.model_validate(wheel)
    out.total_meters_ground = crud.wheel_total_meters(db, wheel.id)
    return out


@app.patch("/api/wheels/{wheel_id}", response_model=schemas.WheelOut)
def patch_wheel(wheel_id: int, data: schemas.WheelUpdate, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    wheel = crud.update_wheel(db, wheel, data)
    return crud.to_wheel_out(db, wheel)


@app.delete("/api/wheels/{wheel_id}", status_code=204)
def remove_wheel(wheel_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    crud.delete_wheel(db, wheel)


@app.post("/api/wheels/{wheel_id}/usage", response_model=schemas.UsageRecordOut)
def add_usage(wheel_id: int, data: schemas.UsageRecordCreate, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    record = crud.add_usage_record(db, wheel, data)
    return record


@app.get("/api/health")
def health():
    return {"status": "ok"}
