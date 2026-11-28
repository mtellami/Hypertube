import { LuCheck } from "react-icons/lu";
import type { MovieDetail } from "../../api/client";
import { useAuth } from "../../common/auth";
import { useI18n } from "../../common/i18n";
import { Alert, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";
import VideoPlayer from "../../components/player/VideoPlayer";
import { useStreamStatus } from "./useStreamStatus";

function formatRate(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export default function MovieStream({
  movie,
  onSubtitlesMaybeChanged,
}: {
  movie: MovieDetail;
  onSubtitlesMaybeChanged: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { status, failed, ready, retry } = useStreamStatus(
    movie.id,
    onSubtitlesMaybeChanged,
  );

  const movieLang = movie.language ?? "en";
  const preferred = user?.language ?? "en";
  const defaultSub = preferred !== movieLang ? preferred : null;

  if (failed || status?.state === "error") {
    return (
      <div className="stream-box mobile:rounded-card relative aspect-video max-h-[78vh] w-full rounded-panel overflow-hidden bg-black border border-outline grid place-items-center">
        <div className="stream-state [&_h3]:text-[1.2rem] relative z-[1] grid justify-items-center gap-3 text-center p-6">
          <Alert>{status?.error ?? t("movie.stream_error")}</Alert>
          <button
            className={buttonStyles({ variant: "primary" })}
            onClick={retry}
          >
            {t("movie.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!ready || !status?.mode) {
    return (
      <div className="stream-box mobile:rounded-card relative aspect-video max-h-[78vh] w-full rounded-panel overflow-hidden bg-black border border-outline grid place-items-center">
        {movie.backdrop_url && (
          <div
            className="stream-bg [filter:blur(30px)_brightness(0.35)] absolute inset-[-40px] bg-cover bg-center"
            style={{ backgroundImage: `url("${movie.backdrop_url}")` }}
          />
        )}
        <div className="stream-state [&_h3]:text-[1.2rem] relative z-[1] grid justify-items-center gap-3 text-center p-6">
          <Spinner size={42} />
          <h3>{t("movie.ready_in")}</h3>
          <p className="text-muted">
            {!status || status.state === "preparing" || status.state === "idle"
              ? t("movie.preparing")
              : t("movie.buffering", {
                  p: Math.round(status.buffer),
                  rate: formatRate(status.download_rate),
                  peers: status.peers,
                })}
          </p>
          <div
            className={`
            meter [&_div]:h-full [&_div]:bg-(image:--accent-grad) [&_div]:[transition:width_0.6s_var(--ease)]
            w-[min(320px,_70vw)] h-1 bg-white/12 rounded-full overflow-hidden
          `}
          >
            <div
              style={{
                width: `${Math.max(3, Math.min(100, status?.buffer ?? 0))}%`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stream-ready">
      <VideoPlayer
        movieId={movie.id}
        mode={status.mode}
        knownDuration={status.duration}
        subtitles={movie.available_subtitles}
        defaultSubtitle={defaultSub}
        poster={movie.backdrop_url}
        sourceHeight={status.height}
        qualities={status.qualities}
        mseType={status.mse_type}
        mseTypeConverted={status.mse_type_converted}
      />
      <div className="flex gap-2.5 flex-wrap mt-3">
        {status.state === "complete" ? (
          <span
            className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary success py-0 px-3
          `}
          >
            <LuCheck size={14} />
            {t("movie.downloaded")}
          </span>
        ) : (
          <span
            className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3
          `}
          >
            <span className="pulse shadow-[0_0_0_0_rgba(var(--accent-rgb),_0.6)] animate-[pulse_1.6s_infinite] w-2 h-2 rounded-full bg-accent" />
            {t("movie.downloading", { p: status.progress.toFixed(1) })} ·{" "}
            {formatRate(status.download_rate)}/s
          </span>
        )}
        {status.mode === "transcode" && status.container && (
          <span
            className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3
          `}
          >
            {t("movie.converting", { c: status.container.toUpperCase() })}
          </span>
        )}
      </div>
    </div>
  );
}
