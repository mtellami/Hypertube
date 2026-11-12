import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDuration, type SubtitleInfo } from "../api";
import { useI18n } from "../i18n";
import {
  CaptionsIcon, CheckIcon, ExitFullscreenIcon, FullscreenIcon, MuteIcon, PauseIcon, PlayIcon, VolumeIcon,
} from "./icons";
import { Spinner } from "./ui";

interface Cue {
  start: number;
  end: number;
  text: string;
}

function parseTime(s: string): number {
  const parts = s.trim().split(":").map(Number);
  return parts.reduce((acc, v) => acc * 60 + v, 0);
}

/** Minimal WebVTT parser: cues are rendered by our own overlay so that they stay in sync
 *  even when a converted stream restarts at an offset after seeking. */
function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const start = parseTime(a);
    const end = parseTime(b.trim().split(/\s+/)[0]);
    const body = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (body && isFinite(start) && isFinite(end)) cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

interface Props {
  movieId: number;
  mode: "native" | "transcode";
  knownDuration: number | null;
  subtitles: SubtitleInfo[];
  defaultSubtitle: string | null;
  poster?: string | null;
}

export default function VideoPlayer({ movieId, mode, knownDuration, subtitles, defaultSubtitle, poster }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();
  const [offset, setOffset] = useState(0); // transcode mode: where the current ffmpeg stream starts
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [subMenu, setSubMenu] = useState(false);
  const [activeSub, setActiveSub] = useState<string | null>(defaultSubtitle);
  const [cues, setCues] = useState<Cue[]>([]);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const src = mode === "native"
    ? `/api/movies/${movieId}/stream/video`
    : `/api/movies/${movieId}/stream/video?start=${offset.toFixed(2)}`;
  const duration = mode === "native" ? mediaDuration : knownDuration ?? 0;
  const absTime = (mode === "transcode" ? offset : 0) + time;

  // Pick the default subtitle once it becomes available.
  useEffect(() => {
    if (activeSub === null && defaultSubtitle && subtitles.some((s) => s.lang === defaultSubtitle)) {
      setActiveSub(defaultSubtitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSubtitle, subtitles.length]);

  // Load the selected subtitle track.
  const activeUrl = useMemo(() => subtitles.find((s) => s.lang === activeSub)?.url ?? null, [subtitles, activeSub]);
  useEffect(() => {
    setCues([]);
    if (!activeUrl) return;
    const ctrl = new AbortController();
    fetch(activeUrl, { credentials: "same-origin", signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : ""))
      .then((txt) => setCues(parseVtt(txt)))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [activeUrl]);

  const currentCue = useMemo(() => cues.find((c) => c.start <= absTime && absTime < c.end) ?? null, [cues, absTime]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => setPlaying(false));
  }, []);

  // New source (first load or transcode seek): start playing.
  useEffect(() => {
    setError(false);
    setWaiting(true);
    setTime(0);
    play();
  }, [src, play]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) play();
    else v.pause();
  }, [play]);

  const seekTo = useCallback((target: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    target = Math.max(0, Math.min(duration - 1, target));
    if (mode === "native") {
      v.currentTime = target;
    } else {
      setOffset(target);
    }
  }, [duration, mode]);

  const nudgeControls = useCallback(() => {
    setShowControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
        setSubMenu(false);
      }
    }, 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void wrapRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const key = e.key.toLowerCase();
    if (key === " " || key === "k") { e.preventDefault(); togglePlay(); }
    else if (key === "arrowright") { e.preventDefault(); seekTo(absTime + 10); }
    else if (key === "arrowleft") { e.preventDefault(); seekTo(absTime - 10); }
    else if (key === "f") toggleFullscreen();
    else if (key === "m") toggleMute();
    nudgeControls();
  };

  const barRef = useRef<HTMLDivElement>(null);
  const ratioAt = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };
  const onBarPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    seekTo(ratioAt(e.clientX) * duration);
  };

  const progressPct = duration ? Math.min(100, (absTime / duration) * 100) : 0;
  const bufferedPct = duration ? Math.min(100, (((mode === "transcode" ? offset : 0) + buffered) / duration) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      className={`player ${showControls || !playing ? "controls-on" : ""} ${fullscreen ? "is-fullscreen" : ""}`}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={nudgeControls}
      onPointerLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        playsInline
        preload="auto"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => { setPlaying(true); nudgeControls(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => isFinite(e.currentTarget.duration) && setMediaDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onError={() => { setError(true); setWaiting(false); }}
      />

      {currentCue && (
        <div className="player-cue" aria-live="off">
          {currentCue.text.split("\n").map((line, i) => <span key={i}>{line}</span>)}
        </div>
      )}

      {waiting && !error && <div className="player-center"><Spinner size={44} /></div>}
      {error && <div className="player-center player-error">{t("player.media_error")}</div>}
      {!playing && !waiting && !error && (
        <button className="player-big-play" onClick={togglePlay} aria-label={t("player.play")}>
          <PlayIcon width={34} height={34} />
        </button>
      )}

      <div className="player-controls" onClick={(e) => e.stopPropagation()}>
        <div
          ref={barRef}
          className={`seekbar ${duration ? "" : "disabled"}`}
          role="slider"
          aria-label={t("player.seek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(absTime)}
          aria-valuetext={formatDuration(absTime)}
          tabIndex={-1}
          onPointerDown={onBarPointer}
          onPointerMove={(e) => duration && setHover(ratioAt(e.clientX))}
          onPointerLeave={() => setHover(null)}
        >
          <div className="seek-track">
            <div className="seek-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="seek-progress" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="seek-thumb" style={{ left: `${progressPct}%` }} />
          {hover !== null && duration > 0 && (
            <div className="seek-tooltip" style={{ left: `${hover * 100}%` }}>{formatDuration(hover * duration)}</div>
          )}
        </div>
        <div className="controls-row">
          <button className="icon-btn ghost" onClick={togglePlay} aria-label={playing ? t("player.pause") : t("player.play")}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div className="volume">
            <button className="icon-btn ghost" onClick={toggleMute} aria-label={muted ? t("player.unmute") : t("player.mute")}>
              {muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label={t("player.volume")}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = Number(e.target.value) === 0;
              }} />
          </div>
          <span className="time">
            {formatDuration(absTime)}{duration ? ` / ${formatDuration(duration)}` : ""}
          </span>
          <div className="spacer" />
          <div className="sub-wrap">
            <button className={`icon-btn ghost ${activeSub ? "active" : ""}`} aria-label={t("player.subtitles")}
              aria-haspopup="menu" aria-expanded={subMenu} onClick={() => setSubMenu((s) => !s)}>
              <CaptionsIcon />
            </button>
            {subMenu && (
              <div className="sub-menu" role="menu">
                <p>{t("player.subtitles")}</p>
                <button role="menuitemradio" aria-checked={activeSub === null}
                  onClick={() => { setActiveSub(null); setSubMenu(false); }}>
                  {activeSub === null && <CheckIcon width={16} height={16} />}{t("player.off")}
                </button>
                {subtitles.map((s) => (
                  <button key={s.id} role="menuitemradio" aria-checked={activeSub === s.lang}
                    onClick={() => { setActiveSub(s.lang); setSubMenu(false); }}>
                    {activeSub === s.lang && <CheckIcon width={16} height={16} />}{s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn ghost" onClick={toggleFullscreen}
            aria-label={fullscreen ? t("player.exit_fullscreen") : t("player.fullscreen")}>
            {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
