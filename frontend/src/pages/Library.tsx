import { useLibraryQuery } from "../queries";
import {
  buttonStyles,
  filterSelectStyles,
  filterYearStyles,
} from "../components/ui-styles";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { type MovieCard as Movie } from "../api";
import { LuFilm, LuListFilter, LuPlay, LuSearch, LuStar } from "react-icons/lu";
import MovieCard, { MovieCardSkeleton } from "../components/MovieCard";
import { Alert, EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";

const FILTER_KEYS = [
  "genre",
  "min_rating",
  "year_min",
  "year_max",
  "sort",
  "order",
] as const;

function Featured({ movie }: { movie: Movie }) {
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

export default function Library() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const library = useLibraryQuery(params);
  const pages = library.data?.pages ?? [];
  const items = [
    ...new Map(
      pages.flatMap((page) => page.results).map((movie) => [movie.id, movie]),
    ).values(),
  ];
  const latest = pages[pages.length - 1];
  const total = latest?.total ?? null;
  const genres = pages.flatMap((page) => page.genres);
  const warning = latest?.warning ?? null;
  const failed = library.isError;
  const loading = library.isFetching;
  const hasMore = library.hasNextPage;
  const [showFilters, setShowFilters] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const { fetchNextPage, isFetching, hasNextPage } = library;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetching)
          void fetchNextPage();
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, isFetching, hasNextPage]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const resetFilters = () => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    setParams(next, { replace: true });
  };
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));
  const sort = params.get("sort") ?? (q ? "name" : "popularity");
  const featured = !q && !hasFilters ? items[0] : undefined;

  return (
    <div className="library">
      {featured ? (
        <Featured movie={featured} />
      ) : (
        <div className="h-[calc(var(--header-h)_+_28px)]" />
      )}

      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] my-0 mx-auto">
        <div className="section-head [&_h2]:mb-1 [&_h2]:text-[clamp(1.25rem,_2.2vw,_1.6rem)] flex justify-between items-end gap-4 mb-4.5">
          <div>
            <h2>{q ? t("lib.results", { q }) : t("lib.popular")}</h2>
            <p className="text-muted">
              {q
                ? total !== null
                  ? t("lib.count", { n: total })
                  : " "
                : t("lib.popular_sub")}
            </p>
          </div>
          <button
            className={`${buttonStyles({ variant: "ghost" })} filters-toggle [&.filters-toggle]:hidden tablet:[&.filters-toggle]:inline-flex ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-controls="filters"
          >
            <LuListFilter size={18} />
            {t("lib.filters")}
          </button>
        </div>

        <div
          id="filters"
          className={`filters [&_.reset]:ml-auto [&_.reset]:self-center tablet:hidden tablet:[&.open]:grid tablet:[&.open]:grid-cols-[1fr_1fr] tablet:[&.open]:animate-[pop_0.2s_var(--ease)] tablet:[&_.reset]:[grid-column:1_/_-1] tablet:[&_.reset]:m-0 flex flex-wrap gap-3 items-end p-3.5 mb-6.5 bg-surface border border-outline rounded-card ${showFilters ? "open" : ""}`}
        >
          <label
            className={`filter grid gap-[5px] text-[0.78rem] text-muted font-medium`}
          >
            <span>{t("lib.genre")}</span>
            <select
              className={filterSelectStyles}
              value={params.get("genre") ?? ""}
              onChange={(e) => setFilter("genre", e.target.value)}
            >
              <option value="">{t("lib.all_genres")}</option>
              {[
                ...new Set([
                  ...(params.get("genre") ? [params.get("genre")!] : []),
                  ...genres,
                ]),
              ].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label
            className={`filter grid gap-[5px] text-[0.78rem] text-muted font-medium`}
          >
            <span>{t("lib.min_rating")}</span>
            <select
              className={filterSelectStyles}
              value={params.get("min_rating") ?? ""}
              onChange={(e) => setFilter("min_rating", e.target.value)}
            >
              <option value="">{t("lib.any_rating")}</option>
              {[5, 6, 7, 8].map((r) => (
                <option key={r} value={r}>{`${r}+ ★`}</option>
              ))}
            </select>
          </label>
          <YearInput
            label={t("lib.year_from")}
            value={params.get("year_min") ?? ""}
            onCommit={(v) => setFilter("year_min", v)}
          />
          <YearInput
            label={t("lib.year_to")}
            value={params.get("year_max") ?? ""}
            onCommit={(v) => setFilter("year_max", v)}
          />
          <label
            className={`filter grid gap-[5px] text-[0.78rem] text-muted font-medium`}
          >
            <span>{t("lib.sort")}</span>
            <select
              className={filterSelectStyles}
              value={sort}
              onChange={(e) => setFilter("sort", e.target.value)}
            >
              <option value="popularity">{t("lib.sort_popularity")}</option>
              <option value="name">{t("lib.sort_name")}</option>
              <option value="year">{t("lib.sort_year")}</option>
              <option value="rating">{t("lib.sort_rating")}</option>
            </select>
          </label>
          <label
            className={`filter grid gap-[5px] text-[0.78rem] text-muted font-medium`}
          >
            <span>&nbsp;</span>
            <select
              className={filterSelectStyles}
              value={params.get("order") ?? ""}
              onChange={(e) => setFilter("order", e.target.value)}
              aria-label="Order"
            >
              <option value="">
                {sort === "name" ? t("lib.order_asc") : t("lib.order_desc")}
              </option>
              <option value={sort === "name" ? "desc" : "asc"}>
                {sort === "name" ? t("lib.order_desc") : t("lib.order_asc")}
              </option>
            </select>
          </label>
          {hasFilters && (
            <button
              className={`${buttonStyles({ variant: "ghost", size: "small" })} reset`}
              onClick={resetFilters}
            >
              {t("lib.reset")}
            </button>
          )}
        </div>

        {warning === "sources_unavailable" && (
          <Alert kind="info">{t("lib.unavailable")}</Alert>
        )}
        {failed && <Alert>{t("err.generic")}</Alert>}

        <div
          className={`
          movie-grid mobile:grid-cols-[repeat(auto-fill,_minmax(132px,_1fr))] mobile:gap-y-5.5 mobile:gap-x-3.5
          phone:grid-cols-[repeat(2,_minmax(0,_1fr))] grid grid-cols-[repeat(auto-fill,_minmax(168px,_1fr))]
          gap-y-7 gap-x-5
        `}
        >
          {items.map((m, i) => (
            <MovieCard key={m.id} movie={m} index={i} />
          ))}
          {loading &&
            items.length === 0 &&
            Array.from({ length: 12 }, (_, i) => <MovieCardSkeleton key={i} />)}
        </div>

        {!loading &&
          items.length === 0 &&
          !failed &&
          warning === null &&
          total !== null && (
            <EmptyState
              icon={q ? <LuSearch size={28} /> : <LuFilm size={28} />}
              title={t("lib.empty")}
            >
              {t("lib.empty_sub")}
            </EmptyState>
          )}

        <div ref={sentinel} className="h-[1px]" aria-hidden="true" />
        {loading && items.length > 0 && (
          <div className="grid place-items-center p-8.5">
            <Spinner />
          </div>
        )}
        {!hasMore && items.length > 0 && (
          <p className="end-of-list [padding:34px_0_10px] text-center text-muted text-[0.88rem]">
            {t("lib.end")}
          </p>
        )}
      </div>
    </div>
  );
}

function YearInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const id = window.setTimeout(() => {
      const n = Number(local);
      if (local === "") onCommit("");
      else if (/^\d{4}$/.test(local) && n >= 1850 && n <= 2100) onCommit(local);
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return (
    <label
      className={`filter grid gap-[5px] text-[0.78rem] text-muted font-medium year`}
    >
      <span>{label}</span>
      <input
        className={filterYearStyles}
        type="number"
        inputMode="numeric"
        min={1850}
        max={2100}
        placeholder="YYYY"
        value={local}
        onChange={(e) => setLocal(e.target.value.slice(0, 4))}
      />
    </label>
  );
}
