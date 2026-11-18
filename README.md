# Hypertube

A web application to search and stream films **while they download over BitTorrent**.
42 / 1337 project, subject v7.1, mandatory part.

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript (Vite), custom design system, served by nginx |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| BitTorrent | `libtorrent` (protocol only: peers, trackers, web seeds, piece hashing) |
| Video | FFmpeg / ffprobe (on-the-fly conversion of non-browser formats) |
| Infra | Docker Compose: `db`, `backend`, `frontend` (nginx), `mailpit` (dev mail catcher) |

---

## 1. Quick start

```bash
cp .env.example .env
# Fill at least: SECRET_KEY, POSTGRES_PASSWORD (and TMDB_API_KEY for ratings/cast, see §2)
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # -> SECRET_KEY

docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8080 | The application |
| http://localhost:8080/api/docs | Interactive OpenAPI documentation of the REST API |
| http://localhost:8025 | Mailpit inbox: password-reset emails land here |

Migrations run automatically when the backend starts (`alembic upgrade head`).
Downloads, subtitles and avatars are stored in the `appdata` Docker volume (`/data`).

`.env` is git-ignored. Never commit it.

**Quick public link (free, no account):** with the stack running, start a Cloudflare quick tunnel:
`cloudflared tunnel --url http://localhost:8080` (official binary from github.com/cloudflare/cloudflared).
It prints a random `https://….trycloudflare.com` address that works while the command runs. Password login, the library, streaming and the API work through it. OAuth logins and reset emails stay tied to `localhost`.

**Own domain through a Cloudflare named tunnel (current setup: https://hypertube.ynshost.com).**
The same local stack is published at a fixed HTTPS address, with no open ports. OAuth works on both addresses:

1. Domain on Cloudflare (free plan, nameservers switched at the registrar).
2. One-time setup with the official `cloudflared` binary:
   `cloudflared tunnel login`, then `cloudflared tunnel create hypertube`, then
   `cloudflared tunnel route dns hypertube hypertube.<domain>`. Put the output of
   `cloudflared tunnel token hypertube` in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. In `.env`: `EXTRA_PUBLIC_URLS=https://hypertube.<domain>`. Add `https://hypertube.<domain>/api/auth/oauth/<provider>/callback` to each OAuth app.
4. Start with `docker compose --profile tunnel up -d`. Plain `docker compose up -d` keeps it local-only.

The site is online while the Mac and Docker are running.

To host it publicly with HTTPS (free, Oracle Cloud), see **[DEPLOY.md](DEPLOY.md)**. It uses `docker-compose.prod.yml` (Caddy, no Mailpit), and the local setup above is unchanged.

## 2. Credentials and external services

| Variable(s) | Needed for | How to get it |
|---|---|---|
| `SECRET_KEY` | Session and API token signing | Any long random string |
| `POSTGRES_*` | Database | Choose them |
| `FT_CLIENT_ID`, `FT_CLIENT_SECRET` | "Continue with 42" | https://profile.intra.42.fr/oauth/applications/new. Redirect URI: `http://localhost:8080/api/auth/oauth/42/callback`, scope `public` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | "Continue with GitHub" | https://github.com/settings/developers → *New OAuth App*. Callback: `http://localhost:8080/api/auth/oauth/github/callback` |
| `TMDB_API_KEY` | TMDb rating, genres, posters, cast, director, producers, runtime, IMDb id | Free at https://www.themoviedb.org/settings/api (v3 key **or** v4 read token) |
| `OPENSUBTITLES_API_KEY` (+ optional username/password) | Subtitles in more languages | https://www.opensubtitles.com/consumers |
| `SMTP_*`, `MAIL_FROM` | Password-reset emails | Defaults use the bundled Mailpit. For real email use any SMTP provider (`SMTP_TLS=true` for port 587, `SMTP_SSL=true` for 465) |
| `PUBLIC_URL` | OAuth callbacks and reset links | Change it if you are not serving on `http://localhost:8080` |

Without `TMDB_API_KEY` the app still works fully, but ratings and cast stay empty.
OAuth buttons show a clear message when a provider is not configured.

## 3. Video sources (legal content only)

The search queries **two external sources**, both royalty-free or openly licensed:

1. **Internet Archive** (`archive.org`, the source named in the subject). This uses the `feature_films` collection, restricted to items that are either explicitly openly licensed (`licenseurl` is public-domain or Creative Commons) or dated 1977 or earlier (public-domain candidates). Titles that look like recent "rips" are excluded. Every item has a `.torrent` with HTTP web seeds.
2. **PeerTube**, the official Blender Foundation instance (`video.blender.org`): open movies such as *Sintel*, *Spring* or *Big Buck Bunny*, published under CC-BY by the rights holder. Each video has a `.torrent` file. Instances are configurable with `PEERTUBE_INSTANCES`.

legittorrents.info, also given as an example in the subject, shut down in 2023, so it cannot be used.

* **Front page (no search):** the most popular items by Internet Archive downloads and PeerTube views.
* **Search:** results are sorted by name by default.
* **Sort and filter:** name, year, rating, popularity, genre, year range and minimum rating. Results from both sources are merged, then filtered, sorted and paginated **server-side**, so ordering is global.

## 4. BitTorrent streaming architecture

```
 Browser <video>  ── Range GET ──►  /api/movies/:id/stream/video
                                         │
                       ┌─────────────────┴───────────────────┐
                 mp4 / webm                             mkv, avi, ogv…
           (browser-native)                       (not browser-native)
                       │                                     │
         read_range(): waits for each piece,      ffmpeg -ss T -i <loopback raw URL>
         sets deadlines on the next ~24 MB,       → H.264 (copied if already H.264)
         streams the bytes (HTTP 206)               + AAC, fragmented MP4 on stdout
                       │                                     │
                       └──────────────► libtorrent session ◄─┘
                                (sequential download + piece deadlines)
```

* **Starting** (`POST /api/movies/:id/stream`): the server fetches the `.torrent`. It picks the playable video file (MKV first, then the largest MP4/WebM, otherwise the smallest other video) plus any `.srt`/`.vtt` files. All other files get priority 0. Download runs **in the background** inside the asyncio event loop, so nothing blocks; requests return immediately.
* **Buffering:** the UI polls `GET /api/movies/:id/stream`, which reports progress, rate, peers and `buffer`. Playback starts when the first 8 MB (`STREAM_READY_BYTES`) and the file's last piece (where the MP4 `moov` / MKV cues usually live) are present.
* **Piece scheduling** is our own code (`backend/app/services/torrent/engine.py`):
  * sequential download, plus top priority and deadlines for the start-up pieces;
  * each HTTP range request maps bytes to pieces, awaits each piece (woken by `piece_finished_alert`), and gives deadlines to the following pieces. Seeking far ahead therefore makes libtorrent fetch the new position first.
* **Internet Archive web seeds:** the web seeds listed in Archive torrents answer with per-file redirects. libtorrent cannot use those for pieces that span two files. We add the item's storage node (from the metadata API) as a direct BEP-19 web seed, which fixes this.
* **Conversion:** FFmpeg reads from a loopback-only endpoint (`/api/internal/raw/:id`, random per-process key, 127.0.0.1 only) that serves the still-downloading file through the same piece-aware reader. Seeking restarts FFmpeg at `?start=<seconds>`. The player knows the real duration (from ffprobe), shows absolute time, and shifts subtitles accordingly.
* **Cache:** when the torrent finishes, the file stays on disk (`download_state=complete`) and later plays straight from disk. Downloads interrupted by a server restart resume automatically at startup.
* **Retention:** an hourly task (also run at startup) deletes files of movies whose `last_watched_at` is older than `UNWATCHED_RETENTION_DAYS` (30).
* **Subtitles:** sources are subtitle files inside the torrent (Internet Archive ships `.srt`), PeerTube captions, and OpenSubtitles when configured. English is always looked up. The user's preferred language is also fetched when it differs from the film's language, and is then preselected. Everything is converted to WebVTT and selectable in the player.

**Allowed libraries only:** no WebTorrent, Peerflix, Pulsar or any "torrent to stream" library is used. `libtorrent` provides the BitTorrent protocol only; file selection, readiness, piece-to-byte mapping, waiting, HTTP range serving and FFmpeg piping are implemented in this repository.

## 5. REST API (OAuth2)

Base URL: `http://localhost:8080/api`. Full interactive docs: `/api/docs`.

**Get a token.** Generate client credentials in *Settings → API access* (the secret is shown once and stored hashed), then:

```bash
curl -X POST http://localhost:8080/api/oauth/token \
  -d grant_type=client_credentials -d client_id=ht_xxx -d client_secret=yyy
# or the password grant:
curl -X POST http://localhost:8080/api/oauth/token -d grant_type=password -d username=alice -d password=...
# -> {"access_token":"…","token_type":"Bearer","expires_in":3600}
```

Send it as `Authorization: Bearer <token>`.

| Method & path | Auth | Result |
|---|---|---|
| `POST /oauth/token` | client + secret | `200` token, `400`/`401` OAuth2 errors |
| `GET /users` | ✔ | `[{id, username}]` |
| `GET /users/:id` | ✔ | username, names, profile picture URL; email **only for the owner** |
| `PATCH /users/:id` | ✔ owner | Fields: `username, email, password, profile_picture_url` (also `first_name, last_name, language`). Errors: `403` another user, `409` conflict, `422` invalid |
| `GET /movies` | public | front-page movies `[{id, name, …}]` |
| `GET /movies/:id` | ✔ | name, id, rating, year, length, available subtitles, comments count, cast, crew, summary… |
| `GET /comments` | ✔ | latest comments `{id, comment, username, date}` |
| `GET /comments/:id` | ✔ | one comment |
| `PATCH /comments/:id` | ✔ author | `{comment[, username]}`; `403` if not the author |
| `DELETE /comments/:id` | ✔ author | `204`; `403` if not the author |
| `POST /comments` | ✔ | `{comment, movie_id}` → `201` |
| `GET/POST /movies/:id/comments` | ✔ | list / create (`{comment}`) → `201` |

Any other route returns `404`; any other method on a known route returns `405`. Unauthenticated calls return `401`.

`./scripts/api_demo.sh <username> <password>` exercises every endpoint, including the 403/401/404/405 cases. Use it to show the API is RESTful.

The web UI also uses a few session endpoints (`/api/auth/*`, `/api/me`, `/api/library`, streaming). Expected user errors on these, like a wrong password or an invalid field, come back as `200 {"ok": false, …}`. This keeps the browser console free of failed-request lines, as the subject's eliminatory rules require. The public API above uses standard status codes.

## 5b. Bonus features (subject chapter IV)

Only the subject's own suggestions were implemented, all keeping the same constraints (server-side, background downloads).

| Subject idea | What was built | Where |
|---|---|---|
| More OmniAuth strategies | **Discord** and **GitLab** login next to 42 and GitHub (verified). Buttons appear once `DISCORD_*` / `GITLAB_*` are set in `.env`. Provider display names are sanitized, never rejected | `services/oauth_providers.py`, `pages/AuthPages.tsx` |
| Various video resolutions | Quality menu in the player: *Original* plus every standard height up to the source (1080/720/480/360p). FFmpeg re-encodes on the fly (`?quality=720`), and the playback position is kept when switching | `services/transcode.py`, `routers/stream.py`, `components/VideoPlayer.tsx` |
| Stream via the MediaSource API | Converted streams (MKV…, or a chosen resolution) are fed to `<video>` through **Media Source Extensions**: the fMP4 response is read chunk by chunk and appended to a `SourceBuffer`, with back-pressure (≤ 90 s ahead) and buffer eviction. Native MP4/WebM still use HTTP ranges. The `data-delivery` attribute on `<video>` shows which is used | `components/mediaSource.ts` |
| More API routes (add, delete movies…) | See below | `routers/movies.py`, `users.py`, `comments.py` |

**Extra REST routes** (all require a Bearer token; shown in `/api/docs` and `scripts/api_demo.sh`):

| Method & path | Result |
|---|---|
| `GET /movies/search?q=&page=` | Search both sources, sorted by name, paginated |
| `POST /movies` `{source: "archive"\|"peertube", source_id}` | Import a film from a source (same legality filters as search) → `201` + `Location`; `409` if it exists; `404` if unknown; `422` invalid |
| `DELETE /movies/:id` | `204`, only for the user who imported it; catalog films → `403` |
| `DELETE /users/:id` | Delete your own account (`204`); anyone else's → `403` |
| `GET /users/:id/comments` | A user's comments |
| `GET /comments?page=&limit=` | Pagination; total in the `X-Total-Count` header |

## 6. Security

* Passwords hashed with **Argon2id** (never stored in plain text). Strength rules are enforced on the server.
* SQLAlchemy ORM with bound parameters everywhere (no string-built SQL).
* React escapes all output. Source descriptions are stripped to plain text. nginx sends a strict CSP (`script-src 'self'`).
* Uploads are size-limited (5 MB), decoded with Pillow, restricted to real JPEG/PNG/WebP/GIF images, and re-encoded to WebP under a random name. Anything else is rejected. Profile picture URLs must be `https://`.
* Session in an `HttpOnly`, `SameSite=Lax` cookie. Cookie-authenticated mutations also require an `X-Requested-With` header (CSRF). API tokens are short-lived JWTs.
* Password reset: single-use random token, stored as a SHA-256 hash, valid 1 hour. The response is identical whether or not the email exists.
* OAuth flows use a `state` cookie (CSRF). The email address is never returned to anyone but its owner.
* Every form is validated in the browser **and** on the server. Secrets live only in `.env`.

## 7. Project layout

```
backend/
  app/main.py                 FastAPI app, routers, lifespan (torrent engine, cleanup loop)
  app/routers/                auth (UI session + OAuth), oauth_token, users, movies, comments, stream
  app/services/torrent/       engine.py: libtorrent session, file choice, piece scheduling, range reader
  app/services/streaming.py   start/resume downloads, status, subtitles, cache, 30-day cleanup
  app/services/transcode.py   ffprobe / ffmpeg on-the-fly conversion
  app/services/catalog.py     sources → DB → TMDb enrichment → filter/sort/paginate
  app/services/sources/       archive.py, peertube.py
  alembic/versions/           database migrations
frontend/src/
  pages/                      Library, MoviePage, Profile, Settings, AuthPages, NotFound
  components/                 Layout (header/footer), MovieCard, VideoPlayer, ui, icons
  i18n.tsx                    English / Français / Español
scripts/api_demo.sh           REST API walkthrough
```

## 8. Mandatory requirements checklist

Status: **Verified** = exercised end to end during development (API test scripts against PostgreSQL, real torrents, and Chrome).
**Implemented** = code complete but not exercised live, for the reason given.

| # | Requirement (subject v7.1) | Status |
|---|---|---|
| II | Header, main section, footer; usable on mobile | Verified (desktop and 390 px) |
| II | Form validation; no plain-text passwords; XSS, SQL-injection and upload protection | Verified (XSS payload rendered inert, invalid uploads rejected) |
| II | Credentials only in git-ignored `.env` | Verified |
| II | No torrent-streaming library | Verified (libtorrent used as protocol only) |
| II | Latest Firefox and Chrome | Chrome verified; Firefox not tested in this environment |
| III.1 | Register with email, username, last name, first name, protected password | Verified |
| III.1 | Login with username/password | Verified |
| III.1 | Password-reset email | Verified (email received over SMTP, token single-use) |
| III.1 | OmniAuth: 42 + GitHub | Verified (both providers; an existing account with the same verified email is linked, not duplicated) |
| III.1 | One-click logout from every page | Verified (header button) |
| III.1 | Preferred language, default English (EN/FR/ES UI) | Verified |
| III.1 | Edit email, picture, information | Verified |
| III.1 | View any user's profile; email kept private | Verified |
| III.2 | Library only for authenticated users; search field; thumbnails | Verified |
| III.2.1 | Search queries two legal external video sources | Verified (Internet Archive + PeerTube) |
| III.2.2 | Search results sorted by name; front page shows popular items | Verified |
| III.2.2 | Thumbnail: name, year, TMDb rating, cover | Verified (with `TMDB_API_KEY`) |
| III.2.2 | Watched / unwatched shown differently | Verified |
| III.2.2 | Async infinite scroll, no next-page link | Verified (24 → 144 items by scrolling) |
| III.2.2 | Sort and filter by name, genre, rating, year | Verified |
| III.3 | Details: summary, cast, director, producers, year, length, rating, cover | Verified (with `TMDB_API_KEY`) |
| III.3 | Comments: post and list | Verified |
| III.3 | Server-side torrent download, playback starts before download completes, non-blocking | Verified (playback at about 7% downloaded; seek to 60% served in ~12 s) |
| III.3 | Downloaded movie saved; erased after one month unwatched | Verified (cached playback; expiry test deleted files) |
| III.3 | English subtitles; preferred-language subtitles, selectable | Verified: English (from the torrent or OpenSubtitles) plus the user's language when it differs from the film's (e.g. French, preselected), selectable in the player. One track per language |
| III.3 | On-the-fly conversion, at least MKV | Verified in Docker with a real Internet Archive MKV (playback at 3% downloaded, seeking) |
| III.4 | OAuth2 REST API, every listed endpoint, 403 on others' profile/comments, proper codes | Verified (`scripts/api_demo.sh`) |
| V.1 | No errors/warnings in the browser console or server | Verified in Chrome for the flows above; server log clean |

## 9. Known limitations / remaining issues

* The 42 and GitHub OAuth apps are registered for `http://localhost:8080`. If you serve the app on another URL, update `PUBLIC_URL` and both apps' callback URLs.
* The first library load after a fresh start takes about 10 s while ~200 films are matched on TMDb. Results are stored, so later loads are fast.
* The quality of TMDb matching for Internet Archive titles depends on title and year. Unmatched items keep their source metadata, with no rating.
* Download speed depends on the source (Archive web seeds usually deliver 1–2 MB/s). Start-up typically takes 20–30 s.
* In conversion mode (MKV…), seeking restarts FFmpeg at the new position, which takes a few seconds.
