import { Link } from "react-router-dom";
import {
  LuArrowLeft,
  LuCalendar,
  LuCaptions,
  LuClock,
  LuEye,
  LuFilm,
  LuPlay,
  LuStar,
} from "react-icons/lu";
import type { MovieDetail } from "../../api/client";
import { useI18n } from "../../common/i18n";
import { buttonStyles } from "../../components/ui-styles";

export default function MovieHero({
  movie,
  playing,
  startPlaying,
}: {
  movie: MovieDetail;
  playing: boolean;
  startPlaying: () => void;
}) {
  const { t } = useI18n();
  const art = movie.backdrop_url ?? movie.cover_url;
  return (
    <section className="movie-hero after:content-[''] after:absolute after:inset-0 after:bg-movie-overlay relative overflow-hidden pt-[var(--header-h)]">
      {art && (
        <div
          className={`movie-hero-bg [background-position:center_20%] animate-[fade-in_0.8s_ease] [&.blurred]:inset-[-60px] [&.blurred]:[filter:blur(40px)_saturate(1.3)] [&.blurred]:opacity-50 absolute inset-0 bg-cover opacity-55 ${movie.backdrop_url ? "" : "blurred"}`}
          style={{ backgroundImage: `url("${art}")` }}
        />
      )}
      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] relative z-[2] pt-6 pb-10 my-0 mx-auto">
        <Link
          to="/"
          className="back-link [transition:color_0.2s,_gap_0.2s] hover:text-foreground hover:gap-[11px] inline-flex items-center gap-2 text-secondary text-[0.88rem] mb-6.5"
        >
          <LuArrowLeft size={18} />
          {t("movie.back")}
        </Link>
        <div className="movie-head mobile:flex-col mobile:items-start flex gap-[clamp(20px,_4vw,_44px)] items-end">
          <div
            className={`
          movie-poster shadow-[0_30px_70px_-20px_rgba(0,_0,_0,_0.9)] animate-[rise_0.5s_var(--ease)]
          [&_img]:w-full [&_img]:h-full [&_img]:object-cover mobile:w-37.5 w-[clamp(150px,_20vw,_270px)]
          shrink-0 aspect-[2/3] rounded-card overflow-hidden bg-surface-raised relative
        `}
          >
            {movie.cover_url ? (
              <img
                src={movie.cover_url}
                alt={movie.name}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="poster-fallback bg-poster-fallback absolute inset-0 grid place-content-center justify-items-center gap-2.5 p-4 text-center text-muted text-[0.82rem]">
                <LuFilm size={40} />
              </div>
            )}
          </div>
          <div className="movie-headline animate-[rise_0.6s_var(--ease)] [&_h1]:text-[clamp(1.9rem,_4.6vw,_3.4rem)] [&_h1]:wrap-anywhere grid gap-3.5 justify-items-start min-w-0">
            {movie.watched && (
              <span
                className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3
          `}
              >
                <LuEye size={14} />
                {t("lib.watched")}
              </span>
            )}
            <h1>{movie.name}</h1>
            <div className="meta-line [&_>_span]:inline-flex [&_>_span]:items-center [&_>_span]:gap-1.5 flex flex-wrap items-center gap-y-2 gap-x-4.5 text-secondary text-[0.92rem]">
              {movie.rating !== null && (
                <span
                  className="rating-inline [&_small]:text-muted [&_small]:font-medium [&_small]:ml-0.5 [&.big]:text-[1.05rem] text-[#ffd166] font-bold big"
                  title={movie.rating_source ?? undefined}
                >
                  <LuStar size={16} fill="currentColor" stroke="none" />
                  {movie.rating.toFixed(1)}
                  <small>/10 TMDb</small>
                </span>
              )}
              <span>
                <LuCalendar size={16} />
                {movie.year ?? t("movie.unknown")}
              </span>
              {movie.length && (
                <span>
                  <LuClock size={16} />
                  {t("movie.min", { n: movie.length })}
                </span>
              )}
              {movie.available_subtitles.length > 0 && (
                <span>
                  <LuCaptions size={16} />
                  {movie.available_subtitles
                    .map((s) => s.lang.toUpperCase())
                    .join(" · ")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {movie.genres.map((g) => (
                <span
                  key={g}
                  className="inline-flex items-center h-7 rounded-full bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3"
                >
                  {g}
                </span>
              ))}
            </div>
            {!playing && (
              <div className="mt-1.5">
                <button
                  className={buttonStyles({ variant: "primary", size: "lg" })}
                  onClick={startPlaying}
                >
                  <LuPlay size={18} fill="currentColor" stroke="none" />
                  {movie.watched ? t("movie.resume") : t("movie.play")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
