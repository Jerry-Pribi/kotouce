"""Allow AGC to end or restore collaboration with a repair company.

Revision ID: b6d41c9e2a73
Revises: f4b9d2e7a813
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6d41c9e2a73"
down_revision: Union[str, Sequence[str], None] = "f4b9d2e7a813"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "locations",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("locations", "is_active")
