"""Allow the same username in separate reprofiling companies.

Revision ID: c7e25a91d043
Revises: b6d41c9e2a73
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e25a91d043"
down_revision: Union[str, Sequence[str], None] = "b6d41c9e2a73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("username_scope", sa.String(length=40), nullable=False, server_default="agc"),
    )
    users = sa.table("users", sa.column("id", sa.Integer()), sa.column("location_id", sa.Integer()))
    connection = op.get_bind()
    repair_rows = connection.execute(
        sa.select(users.c.id, users.c.location_id).where(users.c.location_id.is_not(None))
    )
    for user_id, location_id in repair_rows:
        connection.execute(
            sa.text("UPDATE users SET username_scope = :scope WHERE id = :user_id"),
            {"scope": f"repair:{location_id}", "user_id": user_id},
        )

    # Keep the username index for login lookup, but remove global uniqueness.
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)
    op.create_index(
        "uq_users_username_scope", "users", ["username", "username_scope"], unique=True
    )


def downgrade() -> None:
    connection = op.get_bind()
    duplicates = connection.execute(sa.text(
        "SELECT username FROM users GROUP BY username HAVING COUNT(*) > 1 LIMIT 1"
    )).first()
    if duplicates:
        raise RuntimeError(
            "Nelze vrátit globální unikátnost uživatelských jmen: některé firmy používají stejné jméno."
        )
    op.drop_index("uq_users_username_scope", table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_column("users", "username_scope")
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
