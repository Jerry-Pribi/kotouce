from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import WheelStatus, LocationType, UserRole

# Průběh reprofilace: ceka = odesláno, firma ještě nepotvrdila · prevzato · hotovo · nelze
ReprofilingState = Literal["ceka", "prevzato", "hotovo", "nelze"]


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
    taken_by_name: str | None = None


class WheelUpdate(BaseModel):
    status: WheelStatus | None = None
    location_id: int | None = None
    max_lifetime_m: float | None = None
    retired_date: date | None = None
    note: str | None = None
    returned_from_location_id: int | None = None
    taken_by_name: str | None = None


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
    current_taken_by_name: str | None = None
    current_taken_by_username: str | None = None
    current_line_name: str | None = None
    current_taken_at: datetime | None = None
    reprofiling_count: int = 0                 # kolikrát byl kotouč na reprofilaci
    reprofiling_state: ReprofilingState | None = None  # jen když je na reprofilaci
    model_config = ConfigDict(from_attributes=True)


class WheelReprofilingOut(BaseModel):
    id: int
    wheel_id: int
    location_id: int | None
    location_name: str | None
    sent_at: datetime
    sent_by_username: str
    meters_before: float
    accepted_at: datetime | None
    accepted_by_username: str | None
    finished_at: datetime | None
    finished_by_username: str | None
    result: str | None
    note: str | None
    cost: float | None
    returned_at: datetime | None
    returned_by_username: str | None
    model_config = ConfigDict(from_attributes=True)


class RepairDone(BaseModel):
    """Firma hlásí hotovou reprofilaci (cena je nepovinná — často ji určí až faktura)."""
    note: str | None = Field(None, max_length=500)
    cost: float | None = Field(None, ge=0)


class RepairFailed(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class RepairWheelOut(BaseModel):
    """Kotouč, jak ho vidí firma reprofilace (bez interních údajů AGC)."""
    id: int
    serial_number: str
    manufacturer: str
    diameter: int
    profile: str
    status: WheelStatus
    at_us: bool                       # kotouč je teď u této firmy
    state: ReprofilingState | None    # průběh aktuální reprofilace
    sent_at: datetime | None
    total_meters_ground: float
    reprofilings_here: int            # kolikrát už byl u této firmy
    reprofilings: list[WheelReprofilingOut] = []


class WheelReturnOut(BaseModel):
    id: int
    wheel_id: int
    used_on_location_id: int | None
    used_on_location_name: str
    returned_to_location_name: str
    returned_by_username: str
    returned_at: datetime
    model_config = ConfigDict(from_attributes=True)


class WheelCycleOut(BaseModel):
    id: int
    wheel_id: int
    taken_by_name: str
    taken_by_username: str
    taken_from_location_id: int | None
    taken_from_location_name: str | None
    used_on_location_id: int | None
    used_on_location_name: str
    taken_at: datetime
    returned_to_location_id: int | None
    returned_to_location_name: str | None
    returned_by_username: str | None
    returned_at: datetime | None
    meters_ground: float = 0.0
    model_config = ConfigDict(from_attributes=True)


class WheelDetailOut(WheelOut):
    usage_records: list[UsageRecordOut] = []
    return_records: list[WheelReturnOut] = []
    cycles: list[WheelCycleOut] = []
    reprofilings: list[WheelReprofilingOut] = []


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
    # Sekce na přihlašovací stránce: AGC, nebo Reprofilace (firma, která kotouče přebrušuje)
    portal: Literal["agc", "reprofilace"] = "agc"


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.USER


class UserPasswordReset(BaseModel):
    password: str


class UserRename(BaseModel):
    username: str


class UserOut(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
    location: LocationOut | None = None  # místo reprofilace (jen účet reprofilace)
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


class RepairCompanyOut(BaseModel):
    """Firma reprofilace z pohledu AGC: jen jestli má účty (účty samotné spravuje firma)."""
    id: int
    name: str
    accounts: int
    is_active: bool


class CompanyFirstAdmin(BaseModel):
    username: str
    password: str


class RepairCompanyCreate(BaseModel):
    """Nová firma reprofilace a její první účet (megaAdmin firmy)."""
    name: str
    username: str
    password: str
