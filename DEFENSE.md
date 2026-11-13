# Hypertube — defense cheat sheet

Everything you need during the peer evaluation: what to set up, what to demo and in which order, and short answers to the questions evaluators usually ask.

---

## 0. Before the evaluator arrives (10 min)

```bash
docker compose down            # keep the volumes (cached films, users)
docker compose up --build -d
docker compose ps              # 4 services "Up": db, backend, frontend, mailpit
docker compose logs -f backend # keep this open in a second terminal
```

* `.env` contains `SECRET_KEY`, `POSTGRES_PASSWORD`, `TMDB_API_KEY`, and the 42 and GitHub OAuth credentials. **Never show this file on screen.** Show `.env.example` instead.
* Open http://localhost:8080 in **Chrome and Firefox**, with DevTools on the *Console* tab.
* Open http://localhost:8025 (Mailpit) in a tab.
* Pre-warm the cache: open the library once (the first load matches ~200 films on TMDb, about 10 s), and start one film so it is downloaded and cached.
* Prepare two browser profiles, or one normal and one private window, for two different users (comments and permissions).

## 1. Demo order (≈ 20 min)

| # | Show | Where | What to point out |
|---|---|---|---|
| 1 | Git & secrets | terminal | `git status` is clean; `.gitignore` excludes `.env`; `git log` contains no `.env` |
| 2 | Layout | any page | Header, main and footer; resize to phone width with no horizontal scroll |
| 3 | Register | /register | Submit empty → every field gets a validation error (client side). Server-side rules too: weak password, duplicate username or email |
| 4 | Password storage | terminal | `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select username, password_hash from users limit 3;"'` → Argon2id hashes |
| 5 | Login / logout | header | Logout is the icon button in the header, one click, on every page |
| 6 | Forgot password | /forgot-password → Mailpit | The email arrives, the link works once, then shows "expired" |
| 7 | OAuth | /login | "Continue with 42" and "Continue with GitHub". The same verified email links to the same account (Settings shows "Linked accounts") |
| 8 | Profile | Settings | Change picture (try uploading a renamed `.txt` → rejected), names, email, language → the UI switches to FR/ES |
| 9 | Other users | click a commenter | Public profile: picture and info, **no email** |
| 10 | Library | / | Popular films from **two sources**; thumbnails show name, year, TMDb rating, cover; "Watched" badge and dimmed poster |
| 11 | Infinite scroll | scroll down | Pages load automatically; there is no "next" link |
| 12 | Search + sort/filter | header search | Results sorted by name; filters for genre, rating, year range; sort by name, year, rating, popularity |
| 13 | Movie page | click a film | Summary, director, producers, cast, year, length, rating, cover, subtitles, comments |
| 14 | **Streaming** | "Play" on a film never downloaded | Buffer meter with peers and speed → playback starts at a few % downloaded. Seek far ahead → it resumes after a few seconds. The "Downloading on server · x %" badge keeps rising |
| 15 | **MKV conversion** | search "gulliver" → *Gulliver's Travels [720p]* | "Converted on the fly from MKV" badge; seeking works |
| 16 | Subtitles | CC button in the player | English subtitles from the torrent (e.g. *Charlie Chaplin Festival*). With the UI in French, French subtitles are preselected when available |
| 17 | Cache | play a downloaded film | Starts instantly; "Saved on server" badge |
| 18 | Comments | movie page | Post (try `<script>alert(1)</script>` → shown as text), edit, delete your own; another user cannot |
| 19 | REST API | terminal | `./scripts/api_demo.sh <user> <password>` (see §2) |
| 20 | Console | DevTools | No errors or warnings during the whole demo |

## 2. Proving the API is RESTful

```bash
./scripts/api_demo.sh evaltest testpass42                       # password grant
CLIENT_ID=ht_xxx CLIENT_SECRET=yyy ./scripts/api_demo.sh        # client_credentials (Settings → API access)
```

Also show http://localhost:8080/api/docs (OpenAPI).

**Arguments for "truly RESTful":**
* **Resources are nouns** (`/users`, `/movies`, `/comments`, `/movies/:id/comments`), and **HTTP verbs carry the action**: `GET` reads, `POST` creates (`201`), `PATCH` partially updates, `DELETE` removes (`204`).
* **Stateless:** every call carries its own `Authorization: Bearer` token (OAuth2 JWT). There is no server-side session for the API.
* **Correct status codes:**
  * `401` no or invalid token
  * `403` someone else's profile or comment
  * `404` unknown resource or route
  * `405` wrong method on a known route (e.g. `DELETE /movies/1`)
  * `409` username or email already taken
  * `422` invalid data
* **JSON representations**, with the email only shown to its owner. Uniform interface, cacheable `GET`s.

## 3. Likely questions — short answers

**"Isn't libtorrent a forbidden library?"**
No. The subject forbids libraries that *create a video stream from a torrent* (webtorrent, peerflix, pulsar). libtorrent only speaks the BitTorrent protocol: peers, trackers, web seeds, piece hashing. Everything that turns a torrent into a stream is ours, in `backend/app/services/torrent/engine.py`:
* `choose_files` (line 98) picks the video and subtitle files;
* `Job.prioritize` (74) and `ensure_startup_pieces` (245) set piece priorities and deadlines;
* `Job.wait_piece` (87) waits for a piece, woken by `piece_finished_alert` in `_alert_loop` (271);
* `read_range` (305) serves byte ranges while the file is still downloading;
* `routers/stream.py`: HTTP Range parsing (`_parse_range` 52, `_ranged` 68) and the FFmpeg pipe (`stream_video` 93).

**"How can it play before the download is finished?"**
1. The download is sequential, with deadlines on the first ~8 MB and the last piece (where the MP4 `moov` index usually lives).
2. When the browser requests `Range: bytes=X-`, we map X to a piece, wait until libtorrent has it, send it, and give deadlines to the next ~24 MB.
3. A seek is just a new range request, so libtorrent fetches the pieces at the new position first.

**"Where is the background / non-blocking part?"**
libtorrent runs its own network threads, and our code is asyncio. `POST /movies/:id/stream` starts the torrent as a background task (`streaming._start`, line 133) and returns immediately. The UI polls the status. The download continues even if the user leaves the page.

**"What about MKV?"**
`transcode.command` (line 49) builds the FFmpeg command:
* H.264 video is copied (remux); anything else is re-encoded to H.264.
* Audio is converted to AAC.
* The output is fragmented MP4 streamed from stdout.
* While downloading, FFmpeg reads from a loopback-only endpoint (`internal_raw`, line 112) that uses the same piece-aware reader.
* Seeking restarts FFmpeg with `-ss`, and the player shifts the time display and subtitles.

**"Cached and erased after a month?"**
When the torrent finishes, `download_state=complete` and later plays are served from disk. `cleanup_once` (`streaming.py`, line 299) runs at startup and every hour, and deletes files whose `last_watched_at` is more than 30 days old. To demo it, run this, restart the backend, and the files are gone:
`docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "update movies set last_watched_at=now()-interval '"'"'40 days'"'"' where id=<id>;"'`

**"Are the sources legal?"**
* Internet Archive is named in the subject. We restrict to items that are openly licensed or dated 1977 or earlier, and exclude "rip" titles.
* The Blender Foundation's PeerTube publishes its own CC-BY open movies.
* Legit Torrents (the other example in the subject) shut down in 2023.

**"Why do login and register return 200 on a wrong password?"**
Those are the web UI's session endpoints. Chrome logs every 4xx response as a red line in the console, and the subject eliminates any console error, so expected form errors return `200 {"ok": false, …}`. The public REST API (`/users`, `/movies`, `/comments`, `/oauth/token`) uses proper status codes.

**Security checklist (eliminatory):**
* **Passwords:** Argon2id (`security.py`, line 23).
* **SQL injection:** SQLAlchemy ORM with bound parameters only; try `' OR 1=1 --` in login or search.
* **XSS:** React escapes all text, descriptions are stripped to plain text, and nginx sends a CSP with `script-src 'self'`.
* **Uploads:** max 5 MB, decoded with Pillow, real images only, re-encoded to WebP under a random name (`users.save_avatar`, line 143).
* **CSRF:** cookie-based mutations require an `X-Requested-With` header; OAuth logins use a `state` cookie.
* **Password reset tokens:** single use, valid 1 h, stored hashed.
* **Permissions:** `PATCH /users/:id` returns `403` for someone else (`routers/users.py`, line 38); comment edit and delete are author only (`routers/comments.py`, lines 72 and 90).
* **Secrets:** only in `.env`, which is git-ignored.

**"Why is the first library load slow?"**
About 200 films are matched on TMDb once; the results are stored in PostgreSQL. Later loads come from the database plus a 1-hour in-memory cache.

## 4. If something goes wrong live

| Symptom | Fix |
|---|---|
| A film stays at "Contacting peers…" | That item's source is slow or down; pick another film. Archive films usually start in 20–30 s |
| Library is empty or shows "sources not responding" | Check internet access; `docker compose logs backend` |
| OAuth error after login | `PUBLIC_URL` must be `http://localhost:8080`, matching the callback URL in the 42 and GitHub apps |
| Reset email missing | Look in Mailpit (http://localhost:8025) |
| Need a clean slate | `docker compose down -v` (deletes users and downloads) then `docker compose up --build` |
