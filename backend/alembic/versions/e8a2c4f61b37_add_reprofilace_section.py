"""Sekce Reprofilace: účet firmy navázaný na místo reprofilace a historie reprofilací kotoučů

Revision ID: e8a2c4f61b37
Revises: d91f2a6b4c08
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8a2c4f61b37"
down_revision: Union[str, Sequence[str], None] = "d91f2a6b4c08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("location_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_users_location_id", "users", "locations", ["location_id"], ["id"], ondelete="SET NULL")
    op.create_table(
        "wheel_reprofilings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("wheel_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("location_name", sa.String(length=100), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("sent_by_username", sa.String(length=80), nullable=False),
        sa.Column("meters_before", sa.Float(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_by_username", sa.String(length=80), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("finished_by_username", sa.String(length=80), nullable=True),
        sa.Column("result", sa.String(length=20), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("cost", sa.Float(), nullable=True),
        sa.Column("returned_at", sa.DateTime(), nullable=True),
        sa.Column("returned_by_username", sa.String(length=80), nullable=True),
        sa.ForeignKeyConstraint(["wheel_id"], ["wheels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wheel_reprofilings_wheel_id", "wheel_reprofilings", ["wheel_id"])
    op.create_index("ix_wheel_reprofilings_location_id", "wheel_reprofilings", ["location_id"])


def downgrade() -> None:
    op.drop_index("ix_wheel_reprofilings_location_id", table_name="wheel_reprofilings")
    op.drop_index("ix_wheel_reprofilings_wheel_id", table_name="wheel_reprofilings")
    op.drop_table("wheel_reprofilings")
    op.drop_constraint("fk_users_location_id", "users", type_="foreignkey")
    op.drop_column("users", "location_id")
