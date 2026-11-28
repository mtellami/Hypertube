import { useState } from "react";
import { Link } from "react-router-dom";
import type { MovieCard as Movie } from "../api";
import { useI18n } from "../i18n";
import { LuEye, LuFilm, LuStar } from "react-icons/lu";

export default function MovieCard({
  movie,
  index = 0,
}: {
  movie: Movie;
  index?: number;
}) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  return (
    <Link
      to={`/movies/${movie.id}`}
      className={`movie-card animate-[rise_0.45s_var(--ease)_both] [&:hover_.poster]:[transform:translateY(-6px)] [&:hover_.poster]:shadow-[0_24px_50px_-18px_rgba(0,_0,_0,_0.95),_0_0_0_1px_rgba(var(--accent-2-rgb),_0.45)] [&:focus-visible_.poster]:[transform:translateY(-6px)] [&:focus-visible_.poster]:shadow-[0_24px_50px_-18px_rgba(0,_0,_0,_0.95),_0_0_0_1px_rgba(var(--accent-2-rgb),_0.45)] [&:hover_.poster_img]:[transform:scale(1.05)] [&:hover_.poster-shade]:opacity-100 [&.is-watched_.poster_img]:[filter:saturate(0.55)_brightness(0.75)] [&.is-watched:hover_.poster_img]:[filter:none] grid grid-cols-1 gap-2.5 min-w-0 outline-none ${movie.watched ? "is-watched" : ""}`}
      style={{ animationDelay: `${Math.min(index % 24, 12) * 30}ms` }}
    >
      <div
        className={`poster shadow-[0_10px_30px_-14px_rgba(0,_0,_0,_0.9)] [transition:transform_0.35s_var(--ease),_box-shadow_0.35s] [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_img]:opacity-0 [&_img]:[transition:opacity_0.4s,_transform_0.6s_var(--ease),_filter_0.3s] [&.loaded_img]:opacity-100 relative aspect-[2/3] rounded-card overflow-hidden bg-surface-raised ${loaded ? "loaded" : ""}`}
      >
        {movie.cover_url && !broken ? (
          <img
            src={movie.cover_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="poster-fallback bg-poster-fallback absolute inset-0 grid place-content-center justify-items-center gap-2.5 p-4 text-center text-muted text-[0.82rem]">
            <LuFilm size={34} />
            <span>{movie.name}</span>
          </div>
        )}
        <div className="poster-shade bg-poster-shade [transition:opacity_0.3s] absolute inset-0 opacity-60" />
        {movie.rating !== null && (
          <span
            className={`
              badge [backdrop-filter:blur(10px)] [&.rating]:top-2.5 [&.rating]:left-2.5
              [&.rating]:[background:rgba(9,_12,_24,_0.75)] [&.rating]:text-[#ffd166]
              [&.rating]:[border:1px_solid_rgba(255,_209,_102,_0.25)] [&.watched]:top-2.5 [&.watched]:right-2.5
              [&.watched]:[background:rgba(52,_211,_153,_0.85)] [&.watched]:text-[#03160e] absolute inline-flex
              items-center gap-1 h-6 rounded-full text-[0.72rem] font-bold rating py-0 px-2
            `}
            title="TMDb"
          >
            <LuStar size={12} fill="currentColor" stroke="none" />
            {movie.rating.toFixed(1)}
          </span>
        )}
        {movie.watched && (
          <span
            className={`
            badge [backdrop-filter:blur(10px)] [&.rating]:top-2.5 [&.rating]:left-2.5
            [&.rating]:[background:rgba(9,_12,_24,_0.75)] [&.rating]:text-[#ffd166]
            [&.rating]:[border:1px_solid_rgba(255,_209,_102,_0.25)] [&.watched]:top-2.5 [&.watched]:right-2.5
            [&.watched]:[background:rgba(52,_211,_153,_0.85)] [&.watched]:text-[#03160e] absolute inline-flex
            items-center gap-1 h-6 rounded-full text-[0.72rem] font-bold watched py-0 px-2
          `}
          >
            <LuEye size={12} />
            {t("lib.watched")}
          </span>
        )}
      </div>
      <div
        className={`
        card-body [&_h3]:text-[0.93rem] [&_h3]:font-sans [&_h3]:font-semibold [&_h3]:tracking-[-0.005em]
        [&_h3]:[display:-webkit-box] [&_h3]:[-webkit-line-clamp:2] [&_h3]:[-webkit-box-orient:vertical]
        [&_h3]:overflow-hidden [&_p]:flex [&_p]:gap-1.5 [&_p]:text-muted [&_p]:text-[0.8rem] [&_p]:mt-[3px]
        [&_p]:overflow-hidden [&_p]:whitespace-nowrap [&_.dot::before]:content-['·'] [&_.dot::before]:mr-1.5
        [&_.dot]:overflow-hidden [&_.dot]:[text-overflow:ellipsis]
      `}
      >
        <h3 title={movie.name}>{movie.name}</h3>
        <p>
          <span>{movie.year ?? "—"}</span>
          {movie.genres.length > 0 && (
            <span className="dot">{movie.genres.slice(0, 2).join(", ")}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function MovieCardSkeleton() {
  return (
    <div
      className={`
        movie-card animate-[rise_0.45s_var(--ease)_both] [&:hover_.poster]:[transform:translateY(-6px)]
        [&:hover_.poster]:shadow-[0_24px_50px_-18px_rgba(0,_0,_0,_0.95),_0_0_0_1px_rgba(var(--accent-2-rgb),_0.45)]
        [&:focus-visible_.poster]:[transform:translateY(-6px)]
        [&:focus-visible_.poster]:shadow-[0_24px_50px_-18px_rgba(0,_0,_0,_0.95),_0_0_0_1px_rgba(var(--accent-2-rgb),_0.45)]
        [&:hover_.poster_img]:[transform:scale(1.05)] [&:hover_.poster-shade]:opacity-100
        [&.is-watched_.poster_img]:[filter:saturate(0.55)_brightness(0.75)]
        [&.is-watched:hover_.poster_img]:[filter:none] grid grid-cols-1 gap-2.5 min-w-0 outline-none skeleton
        [&_.line]:h-3 [&_.line]:rounded-[6px] [&_.line.short]:w-[50%] [&_.line.short]:mt-1.5
      `}
      aria-hidden="true"
    >
      <div
        className={`
        poster shadow-[0_10px_30px_-14px_rgba(0,_0,_0,_0.9)]
        [transition:transform_0.35s_var(--ease),_box-shadow_0.35s] [&_img]:absolute [&_img]:inset-0
        [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_img]:opacity-0
        [&_img]:[transition:opacity_0.4s,_transform_0.6s_var(--ease),_filter_0.3s] [&.loaded_img]:opacity-100
        relative aspect-[2/3] rounded-card overflow-hidden bg-surface-raised shimmer bg-shimmer
        [background-size:200%_100%] animate-[shimmer_1.4s_infinite]
      `}
      />
      <div
        className={`
        card-body [&_h3]:text-[0.93rem] [&_h3]:font-sans [&_h3]:font-semibold [&_h3]:tracking-[-0.005em]
        [&_h3]:[display:-webkit-box] [&_h3]:[-webkit-line-clamp:2] [&_h3]:[-webkit-box-orient:vertical]
        [&_h3]:overflow-hidden [&_p]:flex [&_p]:gap-1.5 [&_p]:text-muted [&_p]:text-[0.8rem] [&_p]:mt-[3px]
        [&_p]:overflow-hidden [&_p]:whitespace-nowrap [&_.dot::before]:content-['·'] [&_.dot::before]:mr-1.5
        [&_.dot]:overflow-hidden [&_.dot]:[text-overflow:ellipsis]
      `}
      >
        <div className="line shimmer bg-shimmer [background-size:200%_100%] animate-[shimmer_1.4s_infinite]" />
        <div className="line short shimmer bg-shimmer [background-size:200%_100%] animate-[shimmer_1.4s_infinite]" />
      </div>
    </div>
  );
}
