"""Movies imported through the API remember who added them

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-14
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("movies", sa.Column("added_by_id", sa.Integer(),
                                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_movies_added_by_id", "movies", ["added_by_id"])


def downgrade() -> None:
    op.drop_index("ix_movies_added_by_id", "movies")
    op.drop_column("movies", "added_by_id")
