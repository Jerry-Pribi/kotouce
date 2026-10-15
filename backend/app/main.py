import os
from datetime import timedelta

from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from . import models, schemas, crud
from .database import Base, engine, get_db, SessionLocal
from .accounts import make_accounts_router, username_scope, validate_new_account
from .deps import bearer_scheme, get_current_user, get_session_user, require_admin, require_repair_admin
from .repair import router as repair_router
from .security import hash_password, hash_token, new_session_token, verify_password

app = FastAPI(title="Management kotoučů API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Část Reprofilace (firma, která kotouče přebrušuje) — vlastní endpointy /api/repair/...
app.include_router(repair_router)

# Správa účtů: stejná pro AGC (/api/admin) i pro každou firmu reprofilace (/api/repair/admin),
# ale úplně oddělená — admin vidí a spravuje jen účty své firmy.
app.include_router(make_accounts_router("/api/admin", require_admin, "administrace AGC"))
app.include_router(make_accounts_router("/api/repair/admin", require_repair_admin, "administrace firmy reprofilace"))

SESSION_HOURS = 12


def initialize_admin() -> None:
    """Create the first admin from environment settings, without shipping a default password."""
    username = os.getenv("ADMIN_USERNAME", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not username and not password:
        # Keep legacy databases valid too: if an older version created more than
        # one, retain the oldest account as the sole mega admin.
        with SessionLocal() as db:
            mega_admins = db.scalars(select(models.User).where(
                models.User.role == models.UserRole.MEGA_ADMIN, models.User.location_id.is_(None)
            ).order_by(models.User.id)).all()
            for extra_admin in mega_admins[1:]:
                extra_admin.role = models.UserRole.ADMIN
            if len(mega_admins) > 1:
                db.commit()
        return
    if not username or len(password) < 10:
        raise RuntimeError("ADMIN_USERNAME a ADMIN_PASSWORD (alespoň 10 znaků) musí být nastavené společně.")
    with SessionLocal() as db:
        existing = db.scalar(select(models.User).where(
            models.User.username == username, models.User.location_id.is_(None)
        ))
        if existing:
            existing.role = models.UserRole.MEGA_ADMIN
            db.execute(
                update(models.User)
                .where(models.User.id != existing.id, models.User.role == models.UserRole.MEGA_ADMIN,
                       models.User.location_id.is_(None))
                .values(role=models.UserRole.ADMIN)
            )
            db.commit()
            return
        db.execute(update(models.User).where(
            models.User.role == models.UserRole.MEGA_ADMIN, models.User.location_id.is_(None)
        ).values(role=models.UserRole.ADMIN))
        db.add(models.User(username=username, password_hash=hash_password(password), role=models.UserRole.MEGA_ADMIN,
                           username_scope=username_scope(None)))
        db.commit()


def initialize_repair_admin() -> None:
    """Create the configured first mega admin for a reprofiling company."""
    username = os.getenv("REPAIR_ADMIN_USERNAME", "").strip().lower()
    password = os.getenv("REPAIR_ADMIN_PASSWORD", "")
    company_name = os.getenv("REPAIR_COMPANY_NAME", "Prostor reprofilace").strip()
    if not username and not password:
        return
    if not username or len(password) < 10 or not company_name:
        raise RuntimeError(
            "REPAIR_ADMIN_USERNAME a REPAIR_ADMIN_PASSWORD (alespoň 10 znaků) "
            "musí být nastavené společně; REPAIR_COMPANY_NAME nesmí být prázdné."
        )

    with SessionLocal() as db:
        company = db.scalar(select(models.Location).where(models.Location.name == company_name))
        if company and company.type != models.LocationType.REPROFILACE:
            raise RuntimeError(f"REPAIR_COMPANY_NAME '{company_name}' již existuje a není firmou reprofilace.")
        if company is None:
            company = models.Location(name=company_name, type=models.LocationType.REPROFILACE)
            db.add(company)
            db.flush()

        existing = db.scalar(select(models.User).where(
            models.User.username == username, models.User.location_id == company.id
        ))
        other_repair_users = db.scalars(select(models.User).where(
            models.User.username == username,
            models.User.location_id.is_not(None),
            models.User.location_id != company.id,
        )).all()
        if any(verify_password(password, other.password_hash) for other in other_repair_users):
            raise RuntimeError(
                f"Uživatelské jméno REPAIR_ADMIN_USERNAME '{username}' je v jiné firmě reprofilace "
                "použité se stejným heslem. Nastavte jiné heslo."
            )

        db.execute(
            update(models.User)
            .where(models.User.location_id == company.id, models.User.role == models.UserRole.MEGA_ADMIN)
            .values(role=models.UserRole.ADMIN)
        )
        if existing:
            existing.role = models.UserRole.MEGA_ADMIN
        else:
            db.add(models.User(
                username=username,
                password_hash=hash_password(password),
                role=models.UserRole.MEGA_ADMIN,
                location_id=company.id,
                username_scope=username_scope(company.id),
            ))
        db.commit()


Base.metadata.create_all(bind=engine)
initialize_admin()
initialize_repair_admin()


@app.post("/api/auth/login", response_model=schemas.LoginResponse)
def login(data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    is_repair_portal = data.portal == "reprofilace"
    candidates = db.scalars(select(models.User).where(
        models.User.username == username,
        models.User.location_id.is_not(None) if is_repair_portal else models.User.location_id.is_(None),
    )).all()
    matches = [user for user in candidates if verify_password(data.password, user.password_hash)]
    if not matches:
        raise HTTPException(401, "Neplatné přihlašovací údaje")
    if len(matches) > 1:
        raise HTTPException(409, "Tyto přihlašovací údaje odpovídají více firmám reprofilace. Kontaktujte správce.")
    user = matches[0]
    if not user.is_active:
        raise HTTPException(401, "Neplatné přihlašovací údaje")
    if user.location_id is not None and (user.location is None or not user.location.is_active):
        raise HTTPException(403, "Spolupráce s vaší firmou byla ukončena. Kontaktujte AGC.")
    # Každý účet se přihlašuje ve své sekci (záložka AGC / Reprofilace na přihlašovací stránce)
    is_repair = user.location_id is not None
    if is_repair and data.portal != "reprofilace":
        raise HTTPException(403, "Tento účet patří do sekce Reprofilace — přepněte se nahoře na „Reprofilace“")
    if not is_repair and data.portal == "reprofilace":
        raise HTTPException(403, "Účty AGC se přihlašují v sekci AGC — přepněte se nahoře na „AGC“")

    now = models.utc_now()
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
        location_id=user.location_id,
    ))
    db.commit()
    db.refresh(user)
    return {"access_token": token, "user": user}


@app.get("/api/auth/me", response_model=schemas.UserOut)
def who_am_i(user: models.User = Depends(get_session_user)):
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
            session.ended_at = models.utc_now()
            db.commit()
    return Response(status_code=204)


# ---------- Firmy reprofilace: jen založení prvního účtu firmy (smí jen megaAdmin AGC) ----------

def require_mega_admin(user: models.User = Depends(require_admin)) -> models.User:
    if user.role != models.UserRole.MEGA_ADMIN:
        raise HTTPException(403, "Účty firem reprofilace zakládá pouze megaAdmin AGC")
    return user


@app.get("/api/admin/repair-companies", response_model=list[schemas.RepairCompanyOut])
def list_repair_companies(db: Session = Depends(get_db), _admin: models.User = Depends(require_mega_admin)):
    """Místa reprofilace (firmy) a jestli už mají účty. Účty samotné AGC nevidí — spravuje si je firma."""
    companies = db.scalars(
        select(models.Location).where(models.Location.type == models.LocationType.REPROFILACE)
        .order_by(models.Location.is_active.desc(), models.Location.name)
    ).all()
    out = []
    for c in companies:
        count = len(db.scalars(select(models.User.id).where(models.User.location_id == c.id)).all())
        out.append(schemas.RepairCompanyOut(id=c.id, name=c.name, accounts=count, is_active=c.is_active))
    return out


@app.post("/api/admin/repair-companies", response_model=schemas.RepairCompanyOut, status_code=201)
def create_repair_company(
    data: schemas.RepairCompanyCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_mega_admin),
):
    """Nová firma reprofilace jedním krokem: místo reprofilace (pro evidenci kotoučů) + její megaAdmin."""
    name = data.name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Zadejte název firmy")
    if db.scalar(select(models.Location.id).where(models.Location.name == name)):
        raise HTTPException(409, "Firma nebo stanoviště s tímto názvem už existuje")
    company = models.Location(name=name, type=models.LocationType.REPROFILACE)
    db.add(company)
    db.flush()
    username = validate_new_account(db, data.username, data.password, company.id)
    db.add(models.User(username=username, password_hash=hash_password(data.password),
                       role=models.UserRole.MEGA_ADMIN, location_id=company.id,
                       username_scope=username_scope(company.id)))
    db.commit()
    return schemas.RepairCompanyOut(id=company.id, name=company.name, accounts=1, is_active=company.is_active)


@app.post("/api/admin/repair-companies/{location_id}/first-admin", response_model=schemas.RepairCompanyOut, status_code=201)
def create_company_first_admin(
    location_id: int,
    data: schemas.CompanyFirstAdmin,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_mega_admin),
):
    """Založí firmě jejího megaAdmina — jen jednou, když firma ještě nemá žádný účet. Dál si účty spravuje firma."""
    company = db.get(models.Location, location_id)
    if not company or company.type != models.LocationType.REPROFILACE:
        raise HTTPException(404, "Firma reprofilace nenalezena")
    if not company.is_active:
        raise HTTPException(409, "Spolupráce s firmou je ukončená. Nejdříve ji obnovte.")
    if db.scalar(select(models.User.id).where(models.User.location_id == company.id)):
        raise HTTPException(409, "Firma už má účty — další si zakládá sama ve své administraci")
    username = validate_new_account(db, data.username, data.password, company.id)
    db.add(models.User(username=username, password_hash=hash_password(data.password),
                       role=models.UserRole.MEGA_ADMIN, location_id=company.id,
                       username_scope=username_scope(company.id)))
    db.commit()
    return schemas.RepairCompanyOut(id=company.id, name=company.name, accounts=1, is_active=company.is_active)


@app.delete("/api/admin/repair-companies/{location_id}", status_code=204)
def end_repair_company_cooperation(
    location_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_mega_admin),
):
    """Ukončí spolupráci, zablokuje přihlášení firmy a zachová její účty i historii."""
    company = db.get(models.Location, location_id)
    if not company or company.type != models.LocationType.REPROFILACE:
        raise HTTPException(404, "Firma reprofilace nenalezena")
    if company.is_active:
        now = models.utc_now()
        company.is_active = False
        db.execute(update(models.UserSession).where(
            models.UserSession.location_id == company.id,
            models.UserSession.ended_at.is_(None),
        ).values(ended_at=now))
        db.commit()
    return Response(status_code=204)


@app.post("/api/admin/repair-companies/{location_id}/restore", response_model=schemas.RepairCompanyOut)
def restore_repair_company_cooperation(
    location_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_mega_admin),
):
    """Obnoví spolupráci, aniž by obnovovala předtím ukončené přihlášené relace."""
    company = db.get(models.Location, location_id)
    if not company or company.type != models.LocationType.REPROFILACE:
        raise HTTPException(404, "Firma reprofilace nenalezena")
    company.is_active = True
    db.commit()
    accounts = len(db.scalars(select(models.User.id).where(models.User.location_id == company.id)).all())
    return schemas.RepairCompanyOut(id=company.id, name=company.name, accounts=accounts, is_active=company.is_active)


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
    return db.scalars(select(models.Location).where(
        or_(models.Location.type != models.LocationType.REPROFILACE, models.Location.is_active.is_(True))
    ).order_by(models.Location.name)).all()


@app.post("/api/locations", response_model=schemas.LocationOut)
def create_location(data: schemas.LocationCreate, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    # Firma reprofilace vzniká jen v Administraci (megaAdmin) i s prvním účtem — ne jako holé stanoviště
    if data.type == models.LocationType.REPROFILACE:
        raise HTTPException(400, "Firmu reprofilace přidá megaAdmin v Administraci → Firmy reprofilace")
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
    location = db.get(models.Location, data.location_id) if data.location_id else None
    if location and location.type == models.LocationType.REPROFILACE and not location.is_active:
        raise HTTPException(400, "Tato firma reprofilace už s AGC nespolupracuje.")
    if data.status == models.WheelStatus.V_PROVOZU:
        taken_by_name = (data.taken_by_name or "").strip()
        if not location or location.type != models.LocationType.LINKA:
            raise HTTPException(400, "Při zařazení kotouče do provozu vyberte výrobní linku.")
        if not taken_by_name:
            raise HTTPException(400, "Zadejte jméno osoby, která kotouč přebírá.")
    elif data.status == models.WheelStatus.SKLAD and (not location or location.type != models.LocationType.SKLAD):
        raise HTTPException(400, "Při zařazení kotouče do skladu vyberte skladové stanoviště.")
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
    summary = crud.to_wheel_out(db, wheel)
    out.reprofiling_count, out.reprofiling_state = summary.reprofiling_count, summary.reprofiling_state
    out.cycles = [
        schemas.WheelCycleOut.model_validate(cycle).model_copy(update={
            "meters_ground": sum(record.meters_ground for record in cycle.usage_records),
        })
        for cycle in wheel.cycles
    ]
    return out


@app.patch("/api/wheels/{wheel_id}", response_model=schemas.WheelOut)
def patch_wheel(wheel_id: int, data: schemas.WheelUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    if data.location_id is not None and data.location_id == wheel.location_id and (data.status is None or data.status == wheel.status):
        raise HTTPException(400, "Kotouč už je na tomto stanovišti. Vyberte jiné místo.")
    if wheel.status == models.WheelStatus.SKLAD and data.status == models.WheelStatus.V_PROVOZU:
        line = db.get(models.Location, data.location_id) if data.location_id else None
        taken_by_name = (data.taken_by_name or "").strip()
        if not line or line.type != models.LocationType.LINKA:
            raise HTTPException(400, "Při vydání kotouče vyberte výrobní linku.")
        if not taken_by_name:
            raise HTTPException(400, "Zadejte jméno osoby, která kotouč přebírá.")
        if len(taken_by_name) > 100:
            raise HTTPException(400, "Jméno osoby může mít nejvýše 100 znaků.")
        db.add(models.WheelCycle(
            wheel_id=wheel.id,
            taken_by_name=taken_by_name,
            taken_by_user_id=user.id,
            taken_by_username=user.username,
            taken_from_location_id=wheel.location_id,
            taken_from_location_name=wheel.location.name if wheel.location else None,
            used_on_location_id=line.id,
            used_on_location_name=line.name,
        ))
    if wheel.status == models.WheelStatus.V_PROVOZU and data.status == models.WheelStatus.SKLAD:
        used_on = db.get(models.Location, data.returned_from_location_id) if data.returned_from_location_id else None
        returned_to = db.get(models.Location, data.location_id) if data.location_id else None
        if not used_on or used_on.type != models.LocationType.LINKA:
            raise HTTPException(400, "Při vrácení kotouče zadejte linku, na které byl používán.")
        if not returned_to or returned_to.type != models.LocationType.SKLAD:
            raise HTTPException(400, "Při vrácení kotouče vyberte cílový sklad.")
        cycle = db.scalar(select(models.WheelCycle).where(
            models.WheelCycle.wheel_id == wheel.id,
            models.WheelCycle.returned_at.is_(None),
        ).order_by(models.WheelCycle.taken_at.desc()))
        if cycle is None:
            taken_by_name = (data.taken_by_name or "").strip()
            if not taken_by_name:
                raise HTTPException(400, "U staršího záznamu zadejte jméno osoby, která kotouč používala.")
            if len(taken_by_name) > 100:
                raise HTTPException(400, "Jméno osoby může mít nejvýše 100 znaků.")
            cycle = models.WheelCycle(
                wheel_id=wheel.id,
                taken_by_name=taken_by_name,
                taken_by_user_id=None,
                taken_by_username="Historický záznam",
                used_on_location_id=used_on.id,
                used_on_location_name=used_on.name,
            )
            db.add(cycle)
        cycle.used_on_location_id = used_on.id
        cycle.used_on_location_name = used_on.name
        cycle.returned_to_location_id = returned_to.id
        cycle.returned_to_location_name = returned_to.name
        cycle.returned_by_user_id = user.id
        cycle.returned_by_username = user.username
        cycle.returned_at = models.utc_now()
        db.add(models.WheelReturn(
            wheel_id=wheel.id,
            used_on_location_id=used_on.id,
            used_on_location_name=used_on.name,
            returned_to_location_name=returned_to.name,
            returned_by_user_id=user.id,
            returned_by_username=user.username,
        ))
    # Cesta na reprofilaci: odeslání, firma, převzetí zpět (historie reprofilací kotouče)
    new_location = db.get(models.Location, data.location_id) if data.location_id else None
    if new_location and new_location.type == models.LocationType.REPROFILACE and not new_location.is_active:
        raise HTTPException(400, "Tato firma reprofilace už s AGC nespolupracuje.")
    crud.track_reprofiling(db, wheel, wheel.status, data.status, new_location, user)
    wheel = crud.update_wheel(db, wheel, data)
    return crud.to_wheel_out(db, wheel)


@app.delete("/api/wheels/{wheel_id}", status_code=204)
def remove_wheel(wheel_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    crud.delete_wheel(db, wheel)


@app.post("/api/wheels/{wheel_id}/usage", response_model=schemas.UsageRecordOut)
def add_usage(wheel_id: int, data: schemas.UsageRecordCreate, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    wheel = _get_wheel_or_404(db, wheel_id)
    if wheel.status != models.WheelStatus.V_PROVOZU:
        raise HTTPException(400, "Broušení lze zaznamenat pouze tehdy, když je kotouč na výrobní lince.")
    active_cycle = db.scalar(select(models.WheelCycle).where(
        models.WheelCycle.wheel_id == wheel.id,
        models.WheelCycle.returned_at.is_(None),
    ).order_by(models.WheelCycle.taken_at.desc()))
    record = crud.add_usage_record(db, wheel, data, cycle_id=active_cycle.id if active_cycle else None)
    return record


@app.get("/api/health")
def health():
    return {"status": "ok"}
