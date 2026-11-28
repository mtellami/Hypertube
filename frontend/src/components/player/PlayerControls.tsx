import {
  LuCaptions,
  LuMaximize,
  LuMinimize,
  LuPause,
  LuPlay,
  LuSettings,
  LuVolume2,
  LuVolumeX,
} from "react-icons/lu";
import type { SubtitleInfo } from "../../api/client";
import { formatDuration } from "../../common/format";
import { useI18n } from "../../common/i18n";
import { iconButtonStyles } from "../ui-styles";
import PlayerMenu from "./PlayerMenu";
import PlayerSeekBar from "./PlayerSeekBar";
import type { useCaptions } from "./useCaptions";
import type { usePlayback } from "./usePlayback";

export type PlayerMenuName = "quality" | "subtitles";

interface Props {
  playback: ReturnType<typeof usePlayback>;
  captions: ReturnType<typeof useCaptions>;
  subtitles: SubtitleInfo[];
  sourceHeight: number | null;
  qualities: number[];
  container: HTMLElement | null;
  menu: PlayerMenuName | null;
  onMenuChange: (menu: PlayerMenuName, open: boolean) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
}

export default function PlayerControls({
  playback,
  captions,
  subtitles,
  sourceHeight,
  qualities,
  container,
  menu,
  onMenuChange,
  fullscreen,
  toggleFullscreen,
}: Props) {
  const { t } = useI18n();
  const {
    duration,
    time,
    bufferedPct,
    seekTo,
    playing,
    togglePlay,
    toggleMute,
    setVolume,
    audio: { volume, muted },
    quality,
    chooseQuality,
  } = playback;

  return (
    <div
      className={`
        player-controls [padding:40px_18px_12px] bg-player-fade [transform:translateY(8px)]
        [transition:opacity_0.25s,_transform_0.25s_var(--ease)] mobile:[padding:30px_8px_6px]
        touch:opacity-100 touch:[transform:none] absolute inset-[auto_0_0_0] opacity-0
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <PlayerSeekBar
        duration={duration}
        time={time}
        bufferedPct={bufferedPct}
        seekTo={seekTo}
      />
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
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </div>
        <span className="time phone:hidden text-[0.84rem] tabular-nums text-white/85 ml-1.5 whitespace-nowrap">
          {formatDuration(time)}
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
            open={menu === "quality"}
            onOpenChange={(open) => onMenuChange("quality", open)}
            container={container}
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
          value={captions.language ?? "off"}
          options={[
            { value: "off", label: t("player.off") },
            ...subtitles.map((subtitle) => ({
              value: subtitle.lang,
              label: subtitle.label,
            })),
          ]}
          onValueChange={(value) =>
            captions.select(value === "off" ? null : value)
          }
          open={menu === "subtitles"}
          onOpenChange={(open) => onMenuChange("subtitles", open)}
          container={container}
        >
          <button
            className={`${iconButtonStyles({ ghost: true })} ${captions.language ? "active" : ""}`}
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
  );
}
