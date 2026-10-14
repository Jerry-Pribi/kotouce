
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


def create_wheel(db: Session, data: schemas.WheelCreate, created_by: models.User) -> models.Wheel:
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
    db.flush()
    location = db.get(models.Location, data.location_id) if data.location_id else None
    if data.status == models.WheelStatus.V_PROVOZU and location:
        db.add(models.WheelCycle(
            wheel_id=wheel.id,
            taken_by_name=(data.taken_by_name or "").strip(),
            taken_by_user_id=created_by.id,
            taken_by_username=created_by.username,
            used_on_location_id=location.id,
            used_on_location_name=location.name,
        ))
    db.add(models.WheelCreationAudit(
        wheel_id=wheel.id,
        wheel_serial_number=wheel.serial_number,
        manufacturer_name=manufacturer.name,
        diameter=wheel.diameter,
        profile_code=profile.code,
        initial_status=wheel.status,
        initial_location_name=location.name if location else None,
        created_by_user_id=created_by.id,
        created_by_username=created_by.username,
    ))
    db.commit()
    db.refresh(wheel)
    return wheel


def update_wheel(db: Session, wheel: models.Wheel, data: schemas.WheelUpdate) -> models.Wheel:
    for field, value in data.model_dump(exclude_unset=True, exclude={"returned_from_location_id", "taken_by_name"}).items():
        setattr(wheel, field, value)
    db.commit()
    db.refresh(wheel)
    return wheel


def delete_wheel(db: Session, wheel: models.Wheel) -> None:
    db.delete(wheel)
    db.commit()


def add_usage_record(
    db: Session, wheel: models.Wheel, data: schemas.UsageRecordCreate, cycle_id: int | None = None
) -> models.UsageRecord:
    record = models.UsageRecord(wheel_id=wheel.id, cycle_id=cycle_id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def to_wheel_out(db: Session, wheel: models.Wheel) -> schemas.WheelOut:
    out = schemas.WheelOut.model_validate(wheel)
    out.total_meters_ground = wheel_total_meters(db, wheel.id)
    active_cycle = db.scalar(select(models.WheelCycle).where(
        models.WheelCycle.wheel_id == wheel.id,
        models.WheelCycle.returned_at.is_(None),
    ).order_by(models.WheelCycle.taken_at.desc()))
    if active_cycle:
        out.current_taken_by_name = active_cycle.taken_by_name
        out.current_taken_by_username = active_cycle.taken_by_username
        out.current_line_name = active_cycle.used_on_location_name
        out.current_taken_at = active_cycle.taken_at
    out.reprofiling_count = len(wheel.reprofilings)
    open_r = open_reprofiling(wheel)
    if wheel.status == models.WheelStatus.NA_REPROFILACI and open_r:
        out.reprofiling_state = reprofiling_state(open_r)
    return out


# ---------- Reprofilace ----------

def open_reprofiling(wheel: models.Wheel) -> models.WheelReprofiling | None:
    """Rozpracovaná reprofilace — kotouč odeslaný a AGC ho ještě nepřevzalo zpět."""
    return next((r for r in wheel.reprofilings if r.returned_at is None), None)


def reprofiling_state(r: models.WheelReprofiling) -> schemas.ReprofilingState:
    if r.result == "hotovo":
        return "hotovo"
    if r.result == "nelze":
        return "nelze"
    return "prevzato" if r.accepted_at else "ceka"


def track_reprofiling(
    db: Session,
    wheel: models.Wheel,
    old_status: models.WheelStatus,
    new_status: models.WheelStatus | None,
    location: models.Location | None,
    user: models.User,
) -> None:
    """Zapíše cestu kotouče na reprofilaci podle změny stavu na kartě kotouče (volá se před uložením změny).

    - stav → Na reprofilaci: nový záznam (odeslání),
    - změna místa reprofilace u kotouče na reprofilaci: záznam dostane firmu,
    - stav z Na reprofilaci jinam: AGC kotouč převzalo zpět (nebo vyřadilo).
    """
    now = models.utc_now()
    current = open_reprofiling(wheel)
    reprof_location = location if location and location.type == models.LocationType.REPROFILACE else None
    status_after = new_status or old_status

    if old_status != models.WheelStatus.NA_REPROFILACI and status_after == models.WheelStatus.NA_REPROFILACI:
        if current:  # starý nedokončený záznam uzavřít, ať nevisí
            current.returned_at, current.returned_by_username = now, user.username
        if reprof_location is None and wheel.location and wheel.location.type == models.LocationType.REPROFILACE:
            reprof_location = wheel.location
        db.add(models.WheelReprofiling(
            wheel_id=wheel.id,
            location_id=reprof_location.id if reprof_location else None,
            location_name=reprof_location.name if reprof_location else None,
            sent_at=now,
            sent_by_username=user.username,
            meters_before=wheel_total_meters(db, wheel.id),
        ))
    elif old_status == models.WheelStatus.NA_REPROFILACI and status_after == models.WheelStatus.NA_REPROFILACI:
        if current and reprof_location and current.location_id != reprof_location.id:
            current.location_id, current.location_name = reprof_location.id, reprof_location.name
    elif old_status == models.WheelStatus.NA_REPROFILACI and current:
        current.returned_at, current.returned_by_username = now, user.username


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
