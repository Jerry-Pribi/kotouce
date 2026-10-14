"""ORM models.

Domain recap (from the process description):
- A grinding wheel (kotouc) has a unique serial number stamped by the
  manufacturer, a manufacturer, a diameter, and a profile shape.
- It moves between locations (sklad / výrobní linka / prostor reprofilace)
  over its life and has a status.
- Its usage (ground meters) used to be logged by hand on a paper card
  ("Průvodní doklad diamantového kotouče") -> UsageRecord replaces that.
"""
import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    Float,
    Enum,
    ForeignKey,
    Date,
    DateTime,
    Text,
    UniqueConstraint,
    Boolean,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    """Aktuální čas v UTC bez časové zóny — tak, jak ho databáze ukládá.

    Náhrada za zastaralé datetime.utcnow() (Python 3.12+).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class WheelStatus(str, enum.Enum):
    SKLAD = "sklad"                    # in stock, not yet deployed
    V_PROVOZU = "v_provozu"            # mounted on a production line
    NA_REPROFILACI = "na_reprofilaci"  # sent out for reprofiling
    VYRAZEN = "vyrazen"                # scrapped / end of life


class LocationType(str, enum.Enum):
    SKLAD = "sklad"
    LINKA = "linka"
    REPROFILACE = "reprofilace"


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"
    MEGA_ADMIN = "mega_admin"
    REPROFILACE = "reprofilace"        # starší označení účtu firmy (už se nepoužívá, firma má vlastní role)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x], native_enum=False, length=20),
        default=UserRole.USER,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Ke které firmě účet patří: NULL = AGC, jinak firma reprofilace (místo typu „reprofilace“).
    # Každá firma má vlastní megaAdmina, adminy a uživatele — úplně odděleně od AGC.
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    location: Mapped["Location | None"] = relationship()
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    location_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # firma účtu (NULL = AGC)

    user: Mapped["User | None"] = relationship(back_populates="sessions")


class UserDeletionAudit(Base):
    __tablename__ = "user_deletion_audits"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_username: Mapped[str] = mapped_column(String(80))
    deleted_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deleted_username: Mapped[str] = mapped_column(String(80))
    deleted_role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x], native_enum=False, length=20)
    )
    deleted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    location_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # firma (NULL = AGC)


class WheelCreationAudit(Base):
    __tablename__ = "wheel_creation_audits"

    id: Mapped[int] = mapped_column(primary_key=True)
    wheel_id: Mapped[int | None] = mapped_column(ForeignKey("wheels.id", ondelete="SET NULL"), nullable=True, index=True)
    wheel_serial_number: Mapped[str] = mapped_column(String(50))
    manufacturer_name: Mapped[str] = mapped_column(String(50))
    diameter: Mapped[int] = mapped_column(Integer)
    profile_code: Mapped[str] = mapped_column(String(20))
    initial_status: Mapped[WheelStatus] = mapped_column(
        Enum(WheelStatus, values_callable=lambda x: [e.value for e in x], native_enum=False, length=30)
    )
    initial_location_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_username: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)

    wheels: Mapped[list["Wheel"]] = relationship(back_populates="manufacturer")


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)  # e.g. "C3", "G1,6"

    wheels: Mapped[list["Wheel"]] = relationship(back_populates="profile")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[LocationType] = mapped_column(
        Enum(LocationType, values_callable=lambda x: [e.value for e in x], native_enum=False, length=30)
    )

    wheels: Mapped[list["Wheel"]] = relationship(back_populates="location")


class Wheel(Base):
    __tablename__ = "wheels"
    __table_args__ = (UniqueConstraint("serial_number", name="uq_wheel_serial"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    serial_number: Mapped[str] = mapped_column(String(50), index=True)

    manufacturer_id: Mapped[int] = mapped_column(ForeignKey("manufacturers.id"))
    manufacturer: Mapped["Manufacturer"] = relationship(back_populates="wheels")

    diameter: Mapped[int] = mapped_column(Integer)  # mm, e.g. 150 / 250

    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    profile: Mapped["Profile"] = relationship(back_populates="wheels")

    status: Mapped[WheelStatus] = mapped_column(
        Enum(WheelStatus, values_callable=lambda x: [e.value for e in x], native_enum=False, length=30),
        default=WheelStatus.SKLAD,
    )

    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id"), nullable=True
    )
    location: Mapped["Location | None"] = relationship(back_populates="wheels")

    max_lifetime_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    retired_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    usage_records: Mapped[list["UsageRecord"]] = relationship(
        back_populates="wheel", cascade="all, delete-orphan", order_by="UsageRecord.record_date"
    )
    return_records: Mapped[list["WheelReturn"]] = relationship(
        back_populates="wheel", cascade="all, delete-orphan", order_by="WheelReturn.returned_at.desc()"
    )
    cycles: Mapped[list["WheelCycle"]] = relationship(
        back_populates="wheel", cascade="all, delete-orphan", order_by="WheelCycle.taken_at.desc()"
    )
    reprofilings: Mapped[list["WheelReprofiling"]] = relationship(
        back_populates="wheel", cascade="all, delete-orphan", order_by="WheelReprofiling.sent_at.desc()"
    )


class WheelReturn(Base):
    __tablename__ = "wheel_returns"

    id: Mapped[int] = mapped_column(primary_key=True)
    wheel_id: Mapped[int] = mapped_column(ForeignKey("wheels.id", ondelete="CASCADE"), index=True)
    used_on_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    used_on_location_name: Mapped[str] = mapped_column(String(100))
    returned_to_location_name: Mapped[str] = mapped_column(String(100))
    returned_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    returned_by_username: Mapped[str] = mapped_column(String(80))
    returned_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    wheel: Mapped["Wheel"] = relationship(back_populates="return_records")


class WheelCycle(Base):
    __tablename__ = "wheel_cycles"

    id: Mapped[int] = mapped_column(primary_key=True)
    wheel_id: Mapped[int] = mapped_column(ForeignKey("wheels.id", ondelete="CASCADE"), index=True)
    taken_by_name: Mapped[str] = mapped_column(String(100))
    taken_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    taken_by_username: Mapped[str] = mapped_column(String(80))
    taken_from_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    taken_from_location_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    used_on_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    used_on_location_name: Mapped[str] = mapped_column(String(100))
    taken_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    returned_to_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    returned_to_location_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    returned_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    returned_by_username: Mapped[str | None] = mapped_column(String(80), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    wheel: Mapped["Wheel"] = relationship(back_populates="cycles")
    usage_records: Mapped[list["UsageRecord"]] = relationship(back_populates="cycle")


class WheelReprofiling(Base):
    """Jedna cesta kotouče na reprofilaci: odeslání z AGC → převzetí firmou → hotovo / nelze → návrat do AGC."""

    __tablename__ = "wheel_reprofilings"

    id: Mapped[int] = mapped_column(primary_key=True)
    wheel_id: Mapped[int] = mapped_column(ForeignKey("wheels.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    location_name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # firma / místo reprofilace

    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    sent_by_username: Mapped[str] = mapped_column(String(80))
    meters_before: Mapped[float] = mapped_column(Float, default=0.0)  # nabroušeno do odeslání

    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)   # firma kotouč převzala
    accepted_by_username: Mapped[str | None] = mapped_column(String(80), nullable=True)

    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_by_username: Mapped[str | None] = mapped_column(String(80), nullable=True)
    result: Mapped[str | None] = mapped_column(String(20), nullable=True)  # hotovo / nelze
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)       # cena dle firmy (nepovinná)

    returned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # AGC kotouč převzalo zpět
    returned_by_username: Mapped[str | None] = mapped_column(String(80), nullable=True)

    wheel: Mapped["Wheel"] = relationship(back_populates="reprofilings")


class UsageRecord(Base):
    """Replaces one line of the paper 'Průvodní doklad diamantového kotouče'."""

    __tablename__ = "usage_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    wheel_id: Mapped[int] = mapped_column(ForeignKey("wheels.id"))
    wheel: Mapped["Wheel"] = relationship(back_populates="usage_records")
    cycle_id: Mapped[int | None] = mapped_column(ForeignKey("wheel_cycles.id", ondelete="SET NULL"), nullable=True, index=True)
    cycle: Mapped["WheelCycle | None"] = relationship(back_populates="usage_records")

    record_date: Mapped[date] = mapped_column(Date)
    meters_ground: Mapped[float] = mapped_column(Float)
    operator: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
