from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    language: Mapped[str] = mapped_column(String(5), default="en", server_default="en")
    api_client_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    api_client_secret_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    identities: Mapped[list["OAuthIdentity"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class OAuthIdentity(Base):
    __tablename__ = "oauth_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(16))
    provider_user_id: Mapped[str] = mapped_column(String(64))

    user: Mapped[User] = relationship(back_populates="identities")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Movie(Base):
    __tablename__ = "movies"
    __table_args__ = (UniqueConstraint("source", "source_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(16))  # "archive" | "peertube"
    source_id: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(512))
    year: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[float | None] = mapped_column(Float)  # TMDb vote average (0-10)
    poster_url: Mapped[str | None] = mapped_column(String(1024))
    backdrop_url: Mapped[str | None] = mapped_column(String(1024))
    summary: Mapped[str | None] = mapped_column(Text)
    genres: Mapped[list] = mapped_column(JSON, default=list)
    runtime_minutes: Mapped[int | None] = mapped_column(Integer)
    language: Mapped[str | None] = mapped_column(String(8))
    directors: Mapped[list] = mapped_column(JSON, default=list)
    producers: Mapped[list] = mapped_column(JSON, default=list)
    cast: Mapped[list] = mapped_column(JSON, default=list)  # [{name, character, photo}]
    popularity: Mapped[int] = mapped_column(BigInteger, default=0)  # downloads/views at the source
    tmdb_id: Mapped[int | None] = mapped_column(Integer)
    imdb_id: Mapped[str | None] = mapped_column(String(16))
    page_url: Mapped[str | None] = mapped_column(String(1024))
    enriched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    details_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Download / cache state
    download_state: Mapped[str] = mapped_column(String(16), default="none", server_default="none")
    file_path: Mapped[str | None] = mapped_column(String(1024))  # relative to downloads dir
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_watched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subtitles: Mapped[list["Subtitle"]] = relationship(cascade="all, delete-orphan", order_by="Subtitle.lang")


class Subtitle(Base):
    __tablename__ = "subtitles"
    __table_args__ = (UniqueConstraint("movie_id", "lang", "source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id", ondelete="CASCADE"), index=True)
    lang: Mapped[str] = mapped_column(String(8))
    label: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(16))
    path: Mapped[str] = mapped_column(String(1024))  # relative to subtitles dir (WebVTT)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()
    movie: Mapped[Movie] = relationship()


class WatchedMovie(Base):
    __tablename__ = "watched_movies"
    __table_args__ = (UniqueConstraint("user_id", "movie_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id", ondelete="CASCADE"), index=True)
    watched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
