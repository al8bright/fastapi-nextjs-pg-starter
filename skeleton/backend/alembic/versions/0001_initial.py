"""initial schema — app_meta

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01 00:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_meta",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_app_meta_key"), "app_meta", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_app_meta_key"), table_name="app_meta")
    op.drop_table("app_meta")
