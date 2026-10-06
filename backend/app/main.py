from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas, crud
from .database import Base, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kotouč Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Reference data ----------

@app.get("/api/manufacturers", response_model=list[schemas.ManufacturerOut])
def list_manufacturers(db: Session = Depends(get_db)):
    return db.scalars(select(models.Manufacturer).order_by(models.Manufacturer.name)).all()


@app.post("/api/manufacturers", response_model=schemas.ManufacturerOut)
def create_manufacturer(data: schemas.ManufacturerCreate, db: Session = Depends(get_db)):
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
def list_profiles(db: Session = Depends(get_db)):
    return db.scalars(select(models.Profile).order_by(models.Profile.code)).all()


@app.post("/api/profiles", response_model=schemas.ProfileOut)
def create_profile(data: schemas.ProfileCreate, db: Session = Depends(get_db)):
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
def list_locations(db: Session = Depends(get_db)):
    return db.scalars(select(models.Location).order_by(models.Location.name)).all()


@app.post("/api/locations", response_model=schemas.LocationOut)
def create_location(data: schemas.LocationCreate, db: Session = Depends(get_db)):
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
def dashboard(db: Session = Depends(get_db)):
    return crud.dashboard_summary(db)


# ---------- Wheels ----------

@app.get("/api/wheels", response_model=list[schemas.WheelOut])
def list_wheels(
    db: Session = Depends(get_db),
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
def create_wheel(data: schemas.WheelCreate, db: Session = Depends(get_db)):
    existing = db.scalar(
        select(models.Wheel).where(models.Wheel.serial_number == data.serial_number.strip())
    )
    if existing:
        raise HTTPException(400, "Kotouč s tímto výrobním číslem už v databázi existuje")
    wheel = crud.create_wheel(db, data)
    return crud.to_wheel_out(db, wheel)


def _get_wheel_or_404(db: Session, wheel_id: int) -> models.Wheel:
    wheel = db.get(models.Wheel, wheel_id)
    if not wheel:
        raise HTTPException(404, "Kotouč nenalezen")
    return wheel


@app.get("/api/wheels/{wheel_id}", response_model=schemas.WheelDetailOut)
def get_wheel(wheel_id: int, db: Session = Depends(get_db)):
    wheel = _get_wheel_or_404(db, wheel_id)
    out = schemas.WheelDetailOut.model_validate(wheel)
    out.total_meters_ground = crud.wheel_total_meters(db, wheel.id)
    return out


@app.patch("/api/wheels/{wheel_id}", response_model=schemas.WheelOut)
def patch_wheel(wheel_id: int, data: schemas.WheelUpdate, db: Session = Depends(get_db)):
    wheel = _get_wheel_or_404(db, wheel_id)
    wheel = crud.update_wheel(db, wheel, data)
    return crud.to_wheel_out(db, wheel)


@app.delete("/api/wheels/{wheel_id}", status_code=204)
def remove_wheel(wheel_id: int, db: Session = Depends(get_db)):
    wheel = _get_wheel_or_404(db, wheel_id)
    crud.delete_wheel(db, wheel)


@app.post("/api/wheels/{wheel_id}/usage", response_model=schemas.UsageRecordOut)
def add_usage(wheel_id: int, data: schemas.UsageRecordCreate, db: Session = Depends(get_db)):
    wheel = _get_wheel_or_404(db, wheel_id)
    record = crud.add_usage_record(db, wheel, data)
    return record


@app.get("/api/health")
def health():
    return {"status": "ok"}
