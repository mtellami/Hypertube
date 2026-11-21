# Hypertube

Hypertube is a self-hosted movie discovery and streaming application. It searches Internet Archive and configurable PeerTube instances, downloads videos over BitTorrent, and starts playback before downloads finish.

## Features

- Search a combined video library with sorting, genre, year, and rating filters and infinite scrolling.
- View movie details, posters, cast, and ratings, with optional TMDb enrichment.
- Stream partial downloads, seek through videos, and convert unsupported formats with FFmpeg.
- Select subtitles from downloaded files or the optional OpenSubtitles integration.
- Track watched movies and automatically clean up unwatched cached downloads after a configurable retention period.
- Register, sign in, reset passwords by email, manage profiles, and post comments.
- Sign in through 42, GitHub, Discord, or GitLab when configured.
- Use the interface in English, French, or Spanish.
- Access the REST API with bearer tokens and interactive OpenAPI documentation.

## Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, CSS |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Streaming | libtorrent, FFmpeg, ffprobe, Media Source Extensions |
| Infrastructure | Docker Compose, nginx |
| Development email | Mailpit |

## Run locally

```sh
git clone https://github.com/mtellami/Hypertube.git
cd Hypertube
cp .env.example .env
```

Set `SECRET_KEY` and `POSTGRES_PASSWORD` in `.env`. Generate a signing key with:

```sh
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start the application:

```sh
make dev
```

- Application: http://localhost:8080
- API documentation: http://localhost:8080/api/docs
- Development email inbox: http://localhost:8025

Database migrations run when the backend starts. Docker volumes persist database records, downloads, subtitles, and avatars.

## Configuration

See [.env.example](.env.example) for setup and optional integration settings. Optional integrations include `TMDB_API_KEY`, OpenSubtitles credentials, and OAuth provider credentials. Local password-reset emails use Mailpit; configure SMTP for delivery to real inboxes.

`PUBLIC_URL` sets the application address used by OAuth and password-reset links. Use `EXTRA_PUBLIC_URLS` for additional addresses and register the corresponding callback URLs with each OAuth provider. Advanced overrides can be added to `.env`: `PEERTUBE_INSTANCES` selects video sources (default `video.blender.org`), `STREAM_READY_BYTES` sets the playback buffer (default 8388608 bytes), and `UNWATCHED_RETENTION_DAYS` sets cache retention (default 30 days).

## Run in production

Set `PUBLIC_URL` to your public application address and configure a real SMTP server in `.env`. `HTTP_PORT` selects the exposed HTTP port (8080 in the example environment). For HTTPS, place the application behind your own TLS reverse proxy.

```sh
make prod
```

The production stack runs PostgreSQL, the backend, and nginx with persistent volumes. The local development stack additionally includes Mailpit.

The default `docker-compose.yml` runs production; `docker-compose-dev.yml` runs local development. Use `make down` / `make logs` for production and `make dev-down` / `make dev-logs` for development. Stopping a stack keeps its data. Run `make` to list commands.

## Development checks

Use Node.js 22 and the pnpm version pinned in `frontend/package.json`.

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm run build
```

With Python 3.12 and the backend requirements installed, run from `backend/`:

```sh
ruff check app alembic tests
python -m unittest discover -s tests -v
```

`requirements-dev.txt` adds Ruff for linting to the runtime dependencies; production installs only `requirements.txt`. Install the check tools with `python -m pip install -r requirements-dev.txt`. CI runs these checks, validates both Compose configurations, and checks database migrations against PostgreSQL.

## Project structure

```text
backend/app/        API routes, authentication, catalog, and streaming services
backend/alembic/    Database migrations
backend/tests/      Backend regression checks
frontend/src/       React pages, components, API client, and translations
```
