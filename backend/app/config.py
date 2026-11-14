"""Application settings, loaded from environment variables (see .env.example)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core
    database_url: str = "postgresql+psycopg://hypertube:hypertube@db:5432/hypertube"
    secret_key: str
    public_url: str = "http://localhost:8080"  # URL users open in their browser
    internal_url: str = "http://127.0.0.1:8000"  # how ffmpeg reaches this backend
    session_days: int = 7
    api_token_minutes: int = 60

    # Storage
    data_dir: str = "/data"

    # Torrent engine
    torrent_listen_port: int = 6881
    stream_ready_bytes: int = 8 * 1024 * 1024  # buffer before playback starts
    unwatched_retention_days: int = 30

    # Mail
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = False  # STARTTLS
    smtp_ssl: bool = False  # implicit TLS (port 465)
    mail_from: str = "Hypertube <no-reply@hypertube.local>"

    # OAuth providers
    ft_client_id: str = ""
    ft_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    discord_client_id: str = ""
    discord_client_secret: str = ""
    gitlab_client_id: str = ""
    gitlab_client_secret: str = ""

    # External metadata / subtitles
    tmdb_api_key: str = ""  # v3 key or v4 read access token
    opensubtitles_api_key: str = ""
    opensubtitles_username: str = ""
    opensubtitles_password: str = ""
    peertube_instances: str = "video.blender.org"

    @property
    def secure_cookies(self) -> bool:
        return self.public_url.startswith("https://")


@lru_cache
def get_settings() -> Settings:
    return Settings()
