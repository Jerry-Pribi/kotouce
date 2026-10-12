from datetime import date, datetime
from pydantic import BaseModel, ConfigDict

from .models import WheelStatus, LocationType, UserRole


class ManufacturerCreate(BaseModel):
    name: str


class ManufacturerOut(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class ProfileCreate(BaseModel):
    code: str


class ProfileOut(BaseModel):
    id: int
    code: str
    model_config = ConfigDict(from_attributes=True)


class LocationOut(BaseModel):
    id: int
    name: str
    type: LocationType
    model_config = ConfigDict(from_attributes=True)


class LocationCreate(BaseModel):
    name: str
    type: LocationType


class UsageRecordCreate(BaseModel):
    record_date: date
    meters_ground: float
    operator: str | None = None
    note: str | None = None


class UsageRecordOut(UsageRecordCreate):
    id: int
    wheel_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class WheelCreate(BaseModel):
    serial_number: str
    manufacturer: str  # name; created if it doesn't exist
    diameter: int
    profile: str  # code; created if it doesn't exist
    status: WheelStatus = WheelStatus.SKLAD
    location_id: int | None = None
    max_lifetime_m: float | None = None
    received_date: date | None = None
    note: str | None = None


class WheelUpdate(BaseModel):
    status: WheelStatus | None = None
    location_id: int | None = None
    max_lifetime_m: float | None = None
    retired_date: date | None = None
    note: str | None = None


class WheelOut(BaseModel):
    id: int
    serial_number: str
    manufacturer: ManufacturerOut
    diameter: int
    profile: ProfileOut
    status: WheelStatus
    location: LocationOut | None
    max_lifetime_m: float | None
    received_date: date | None
    retired_date: date | None
    note: str | None
    total_meters_ground: float = 0.0
    model_config = ConfigDict(from_attributes=True)


class WheelDetailOut(WheelOut):
    usage_records: list[UsageRecordOut] = []


class DashboardCell(BaseModel):
    manufacturer: str
    diameter: int
    profile: str
    count: int


class DashboardSummary(BaseModel):
    total_wheels: int
    by_status: dict[str, int]
    matrix: list[DashboardCell]
    wheels_near_end_of_life: int


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.USER


class UserOut(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserSessionOut(BaseModel):
    id: int
    username: str
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    ended_at: datetime | None
    is_active: bool


class UserDeletionAuditOut(BaseModel):
    id: int
    actor_username: str
    deleted_username: str
    deleted_role: UserRole
    deleted_at: datetime
    model_config = ConfigDict(from_attributes=True)


class WheelCreationAuditOut(BaseModel):
    id: int
    wheel_id: int | None
    wheel_serial_number: str
    manufacturer_name: str
    diameter: int
    profile_code: str
    initial_status: WheelStatus
    initial_location_name: str | None
    created_by_username: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
