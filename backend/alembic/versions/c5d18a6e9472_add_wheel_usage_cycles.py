"""Track each checkout, use, grinding total, and return of a wheel."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5d18a6e9472"
down_revision: Union[str, Sequence[str], None] = "a17b4f9c2d31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wheel_cycles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("wheel_id", sa.Integer(), nullable=False),
        sa.Column("taken_by_name", sa.String(length=100), nullable=False),
        sa.Column("taken_by_user_id", sa.Integer(), nullable=True),
        sa.Column("taken_by_username", sa.String(length=80), nullable=False),
        sa.Column("used_on_location_id", sa.Integer(), nullable=True),
        sa.Column("used_on_location_name", sa.String(length=100), nullable=False),
        sa.Column("taken_at", sa.DateTime(), nullable=False),
        sa.Column("returned_to_location_id", sa.Integer(), nullable=True),
        sa.Column("returned_to_location_name", sa.String(length=100), nullable=True),
        sa.Column("returned_by_user_id", sa.Integer(), nullable=True),
        sa.Column("returned_by_username", sa.String(length=80), nullable=True),
        sa.Column("returned_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["wheel_id"], ["wheels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["taken_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["used_on_location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["returned_to_location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["returned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wheel_cycles_wheel_id", "wheel_cycles", ["wheel_id"], unique=False)
    op.add_column("usage_records", sa.Column("cycle_id", sa.Integer(), nullable=True))
    op.create_index("ix_usage_records_cycle_id", "usage_records", ["cycle_id"], unique=False)
    op.create_foreign_key(
        "fk_usage_records_cycle_id_wheel_cycles",
        "usage_records",
        "wheel_cycles",
        ["cycle_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_usage_records_cycle_id_wheel_cycles", "usage_records", type_="foreignkey")
    op.drop_index("ix_usage_records_cycle_id", table_name="usage_records")
    op.drop_column("usage_records", "cycle_id")
    op.drop_index("ix_wheel_cycles_wheel_id", table_name="wheel_cycles")
    op.drop_table("wheel_cycles")
