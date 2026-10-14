"""Add records for wheels returned from production to stock."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a17b4f9c2d31"
down_revision: Union[str, Sequence[str], None] = "3c82de74a610"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wheel_returns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("wheel_id", sa.Integer(), nullable=False),
        sa.Column("used_on_location_id", sa.Integer(), nullable=True),
        sa.Column("used_on_location_name", sa.String(length=100), nullable=False),
        sa.Column("returned_to_location_name", sa.String(length=100), nullable=False),
        sa.Column("returned_by_user_id", sa.Integer(), nullable=True),
        sa.Column("returned_by_username", sa.String(length=80), nullable=False),
        sa.Column("returned_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["wheel_id"], ["wheels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["used_on_location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["returned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wheel_returns_wheel_id", "wheel_returns", ["wheel_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_wheel_returns_wheel_id", table_name="wheel_returns")
    op.drop_table("wheel_returns")
