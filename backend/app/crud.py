from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models, schemas


def get_or_create_manufacturer(db: Session, name: str) -> models.Manufacturer:
    name = name.strip()
    obj = db.scalar(select(models.Manufacturer).where(models.Manufacturer.name == name))
    if obj:
        return obj
    obj = models.Manufacturer(name=name)
    db.add(obj)
    db.flush()
    return obj


def get_or_create_profile(db: Session, code: str) -> models.Profile:
    code = code.strip()
    obj = db.scalar(select(models.Profile).where(models.Profile.code == code))
    if obj:
        return obj
    obj = models.Profile(code=code)
    db.add(obj)
    db.flush()
    return obj


def wheel_total_meters(db: Session, wheel_id: int) -> float:
    total = db.scalar(
        select(func.coalesce(func.sum(models.UsageRecord.meters_ground), 0.0)).where(
            models.UsageRecord.wheel_id == wheel_id
        )
    )
    return float(total or 0.0)


def create_wheel(db: Session, data: schemas.WheelCreate) -> models.Wheel:
    manufacturer = get_or_create_manufacturer(db, data.manufacturer)
    profile = get_or_create_profile(db, data.profile)
    wheel = models.Wheel(
        serial_number=data.serial_number.strip(),
        manufacturer=manufacturer,
        diameter=data.diameter,
        profile=profile,
        status=data.status,
        location_id=data.location_id,
        max_lifetime_m=data.max_lifetime_m,
        received_date=data.received_date,
        note=data.note,
    )
    db.add(wheel)
    db.commit()
    db.refresh(wheel)
    return wheel


def update_wheel(db: Session, wheel: models.Wheel, data: schemas.WheelUpdate) -> models.Wheel:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(wheel, field, value)
    db.commit()
    db.refresh(wheel)
    return wheel


def delete_wheel(db: Session, wheel: models.Wheel) -> None:
    db.delete(wheel)
    db.commit()


def add_usage_record(
    db: Session, wheel: models.Wheel, data: schemas.UsageRecordCreate
) -> models.UsageRecord:
    record = models.UsageRecord(wheel_id=wheel.id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def to_wheel_out(db: Session, wheel: models.Wheel) -> schemas.WheelOut:
    out = schemas.WheelOut.model_validate(wheel)
    out.total_meters_ground = wheel_total_meters(db, wheel.id)
    return out


def dashboard_summary(db: Session) -> schemas.DashboardSummary:
    wheels = db.scalars(select(models.Wheel)).all()
    total = len(wheels)

    by_status: dict[str, int] = {}
    for w in wheels:
        by_status[w.status.value] = by_status.get(w.status.value, 0) + 1

    matrix_map: dict[tuple[str, int, str], int] = {}
    near_eol = 0
    for w in wheels:
        if w.status == models.WheelStatus.VYRAZEN:
            continue
        key = (w.manufacturer.name, w.diameter, w.profile.code)
        matrix_map[key] = matrix_map.get(key, 0) + 1
        if w.max_lifetime_m:
            used = wheel_total_meters(db, w.id)
            if used >= 0.85 * w.max_lifetime_m:
                near_eol += 1

    matrix = [
        schemas.DashboardCell(manufacturer=m, diameter=d, profile=p, count=c)
        for (m, d, p), c in sorted(matrix_map.items())
    ]

    return schemas.DashboardSummary(
        total_wheels=total,
        by_status=by_status,
        matrix=matrix,
        wheels_near_end_of_life=near_eol,
    )
