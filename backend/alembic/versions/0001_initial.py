"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(32), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("first_name", sa.String(64), nullable=False),
        sa.Column("last_name", sa.String(64), nullable=False),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("avatar_url", sa.String(512)),
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
        sa.Column("api_client_id", sa.String(64), unique=True),
        sa.Column("api_client_secret_hash", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username_lower", "users", [sa.text("lower(username)")], unique=True)

    op.create_table(
        "oauth_identities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("provider_user_id", sa.String(64), nullable=False),
        sa.UniqueConstraint("provider", "provider_user_id"),
    )
    op.create_index("ix_oauth_identities_user_id", "oauth_identities", ["user_id"])

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])

    op.create_table(
        "movies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("source_id", sa.String(255), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("year", sa.Integer()),
        sa.Column("rating", sa.Float()),
        sa.Column("poster_url", sa.String(1024)),
        sa.Column("backdrop_url", sa.String(1024)),
        sa.Column("summary", sa.Text()),
        sa.Column("genres", sa.JSON(), nullable=False),
        sa.Column("runtime_minutes", sa.Integer()),
        sa.Column("language", sa.String(8)),
        sa.Column("directors", sa.JSON(), nullable=False),
        sa.Column("producers", sa.JSON(), nullable=False),
        sa.Column("cast", sa.JSON(), nullable=False),
        sa.Column("popularity", sa.BigInteger(), nullable=False),
        sa.Column("tmdb_id", sa.Integer()),
        sa.Column("imdb_id", sa.String(16)),
        sa.Column("page_url", sa.String(1024)),
        sa.Column("enriched_at", sa.DateTime(timezone=True)),
        sa.Column("details_at", sa.DateTime(timezone=True)),
        sa.Column("download_state", sa.String(16), nullable=False, server_default="none"),
        sa.Column("file_path", sa.String(1024)),
        sa.Column("file_size", sa.BigInteger()),
        sa.Column("downloaded_at", sa.DateTime(timezone=True)),
        sa.Column("last_watched_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source", "source_id"),
    )

    op.create_table(
        "subtitles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("movie_id", sa.Integer(), sa.ForeignKey("movies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lang", sa.String(8), nullable=False),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.UniqueConstraint("movie_id", "lang", "source"),
    )
    op.create_index("ix_subtitles_movie_id", "subtitles", ["movie_id"])

    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("movie_id", sa.Integer(), sa.ForeignKey("movies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_comments_user_id", "comments", ["user_id"])
    op.create_index("ix_comments_movie_id", "comments", ["movie_id"])
    op.create_index("ix_comments_created_at", "comments", ["created_at"])

    op.create_table(
        "watched_movies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("movie_id", sa.Integer(), sa.ForeignKey("movies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("watched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "movie_id"),
    )
    op.create_index("ix_watched_movies_user_id", "watched_movies", ["user_id"])
    op.create_index("ix_watched_movies_movie_id", "watched_movies", ["movie_id"])


def downgrade() -> None:
    for table in ("watched_movies", "comments", "subtitles", "movies", "password_reset_tokens",
                  "oauth_identities", "users"):
        op.drop_table(table)
