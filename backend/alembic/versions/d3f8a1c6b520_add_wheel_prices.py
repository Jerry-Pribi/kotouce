"""Ceny nových kotoučů podle typu (výrobce + průměr + profil) pro analýzu útrat.

Revision ID: d3f8a1c6b520
Revises: c7e25a91d043
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3f8a1c6b520"
down_revision: Union[str, Sequence[str], None] = "c7e25a91d043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wheel_prices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manufacturer_id", sa.Integer(), sa.ForeignKey("manufacturers.id"), nullable=False),
        sa.Column("diameter", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by_username", sa.String(80), nullable=False),
        sa.UniqueConstraint("manufacturer_id", "diameter", "profile_id", name="uq_wheel_price_type"),
    )


def downgrade() -> None:
    op.drop_table("wheel_prices")
