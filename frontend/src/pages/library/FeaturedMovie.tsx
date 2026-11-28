import { Link } from "react-router-dom";
import { LuPlay, LuStar } from "react-icons/lu";
import type { MovieCard as Movie } from "../../api/client";
import { useI18n } from "../../common/i18n";
import { buttonStyles } from "../../components/ui-styles";

export default function FeaturedMovie({ movie }: { movie: Movie }) {
  const { t } = useI18n();
  return (
    <section
      className={`
      featured after:content-[''] after:absolute after:inset-0 after:bg-featured-overlay mobile:min-h-auto
      relative min-h-[min(78vh,_680px)] flex items-end overflow-hidden mb-4.5
    `}
    >
      {movie.cover_url && (
        <div
          className={`
        featured-bg [background-position:center_25%] [filter:blur(42px)_saturate(1.3)_brightness(0.55)]
        [transform:scale(1.1)] animate-[fade-in_0.8s_ease] absolute inset-[-60px] bg-cover
      `}
          style={{ backgroundImage: `url("${movie.cover_url}")` }}
        />
      )}
      <div
        className={`
        featured-inner mobile:flex-col mobile:items-start mobile:pb-6 relative z-[2] w-full max-w-360
        p-[calc(var(--header-h)_+_40px)_var(--gutter)_40px] flex gap-[clamp(20px,_4vw,_48px)] items-end my-0
        mx-auto
      `}
      >
        {movie.cover_url && (
          <img
            className={`
          featured-poster shadow-[0_30px_70px_-20px_rgba(0,_0,_0,_0.9)] animate-[rise_0.6s_var(--ease)]
          mobile:w-32.5 w-[clamp(150px,_18vw,_250px)] aspect-[2/3] object-cover rounded-card
        `}
            src={movie.cover_url}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
        <div className="featured-copy animate-[rise_0.7s_var(--ease)] [&_h1]:text-[clamp(2rem,_5vw,_3.8rem)] grid gap-3.5 max-w-180">
          <span className="inline-block text-[0.75rem] uppercase tracking-[0.16em] font-bold text-highlight">
            {t("lib.featured")}
          </span>
          <h1>{movie.name}</h1>
          <p className="meta-line [&_>_span]:inline-flex [&_>_span]:items-center [&_>_span]:gap-1.5 flex flex-wrap items-center gap-y-2 gap-x-4.5 text-secondary text-[0.92rem]">
            {movie.year && <span>{movie.year}</span>}
            {movie.rating !== null && (
              <span className="rating-inline [&_small]:text-muted [&_small]:font-medium [&_small]:ml-0.5 [&.big]:text-[1.05rem] text-[#ffd166] font-bold">
                <LuStar size={14} fill="currentColor" stroke="none" />
                {movie.rating.toFixed(1)}
              </span>
            )}
            {movie.genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="inline-flex items-center h-7 rounded-full bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3"
              >
                {g}
              </span>
            ))}
          </p>
          <div className="flex gap-3 flex-wrap mt-1.5">
            <Link
              to={`/movies/${movie.id}?play=1`}
              className={buttonStyles({ variant: "primary", size: "lg" })}
            >
              <LuPlay size={18} fill="currentColor" stroke="none" />
              {t("lib.watch_now")}
            </Link>
            <Link
              to={`/movies/${movie.id}`}
              className={buttonStyles({ variant: "glass", size: "lg" })}
            >
              {t("lib.details")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
