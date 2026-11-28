import PlayerMenu from "./PlayerMenu";
import { iconButtonStyles } from "./ui-styles";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { formatDuration, type SubtitleInfo } from "../api";
import { useI18n } from "../i18n";
import {
  LuCaptions,
  LuSettings,
  LuMinimize,
  LuMaximize,
  LuVolumeX,
  LuPause,
  LuPlay,
  LuVolume2,
} from "react-icons/lu";
import { attachMediaSource, mseSupported } from "./mediaSource";
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
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (body && isFinite(start) && isFinite(end))
      cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** True when the user has interacted with the page (needed for autoplay with sound). */
export function hasUserActivation(): boolean {
  const ua = (
    navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
  ).userActivation;
  return ua ? ua.hasBeenActive : false;
}

interface Props {
  movieId: number;
  mode: "native" | "transcode";
  knownDuration: number | null;
  subtitles: SubtitleInfo[];
  defaultSubtitle: string | null;
  poster?: string | null;
  sourceHeight: number | null;
  qualities: number[];
  mseType: string | null; // MediaSource type of the converted stream at original quality
  mseTypeConverted: string | null; // ... when re-encoded at a chosen resolution
}

export default function VideoPlayer({
  movieId,
  mode,
  knownDuration,
  subtitles,
  defaultSubtitle,
  poster,
  sourceHeight,
  qualities,
  mseType,
  mseTypeConverted,
}: Props) {
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
  const [qualityMenu, setQualityMenu] = useState(false);
  const [quality, setQuality] = useState<number | null>(null); // null = original
  const [viaMse, setViaMse] = useState(false);
  const menuOpen = useRef(false);
  useEffect(() => {
    menuOpen.current = subMenu || qualityMenu;
  }, [subMenu, qualityMenu]);
  const pendingSeek = useRef<number | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(defaultSubtitle);
  const [cues, setCues] = useState<Cue[]>([]);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // Converted = produced by ffmpeg (non-browser format, or a resolution was chosen).
  const converted = mode === "transcode" || quality !== null;
  const src = !converted
    ? `/api/movies/${movieId}/stream/video`
    : `/api/movies/${movieId}/stream/video?start=${offset.toFixed(2)}${quality ? `&quality=${quality}` : ""}`;
  const duration = !converted ? mediaDuration : (knownDuration ?? 0);
  const absTime = (converted ? offset : 0) + time;

  // Pick the default subtitle once it becomes available.
  useEffect(() => {
    if (
      activeSub === null &&
      defaultSubtitle &&
      subtitles.some((s) => s.lang === defaultSubtitle)
    ) {
      setActiveSub(defaultSubtitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSubtitle, subtitles.length]);

  // Load the selected subtitle track.
  const activeUrl = useMemo(
    () => subtitles.find((s) => s.lang === activeSub)?.url ?? null,
    [subtitles, activeSub],
  );
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

  const currentCue = useMemo(
    () => cues.find((c) => c.start <= absTime && absTime < c.end) ?? null,
    [cues, absTime],
  );

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => setPlaying(false));
  }, []);

  // New source (first load, seek in a converted stream, resolution change).
  // Converted streams are fed through the MediaSource API; native files use HTTP ranges.
  // Playback only starts by itself after a user gesture (autoplay policy).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setError(false);
    setTime(0);
    const mime = quality === null ? mseType : mseTypeConverted;
    let detach = () => {};
    if (converted && mseSupported(mime)) {
      setViaMse(true);
      detach = attachMediaSource(v, src, mime, () => setError(true));
    } else {
      setViaMse(false);
      v.src = src;
    }
    if (hasUserActivation()) {
      setWaiting(true);
      play();
    } else {
      setWaiting(false);
    }
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, play]);

  const chooseQuality = (q: number | null) => {
    setQualityMenu(false);
    if (q === quality) return;
    const at = absTime;
    if (q === null && mode === "native") {
      pendingSeek.current = at; // back to the original file: resume at the same position
    } else {
      setOffset(Math.max(0, at));
    }
    setQuality(q);
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) play();
    else v.pause();
  }, [play]);

  const seekTo = useCallback(
    (target: number) => {
      const v = videoRef.current;
      if (!v || !duration) return;
      target = Math.max(0, Math.min(duration - 1, target));
      if (!converted) {
        v.currentTime = target;
      } else {
        setOffset(target);
      }
    },
    [duration, converted],
  );

  const nudgeControls = useCallback(() => {
    setShowControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !menuOpen.current) {
        setShowControls(false);
        setSubMenu(false);
        setQualityMenu(false);
      }
    }, 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const onFs = () =>
      setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    else void wrapRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      e.defaultPrevented ||
      (e.target as HTMLElement).closest("input, button, [role=menu]")
    )
      return;
    const key = e.key.toLowerCase();
    if (key === " " || key === "k") {
      e.preventDefault();
      togglePlay();
    } else if (key === "arrowright") {
      e.preventDefault();
      seekTo(absTime + 10);
    } else if (key === "arrowleft") {
      e.preventDefault();
      seekTo(absTime - 10);
    } else if (key === "f") toggleFullscreen();
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
  const bufferedPct = duration
    ? Math.min(
        100,
        (((mode === "transcode" ? offset : 0) + buffered) / duration) * 100,
      )
    : 0;

  return (
    <div
      ref={wrapRef}
      className={`player shadow-[var(--shadow)] [&.is-fullscreen]:rounded-[0] [&.is-fullscreen]:max-h-[none] [&.is-fullscreen]:aspect-auto [&.is-fullscreen]:h-full [&_video]:w-full [&_video]:h-full [&_video]:object-contain [&_video]:block [&_video]:bg-black [&:not(.controls-on)]:[cursor:none] [&:not(.controls-on)_.player-cue]:bottom-[6%] [&.controls-on_.player-controls]:opacity-100 [&.controls-on_.player-controls]:[transform:none] mobile:rounded-card relative w-full aspect-video max-h-[78vh] bg-black rounded-panel overflow-hidden outline-none select-none ${showControls || !playing || subMenu || qualityMenu ? "controls-on" : ""} ${fullscreen ? "is-fullscreen" : ""}`}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={nudgeControls}
      onPointerLeave={() =>
        playing && !subMenu && !qualityMenu && setShowControls(false)
      }
    >
      <video
        ref={videoRef}
        data-delivery={
          converted ? (viaMse ? "mediasource" : "progressive") : "ranges"
        }
        poster={poster ?? undefined}
        playsInline
        preload="auto"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          nudgeControls();
        }}
        onPause={() => {
          setPlaying(false);
          setShowControls(true);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) =>
          isFinite(e.currentTarget.duration) &&
          setMediaDuration(e.currentTarget.duration)
        }
        onLoadedMetadata={(e) => {
          if (pendingSeek.current !== null) {
            e.currentTarget.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
        }}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onError={() => {
          setError(true);
          setWaiting(false);
        }}
      />

      {currentCue && (
        <div
          className={`
            player-cue [translate:-50%_0] [transition:bottom_0.25s_var(--ease)]
            [&_span]:[background:rgba(0,_0,_0,_0.72)] [&_span]:pt-0.5 [&_span]:pb-0.5 [&_span]:pl-2.5
            [&_span]:pr-2.5 [&_span]:rounded-[4px] [&_span]:text-[clamp(0.95rem,_2.2vw,_1.5rem)]
            [&_span]:font-medium [&_span]:text-center [&_span]:leading-[1.35]
            [&_span]:[text-shadow:0_1px_2px_#000] absolute left-[50%] bottom-[13%] w-max max-w-[86%] grid
            justify-items-center gap-0.5 pointer-events-none
          `}
          aria-live="off"
        >
          {currentCue.text.split("\n").map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}

      {waiting && !error && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <Spinner size={44} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none player-error [background:rgba(0,_0,_0,_0.5)] text-[#ffb4c2] font-semibold">
          {t("player.media_error")}
        </div>
      )}
      {!playing && !waiting && !error && (
        <button
          className={`
            player-big-play [translate:-50%_-50%] bg-(image:--accent-grad) shadow-[var(--shadow-glow)]
            [transition:transform_0.2s_var(--ease)] hover:[transform:scale(1.08)] absolute left-[50%] top-[50%]
            w-21 h-21 rounded-full border-0 grid place-items-center text-white pl-1
          `}
          onClick={togglePlay}
          aria-label={t("player.play")}
        >
          <LuPlay size={34} fill="currentColor" stroke="none" />
        </button>
      )}

      <div
        className={`
          player-controls [padding:40px_18px_12px] bg-player-fade [transform:translateY(8px)]
          [transition:opacity_0.25s,_transform_0.25s_var(--ease)] mobile:[padding:30px_8px_6px]
          touch:opacity-100 touch:[transform:none] absolute inset-[auto_0_0_0] opacity-0
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={barRef}
          className={`seekbar [&.disabled]:[cursor:default] [&.disabled]:opacity-50 [&:hover_.seek-track]:h-1.5 [&:hover_.seek-thumb]:[transform:scale(1)] relative h-4.5 flex items-center cursor-pointer mb-1 touch-none ${duration ? "" : "disabled"}`}
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
          <div className="seek-track [transition:height_0.15s] relative w-full h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="absolute inset-[0_auto_0_0] bg-white/35"
              style={{ width: `${bufferedPct}%` }}
            />
            <div
              className="seek-progress bg-(image:--accent-grad) absolute inset-[0_auto_0_0]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div
            className={`
              seek-thumb [translate:-50%_0] shadow-[0_0_0_4px_rgba(var(--accent-rgb),_0.35)] [transform:scale(0)]
              [transition:transform_0.15s] absolute w-3.5 h-3.5 rounded-full bg-white
            `}
            style={{ left: `${progressPct}%` }}
          />
          {hover !== null && duration > 0 && (
            <div
              className="seek-tooltip [translate:-50%_0] [background:rgba(0,_0,_0,_0.85)] absolute bottom-5.5 rounded-[6px] text-[0.75rem] tabular-nums pointer-events-none py-[3px] px-2"
              style={{ left: `${hover * 100}%` }}
            >
              {formatDuration(hover * duration)}
            </div>
          )}
        </div>
        <div className="controls-row [&_.icon-btn]:text-white [&_.spacer]:flex-1 flex items-center gap-1.5 text-white">
          <button
            className={iconButtonStyles({ ghost: true })}
            onClick={togglePlay}
            aria-label={playing ? t("player.pause") : t("player.play")}
          >
            {playing ? (
              <LuPause fill="currentColor" stroke="none" />
            ) : (
              <LuPlay fill="currentColor" stroke="none" />
            )}
          </button>
          <div
            className={`
            volume [&_input]:w-0 [&_input]:opacity-0 [&_input]:[transition:width_0.25s_var(--ease),_opacity_0.2s]
            [&_input]:[accent-color:var(--accent)] [&:hover_input]:w-22.5 [&:hover_input]:opacity-100
            [&:focus-within_input]:w-22.5 [&:focus-within_input]:opacity-100 mobile:[&_input]:hidden flex
            items-center
          `}
          >
            <button
              className={iconButtonStyles({ ghost: true })}
              onClick={toggleMute}
              aria-label={muted ? t("player.unmute") : t("player.mute")}
            >
              {muted || volume === 0 ? <LuVolumeX /> : <LuVolume2 />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label={t("player.volume")}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = Number(e.target.value) === 0;
              }}
            />
          </div>
          <span className="time phone:hidden text-[0.84rem] tabular-nums text-white/85 ml-1.5 whitespace-nowrap">
            {formatDuration(absTime)}
            {duration ? ` / ${formatDuration(duration)}` : ""}
          </span>
          <div className="spacer" />
          {qualities.length > 0 && (
            <PlayerMenu
              label={t("player.quality")}
              value={quality === null ? "original" : String(quality)}
              options={[
                {
                  value: "original",
                  label:
                    t("player.original") +
                    (sourceHeight ? ` (${sourceHeight}p)` : ""),
                },
                ...qualities.map((q) => ({ value: String(q), label: `${q}p` })),
              ]}
              onValueChange={(value) =>
                chooseQuality(value === "original" ? null : Number(value))
              }
              open={qualityMenu}
              onOpenChange={(open) => {
                setQualityMenu(open);
                if (open) {
                  setSubMenu(false);
                  setShowControls(true);
                  window.clearTimeout(hideTimer.current);
                } else nudgeControls();
              }}
              container={wrapRef.current}
            >
              <button
                className={`${iconButtonStyles({ ghost: true, quality: true })} quality-btn ${quality ? "active" : ""}`}
                aria-label={t("player.quality")}
              >
                <LuSettings />
                <span
                  className={`text-[0.68rem] font-extrabold tracking-[0.04em] rounded py-px px-[5px] ${quality ? "bg-(image:--accent-grad) text-white" : "bg-white/16"}`}
                >
                  {quality
                    ? `${quality}p`
                    : sourceHeight && sourceHeight >= 720
                      ? "HD"
                      : "SD"}
                </span>
              </button>
            </PlayerMenu>
          )}
          <PlayerMenu
            label={t("player.subtitles")}
            value={activeSub ?? "off"}
            options={[
              { value: "off", label: t("player.off") },
              ...subtitles.map((subtitle) => ({
                value: subtitle.lang,
                label: subtitle.label,
              })),
            ]}
            onValueChange={(value) => {
              setActiveSub(value === "off" ? null : value);
              setSubMenu(false);
            }}
            open={subMenu}
            onOpenChange={(open) => {
              setSubMenu(open);
              if (open) {
                setQualityMenu(false);
                setShowControls(true);
                window.clearTimeout(hideTimer.current);
              } else nudgeControls();
            }}
            container={wrapRef.current}
          >
            <button
              className={`${iconButtonStyles({ ghost: true })} ${activeSub ? "active" : ""}`}
              aria-label={t("player.subtitles")}
            >
              <LuCaptions />
            </button>
          </PlayerMenu>
          <button
            className={iconButtonStyles({ ghost: true })}
            onClick={toggleFullscreen}
            aria-label={
              fullscreen ? t("player.exit_fullscreen") : t("player.fullscreen")
            }
          >
            {fullscreen ? <LuMinimize /> : <LuMaximize />}
          </button>
        </div>
      </div>
    </div>
  );
}
