"""Add mega admin role and audit records for user deletions and wheel creation."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3c82de74a610"
down_revision: Union[str, Sequence[str], None] = "9b17ac43d820"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users", "role",
        existing_type=sa.Enum("user", "admin", name="userrole", native_enum=False, length=20),
        type_=sa.Enum("user", "admin", "mega_admin", name="userrole", native_enum=False, length=20),
        existing_nullable=False,
    )
    op.create_table(
        "user_deletion_audits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_username", sa.String(length=80), nullable=False),
        sa.Column("deleted_user_id", sa.Integer(), nullable=True),
        sa.Column("deleted_username", sa.String(length=80), nullable=False),
        sa.Column("deleted_role", sa.Enum("user", "admin", "mega_admin", name="userrole", native_enum=False, length=20), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "wheel_creation_audits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("wheel_id", sa.Integer(), nullable=True),
        sa.Column("wheel_serial_number", sa.String(length=50), nullable=False),
        sa.Column("manufacturer_name", sa.String(length=50), nullable=False),
        sa.Column("diameter", sa.Integer(), nullable=False),
        sa.Column("profile_code", sa.String(length=20), nullable=False),
        sa.Column("initial_status", sa.Enum("sklad", "v_provozu", "na_reprofilaci", "vyrazen", name="wheelstatus", native_enum=False, length=30), nullable=False),
        sa.Column("initial_location_name", sa.String(length=100), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_username", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["wheel_id"], ["wheels.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wheel_creation_audits_wheel_id"), "wheel_creation_audits", ["wheel_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_wheel_creation_audits_wheel_id"), table_name="wheel_creation_audits")
    op.drop_table("wheel_creation_audits")
    op.drop_table("user_deletion_audits")
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'mega_admin'")
    op.alter_column(
        "users", "role",
        existing_type=sa.Enum("user", "admin", "mega_admin", name="userrole", native_enum=False, length=20),
        type_=sa.Enum("user", "admin", name="userrole", native_enum=False, length=20),
        existing_nullable=False,
    )
