"""Oddělené účty firem reprofilace: firma u přihlášení a auditů, vlastní role firmy

Revision ID: f4b9d2e7a813
Revises: e8a2c4f61b37
Create Date: 2026-10-14 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4b9d2e7a813"
down_revision: Union[str, Sequence[str], None] = "e8a2c4f61b37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("location_id", sa.Integer(), nullable=True))
    op.create_index("ix_user_sessions_location_id", "user_sessions", ["location_id"])
    op.add_column("user_deletion_audits", sa.Column("location_id", sa.Integer(), nullable=True))
    op.create_index("ix_user_deletion_audits_location_id", "user_deletion_audits", ["location_id"])
    # Přihlášení dosavadních účtů dostanou firmu podle účtu
    op.execute(
        "UPDATE user_sessions s JOIN users u ON u.id = s.user_id SET s.location_id = u.location_id"
    )
    # Dosavadní účty „reprofilace“ se stanou megaAdminy své firmy (dřív měla firma jen jeden účet)
    op.execute("UPDATE users SET role = 'mega_admin' WHERE role = 'reprofilace' AND location_id IS NOT NULL")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'reprofilace' WHERE location_id IS NOT NULL")
    op.drop_index("ix_user_deletion_audits_location_id", table_name="user_deletion_audits")
    op.drop_column("user_deletion_audits", "location_id")
    op.drop_index("ix_user_sessions_location_id", table_name="user_sessions")
    op.drop_column("user_sessions", "location_id")
