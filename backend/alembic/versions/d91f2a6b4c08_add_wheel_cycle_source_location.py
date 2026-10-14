"""Record the warehouse a wheel was checked out from."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d91f2a6b4c08"
down_revision: Union[str, Sequence[str], None] = "c5d18a6e9472"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("wheel_cycles", sa.Column("taken_from_location_id", sa.Integer(), nullable=True))
    op.add_column("wheel_cycles", sa.Column("taken_from_location_name", sa.String(length=100), nullable=True))
    op.create_foreign_key(
        "fk_wheel_cycles_taken_from_location_id_locations",
        "wheel_cycles",
        "locations",
        ["taken_from_location_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_wheel_cycles_taken_from_location_id_locations", "wheel_cycles", type_="foreignkey")
    op.drop_column("wheel_cycles", "taken_from_location_name")
    op.drop_column("wheel_cycles", "taken_from_location_id")
