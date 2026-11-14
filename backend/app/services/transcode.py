"""On-the-fly conversion with FFmpeg for formats browsers cannot play (mkv, avi, ...).

Output is fragmented MP4 (H.264 + AAC) written to stdout and streamed to the browser
while it is produced. H.264 video is copied (remux only); anything else is re-encoded.
Seeking is done by restarting ffmpeg at the requested timestamp (``start``)."""
import asyncio
import json
import logging

log = logging.getLogger("hypertube.ffmpeg")
_probe_cache: dict[str, dict] = {}


async def probe(source: str) -> dict:
    if source in _probe_cache:
        return _probe_cache[source]
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", source,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {}
    try:
        data = json.loads(out or b"{}")
    except ValueError:
        return {}
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    try:
        duration = float((data.get("format") or {}).get("duration") or 0)
    except ValueError:
        duration = 0.0
    info = {
        "duration": duration,
        "video_codec": video.get("codec_name"),
        "pix_fmt": video.get("pix_fmt"),
        "height": video.get("height"),
        "profile": video.get("profile"),
        "level": video.get("level"),
        "has_audio": audio is not None,
    }
    if video:
        _probe_cache[source] = info
    return info


QUALITIES = (1080, 720, 480, 360)
MAX_RATE = {1080: "5000k", 720: "2800k", 480: "1400k", 360: "800k"}
PROFILE_HEX = {"baseline": "42", "constrained baseline": "42", "main": "4d", "high": "64"}


def available_qualities(info: dict) -> list[int]:
    """Resolutions offered in the player: every standard height at or below the source."""
    height = info.get("height") or 0
    return [q for q in QUALITIES if q <= height] or ([360] if height else [])


def copies_video(info: dict, height: int | None) -> bool:
    return height is None and info.get("video_codec") == "h264" and info.get("pix_fmt") in ("yuv420p", "yuvj420p", None)


def mse_codecs(info: dict, height: int | None) -> str:
    """RFC 6381 codec string of what ffmpeg will output, for MediaSource.isTypeSupported/addSourceBuffer."""
    if copies_video(info, height):
        prof = PROFILE_HEX.get(str(info.get("profile") or "").lower(), "64")
        level = int(info.get("level") or 40)
        video = f"avc1.{prof}00{level:02x}"
    else:
        video = "avc1.640028"  # we encode High profile, level 4.0
    return f'video/mp4; codecs="{video}, mp4a.40.2"' if info.get("has_audio", True) else f'video/mp4; codecs="{video}"'


def command(source: str, start: float, info: dict, height: int | None = None) -> list[str]:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin"]
    if start > 0:
        cmd += ["-ss", f"{start:.2f}"]
    cmd += ["-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"]
    if copies_video(info, height):
        cmd += ["-c:v", "copy"]
    else:
        target = height or min(720, info.get("height") or 720)
        rate = MAX_RATE.get(target, "2800k")
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "23",
                "-maxrate", rate, "-bufsize", rate, "-profile:v", "high", "-level", "4.0",
                "-pix_fmt", "yuv420p", "-vf", f"scale=-2:'min({target},ih)'", "-g", "48"]
    cmd += ["-c:a", "aac", "-b:a", "160k", "-ac", "2",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"]
    return cmd


async def stream(source: str, start: float, info: dict, height: int | None = None):
    proc = await asyncio.create_subprocess_exec(
        *command(source, start, info, height), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        while True:
            chunk = await proc.stdout.read(256 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        if proc.returncode is None:
            proc.kill()
        err = (await proc.stderr.read()).decode(errors="replace").strip() if proc.stderr else ""
        await proc.wait()
        if err and proc.returncode not in (0, -9):
            log.warning("ffmpeg exited with %s: %s", proc.returncode, err[-500:])
