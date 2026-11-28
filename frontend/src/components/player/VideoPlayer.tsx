import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { LuPlay } from "react-icons/lu";
import type { SubtitleInfo } from "../../api/client";
import { useI18n } from "../../common/i18n";
import { Spinner } from "../ui";
import PlayerControls, { type PlayerMenuName } from "./PlayerControls";
import { useCaptions } from "./useCaptions";
import { usePlayback } from "./usePlayback";

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

export default function VideoPlayer(props: Props) {
  const { t } = useI18n();
  const playback = usePlayback(props);
  const { videoRef, time, playing, waiting, error, togglePlay, seekTo } =
    playback;
  const captions = useCaptions(
    props.subtitles,
    props.defaultSubtitle,
    playback.streamOffset,
    playback.mediaTime,
  );
  const currentCue = captions.cue;
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [menu, setMenu] = useState<PlayerMenuName | null>(null);

  const nudgeControls = useCallback(() => {
    setShowControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2800);
  }, [videoRef]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    else void wrapRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const onMenuChange = (name: PlayerMenuName, open: boolean) => {
    if (open) {
      setMenu(name);
      setShowControls(true);
      window.clearTimeout(hideTimer.current);
    } else {
      setMenu((current) => (current === name ? null : current));
      nudgeControls();
    }
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      (event.target as HTMLElement).closest(
        "input, button, [role=slider], [role=menu]",
      )
    )
      return;

    const key = event.key.toLowerCase();
    if (key === " " || key === "k") {
      event.preventDefault();
      togglePlay();
    } else if (key === "arrowright" || key === "arrowleft") {
      event.preventDefault();
      seekTo(time + (key === "arrowright" ? 10 : -10));
    } else if (key === "f") toggleFullscreen();
    else if (key === "m") playback.toggleMute();
    nudgeControls();
  };

  return (
    <div
      ref={wrapRef}
      className={`player shadow-[var(--shadow)] [&.is-fullscreen]:rounded-[0] [&.is-fullscreen]:max-h-[none] [&.is-fullscreen]:aspect-auto [&.is-fullscreen]:h-full [&_video]:w-full [&_video]:h-full [&_video]:object-contain [&_video]:block [&_video]:bg-black [&:not(.controls-on)]:[cursor:none] [&:not(.controls-on)_.player-cue]:bottom-[6%] [&.controls-on_.player-controls]:opacity-100 [&.controls-on_.player-controls]:[transform:none] [&:has(:focus-visible)_.player-controls]:opacity-100 [&:has(:focus-visible)_.player-controls]:[transform:none] mobile:rounded-card relative w-full aspect-video max-h-[78vh] bg-black rounded-panel overflow-hidden outline-none select-none ${showControls || !playing || menu ? "controls-on" : ""} ${fullscreen ? "is-fullscreen" : ""}`}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={nudgeControls}
      onPointerLeave={() => playing && !menu && setShowControls(false)}
    >
      <video
        key={playback.sourceKey}
        ref={videoRef}
        data-delivery={playback.delivery}
        poster={props.poster ?? undefined}
        playsInline
        preload="auto"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          playback.onPlay();
          nudgeControls();
        }}
        onPause={() => {
          playback.onPause();
          setShowControls(true);
        }}
        onWaiting={() => playback.setWaiting(true)}
        onPlaying={() => playback.setWaiting(false)}
        onCanPlay={() => playback.setWaiting(false)}
        onTimeUpdate={(event) => playback.syncTime(event.currentTarget)}
        onDurationChange={(event) => playback.syncDuration(event.currentTarget)}
        onLoadedMetadata={(event) =>
          playback.onLoadedMetadata(event.currentTarget)
        }
        onProgress={(event) => playback.updateBuffered(event.currentTarget)}
        onVolumeChange={(event) => playback.syncAudio(event.currentTarget)}
        onError={(event) => playback.onMediaError(event.currentTarget)}
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

      <PlayerControls
        playback={playback}
        captions={captions}
        subtitles={props.subtitles}
        sourceHeight={props.sourceHeight}
        qualities={props.qualities}
        container={wrapRef.current}
        menu={menu}
        onMenuChange={onMenuChange}
        fullscreen={fullscreen}
        toggleFullscreen={toggleFullscreen}
      />
    </div>
  );
}
