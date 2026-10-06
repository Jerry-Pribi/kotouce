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
from datetime import date, datetime

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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class WheelStatus(str, enum.Enum):
    SKLAD = "sklad"                    # in stock, not yet deployed
    V_PROVOZU = "v_provozu"            # mounted on a production line
    NA_REPROFILACI = "na_reprofilaci"  # sent out for reprofiling
    VYRAZEN = "vyrazen"                # scrapped / end of life


class LocationType(str, enum.Enum):
    SKLAD = "sklad"
    LINKA = "linka"
    REPROFILACE = "reprofilace"


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

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    usage_records: Mapped[list["UsageRecord"]] = relationship(
        back_populates="wheel", cascade="all, delete-orphan", order_by="UsageRecord.record_date"
    )


class UsageRecord(Base):
    """Replaces one line of the paper 'Průvodní doklad diamantového kotouče'."""

    __tablename__ = "usage_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    wheel_id: Mapped[int] = mapped_column(ForeignKey("wheels.id"))
    wheel: Mapped["Wheel"] = relationship(back_populates="usage_records")

    record_date: Mapped[date] = mapped_column(Date)
    meters_ground: Mapped[float] = mapped_column(Float)
    operator: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
