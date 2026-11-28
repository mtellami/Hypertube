import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuFilm, LuListFilter, LuSearch } from "react-icons/lu";
import {
  LIBRARY_FILTER_KEYS,
  type LibraryFilterKey,
} from "../api/library-filters";
import { useLibraryQuery } from "../api/queries";
import { useI18n } from "../common/i18n";
import MovieCard, { MovieCardSkeleton } from "../components/MovieCard";
import { Alert, EmptyState, Spinner } from "../components/ui";
import { buttonStyles } from "../components/ui-styles";
import FeaturedMovie from "./library/FeaturedMovie";
import LibraryFilters from "./library/LibraryFilters";

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

  const setFilter = (key: LibraryFilterKey, value: string) => {
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
  const hasFilters = LIBRARY_FILTER_KEYS.some((k) => params.get(k));
  const featured = !q && !hasFilters ? items[0] : undefined;

  return (
    <div className="library">
      {featured ? (
        <FeaturedMovie movie={featured} />
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

        <LibraryFilters
          params={params}
          genres={genres}
          showFilters={showFilters}
          hasFilters={hasFilters}
          setFilter={setFilter}
          resetFilters={resetFilters}
        />

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
