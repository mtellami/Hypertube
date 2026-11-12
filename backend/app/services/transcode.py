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
        "has_audio": audio is not None,
    }
    if video:
        _probe_cache[source] = info
    return info


def command(source: str, start: float, info: dict) -> list[str]:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin"]
    if start > 0:
        cmd += ["-ss", f"{start:.2f}"]
    cmd += ["-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"]
    copy_video = info.get("video_codec") == "h264" and info.get("pix_fmt") in ("yuv420p", "yuvj420p", None)
    if copy_video:
        cmd += ["-c:v", "copy"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "23",
                "-pix_fmt", "yuv420p", "-vf", "scale=-2:'min(720,ih)'", "-g", "48"]
    cmd += ["-c:a", "aac", "-b:a", "160k", "-ac", "2",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"]
    return cmd


async def stream(source: str, start: float, info: dict):
    proc = await asyncio.create_subprocess_exec(
        *command(source, start, info), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
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
