"""Server-side BitTorrent engine and torrent-backed file reader.

libtorrent is used only as the BitTorrent protocol implementation (peers, trackers,
web seeds, piece verification). Everything that turns a torrent into a playable
stream is implemented here:

  * choosing the video (and subtitle) files inside the torrent;
  * sequential download + piece deadlines around what the player asks for;
  * waiting for pieces before serving byte ranges (``read_range``);
  * reporting buffering readiness to the UI.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import libtorrent as lt

log = logging.getLogger("hypertube.torrent")

VIDEO_EXT = {
    "mp4",
    "m4v",
    "webm",
    "mkv",
    "avi",
    "mov",
    "ogv",
    "ogg",
    "mpg",
    "mpeg",
    "wmv",
    "flv",
    "ts",
    "m2ts",
    "3gp",
    "divx",
    "vob",
}
NATIVE_EXT = {
    "mp4",
    "m4v",
    "webm",
}  # streamed as-is; everything else goes through ffmpeg
SUB_EXT = {"srt", "vtt"}
MAX_VIDEO_SIZE = 8 * 1024**3
READ_CHUNK = 512 * 1024
LOOKAHEAD_BYTES = 24 * 1024 * 1024


def ext_of(path: str) -> str:
    return path.rsplit(".", 1)[-1].lower() if "." in path else ""


@dataclass
class Job:
    movie_id: int
    handle: lt.torrent_handle
    save_path: Path
    file_index: int
    rel_path: str  # video path relative to save_path
    file_offset: int  # offset of the video file inside the torrent
    file_size: int
    piece_length: int
    subtitle_files: list[tuple[int, str]] = field(default_factory=list)
    finished: bool = False
    error: str | None = None
    event: asyncio.Event = field(default_factory=asyncio.Event)
    last_deadline_piece: int = -1

    @property
    def abs_path(self) -> Path:
        return self.save_path / self.rel_path

    @property
    def ext(self) -> str:
        return ext_of(self.rel_path)

    def piece_of(self, file_pos: int) -> int:
        return (self.file_offset + file_pos) // self.piece_length

    def pulse(self) -> None:
        """Wake every coroutine waiting for new pieces."""
        ev, self.event = self.event, asyncio.Event()
        ev.set()

    def has_range(self, start: int, end: int) -> bool:
        return all(
            self.handle.have_piece(p)
            for p in range(self.piece_of(start), self.piece_of(end) + 1)
        )

    def prioritize(self, file_pos: int) -> None:
        """Ask libtorrent for the pieces right after the playback position first."""
        first = self.piece_of(file_pos)
        if first == self.last_deadline_piece:
            return
        self.last_deadline_piece = first
        last = min(
            self.piece_of(self.file_size - 1), self.piece_of(file_pos + LOOKAHEAD_BYTES)
        )
        deadline = 0
        for p in range(first, last + 1):
            if not self.handle.have_piece(p):
                self.handle.set_piece_deadline(p, deadline)
                deadline += 250

    async def wait_piece(self, piece: int) -> None:
        while not self.handle.have_piece(piece):
            if self.error:
                raise OSError(self.error)
            ev = self.event
            try:
                await asyncio.wait_for(ev.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                pass


def choose_files(info: lt.torrent_info) -> tuple[int | None, list[tuple[int, str]]]:
    """Pick the video file to stream and the subtitle files that come with it."""
    fs = info.layout()
    videos, subs = [], []
    for i in range(fs.num_files()):
        if fs.file_flags(i) & fs.flag_pad_file:
            continue
        path, size = fs.file_path(i), fs.file_size(i)
        ext = ext_of(path)
        low = path.lower()
        if (
            ext in VIDEO_EXT
            and 1024 * 1024 < size <= MAX_VIDEO_SIZE
            and "sample" not in os.path.basename(low)
        ):
            videos.append((i, ext, size))
        elif ext in SUB_EXT and size < 5 * 1024 * 1024:
            subs.append((i, path))
    if not videos:
        return None, []
    mkv = [v for v in videos if v[1] == "mkv"]
    native = [v for v in videos if v[1] in NATIVE_EXT]
    if mkv:  # usually the original upload; h264 MKV is only remuxed by ffmpeg
        chosen = max(mkv, key=lambda v: v[2])
    elif native:
        chosen = max(native, key=lambda v: v[2])
    else:
        chosen = min(videos, key=lambda v: v[2])
    return chosen[0], subs[:8]


class TorrentEngine:
    def __init__(self, downloads_dir: Path, listen_port: int):
        self.downloads_dir = downloads_dir
        downloads_dir.mkdir(parents=True, exist_ok=True)
        self.session = lt.session(
            {
                "listen_interfaces": f"0.0.0.0:{listen_port},[::]:{listen_port}",
                "alert_mask": lt.alert_category.status
                | lt.alert_category.error
                | lt.alert_category.piece_progress
                | lt.alert_category.storage,
                "user_agent": "Hypertube/1.0 libtorrent/2.1",
                "enable_dht": True,
                "enable_lsd": False,
                "enable_upnp": False,
                "enable_natpmp": False,
                "connections_limit": 300,
                "active_downloads": 8,
                "active_seeds": 4,
                "urlseed_max_request_bytes": 4 * 1024 * 1024,
            }
        )
        self.jobs: dict[int, Job] = {}
        self._by_hash: dict[str, Job] = {}
        self._starting: dict[int, asyncio.Task] = {}
        self.on_finished = None  # async callback(job)
        self.on_failed = None  # async callback(movie_id, message)
        self._alert_task: asyncio.Task | None = None

    # --- lifecycle --------------------------------------------------------
    def start(self) -> None:
        self._alert_task = asyncio.create_task(self._alert_loop())

    async def stop(self) -> None:
        if self._alert_task:
            self._alert_task.cancel()
        for job in list(self.jobs.values()):
            self.session.remove_torrent(job.handle)
        self.jobs.clear()

    def movie_dir(self, movie_id: int) -> Path:
        return self.downloads_dir / str(movie_id)

    # --- jobs -------------------------------------------------------------
    def add(
        self, movie_id: int, torrent_bytes: bytes, web_seeds: list[str] | None = None
    ) -> Job:
        if movie_id in self.jobs:
            return self.jobs[movie_id]
        info = lt.torrent_info(lt.bdecode(torrent_bytes))
        index, subs = choose_files(info)
        if index is None:
            raise ValueError("This torrent does not contain a playable video file.")
        fs = info.layout()
        save_path = self.movie_dir(movie_id)
        save_path.mkdir(parents=True, exist_ok=True)

        params = lt.add_torrent_params()
        params.ti = info
        params.save_path = str(save_path)
        priorities = [0] * fs.num_files()
        priorities[index] = 4
        for i, _ in subs:
            priorities[i] = 7  # tiny files: fetch them first
        params.file_priorities = priorities
        # Not auto-managed (so the queue never pauses it) and explicitly not paused.
        params.flags = (
            (params.flags | lt.torrent_flags.sequential_download)
            & ~lt.torrent_flags.auto_managed
            & ~lt.torrent_flags.paused
        )
        handle = self.session.add_torrent(params)
        for url in (
            web_seeds or []
        ):  # BEP 19 HTTP seeds that serve every file without redirects
            handle.add_url_seed(url)

        job = Job(
            movie_id=movie_id,
            handle=handle,
            save_path=save_path,
            file_index=index,
            rel_path=fs.file_path(index),
            file_offset=fs.file_offset(index),
            file_size=fs.file_size(index),
            piece_length=info.piece_length(),
            subtitle_files=subs,
        )
        # Subtitles are tiny: give their pieces a deadline too, otherwise the video's
        # time-critical pieces would starve them.
        for i, _ in subs:
            first_sub = fs.file_offset(i) // job.piece_length
            last_sub = (
                fs.file_offset(i) + max(fs.file_size(i), 1) - 1
            ) // job.piece_length
            for p in range(first_sub, last_sub + 1):
                handle.set_piece_deadline(p, 0)
        # Start of the file first; the end too because players read the index (moov / cues) there.
        job.prioritize(0)
        self.jobs[movie_id] = job
        self.ensure_startup_pieces(job, 0)
        self._by_hash[str(handle.info_hash())] = job
        log.info(
            "Movie %s: downloading %s (%d MB)",
            movie_id,
            job.rel_path,
            job.file_size // 2**20,
        )
        return job

    def remove(self, movie_id: int, delete_files: bool = False) -> None:
        job = self.jobs.pop(movie_id, None)
        if job:
            self._by_hash.pop(str(job.handle.info_hash()), None)
            try:
                self.session.remove_torrent(job.handle)
            except RuntimeError:
                pass
            job.error = "removed"
            job.pulse()
        if delete_files:
            shutil.rmtree(self.movie_dir(movie_id), ignore_errors=True)

    def status(self, movie_id: int) -> dict | None:
        job = self.jobs.get(movie_id)
        if not job:
            return None
        st = job.handle.status()
        done = job.handle.file_progress(flags=lt.torrent_handle.piece_granularity)[
            job.file_index
        ]
        return {
            "progress": (
                round(100.0 * done / job.file_size, 1) if job.file_size else 0.0
            ),
            "download_rate": int(st.download_payload_rate),
            "peers": int(st.num_peers),
            "seeds": int(st.num_seeds),
            "state": "complete" if job.finished else "downloading",
            "error": job.error,
        }

    def startup_pieces(self, job: Job, ready_bytes: int) -> list[int]:
        head = range(
            job.piece_of(0),
            job.piece_of(max(0, min(job.file_size, ready_bytes) - 1)) + 1,
        )
        last = job.piece_of(job.file_size - 1)
        tail = [p for p in (last - 1, last) if p >= job.piece_of(0)]
        return sorted(set(head) | set(tail))

    def ensure_startup_pieces(self, job: Job, ready_bytes: int) -> None:
        """Top priority + immediate deadline for the pieces needed before playback starts.
        Re-asserted on each status check: with sequential download, a single deadline can
        otherwise be overtaken and the file index at the end would arrive very late."""
        if job.finished:
            return
        pieces = self.startup_pieces(job, ready_bytes or 1)
        for i, p in enumerate(p for p in pieces if not job.handle.have_piece(p)):
            job.handle.piece_priority(p, 7)
            job.handle.set_piece_deadline(p, i * 100)

    def buffer_percent(self, job: Job, ready_bytes: int) -> float:
        """Share of the start-up buffer (head of the file + its last piece) already downloaded."""
        if job.finished:
            return 100.0
        pieces = self.startup_pieces(job, ready_bytes)
        have = sum(1 for p in pieces if job.handle.have_piece(p))
        return round(100.0 * have / len(pieces), 1)

    def ready(self, job: Job, ready_bytes: int) -> bool:
        """Enough contiguous data at the start (and the end, for the index) to play smoothly."""
        head_end = min(job.file_size, ready_bytes) - 1
        tail_start = max(0, job.file_size - 1)
        return job.finished or (
            job.has_range(0, head_end) and job.has_range(tail_start, job.file_size - 1)
        )

    # --- alerts -----------------------------------------------------------
    async def _alert_loop(self) -> None:
        while True:
            try:
                for alert in self.session.pop_alerts():
                    handle = getattr(alert, "handle", None)
                    job = (
                        self._by_hash.get(str(handle.info_hash()))
                        if handle is not None and handle.is_valid()
                        else None
                    )
                    if job is None:
                        continue
                    if isinstance(alert, lt.piece_finished_alert):
                        job.pulse()
                    elif isinstance(alert, lt.torrent_finished_alert):
                        if not job.finished:
                            job.finished = True
                            job.pulse()
                            if self.on_finished:
                                asyncio.create_task(self.on_finished(job))
                    elif isinstance(
                        alert, (lt.file_error_alert, lt.torrent_error_alert)
                    ):
                        job.error = alert.message()
                        log.error("Movie %s: %s", job.movie_id, job.error)
                        job.pulse()
                        if self.on_failed:
                            asyncio.create_task(self.on_failed(job.movie_id, job.error))
            except Exception:  # never let the alert pump die
                log.exception("Alert loop error")
            await asyncio.sleep(0.2)


# --- reading -----------------------------------------------------------------
def _pread(path: Path, offset: int, size: int) -> bytes:
    with open(path, "rb") as fh:
        fh.seek(offset)
        return fh.read(size)


async def read_range(path: Path, start: int, end: int, job: Job | None):
    """Yield bytes [start, end] of a (possibly still downloading) file.

    When a torrent job is given, every piece is awaited before it is read, and the
    pieces after the read position get deadlines so they arrive in playback order.
    """
    pos = start
    loop = asyncio.get_running_loop()
    while pos <= end:
        size = min(READ_CHUNK, end - pos + 1)
        if job is not None and not job.finished:
            piece = job.piece_of(pos)
            job.prioritize(pos)
            await job.wait_piece(piece)
            piece_end = (piece + 1) * job.piece_length - job.file_offset - 1
            size = min(size, piece_end - pos + 1)
        data = await loop.run_in_executor(None, _pread, path, pos, size)
        if not data:
            if job is None or job.finished:
                return
            await asyncio.sleep(0.2)  # piece reported but not flushed yet
            continue
        yield data
        pos += len(data)


def now() -> datetime:
    return datetime.now(timezone.utc)
