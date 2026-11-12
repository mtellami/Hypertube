import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, isAbortError, type LibraryPage, type MovieCard as Movie } from "../api";
import { FilmIcon, FilterIcon, PlayIcon, SearchIcon, StarIcon } from "../components/icons";
import MovieCard, { MovieCardSkeleton } from "../components/MovieCard";
import { Alert, EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";

const FILTER_KEYS = ["genre", "min_rating", "year_min", "year_max", "sort", "order"] as const;

function Featured({ movie }: { movie: Movie }) {
  const { t } = useI18n();
  return (
    <section className="featured">
      {movie.cover_url && <div className="featured-bg" style={{ backgroundImage: `url("${movie.cover_url}")` }} />}
      <div className="featured-inner">
        {movie.cover_url && <img className="featured-poster" src={movie.cover_url} alt="" referrerPolicy="no-referrer" />}
        <div className="featured-copy">
          <span className="eyebrow">{t("lib.featured")}</span>
          <h1>{movie.name}</h1>
          <p className="meta-line">
            {movie.year && <span>{movie.year}</span>}
            {movie.rating !== null && <span className="rating-inline"><StarIcon width={14} height={14} />{movie.rating.toFixed(1)}</span>}
            {movie.genres.slice(0, 3).map((g) => <span key={g} className="chip">{g}</span>)}
          </p>
          <div className="featured-actions">
            <Link to={`/movies/${movie.id}?play=1`} className="btn primary lg"><PlayIcon width={18} height={18} />{t("lib.watch_now")}</Link>
            <Link to={`/movies/${movie.id}`} className="btn glass lg">{t("lib.details")}</Link>
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
  const filterKey = FILTER_KEYS.map((k) => params.get(k) ?? "").join("|");
  const [items, setItems] = useState<Movie[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (nextPage: number, reset: boolean) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    loadingRef.current = true;
    setLoading(true);
    setFailed(false);
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) qs.set(k, v);
    }
    qs.set("page", String(nextPage));
    try {
      const data = await api<LibraryPage>(`/library?${qs}`, { signal: ctrl.signal });
      setItems((prev) => {
        if (reset) return data.results;
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...data.results.filter((m) => !seen.has(m.id))];
      });
      setPage(nextPage);
      setHasMore(data.has_more);
      setTotal(data.total);
      setGenres((g) => (data.genres.length || reset ? data.genres : g));
      setWarning(data.warning);
    } catch (e) {
      if (isAbortError(e)) return;
      setFailed(true);
      setHasMore(false);
    } finally {
      if (ctrlRef.current === ctrl) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filterKey]);

  // New search / filters: restart from page 1.
  useEffect(() => {
    setItems([]);
    setTotal(null);
    setHasMore(true);
    void load(1, true);
    return () => ctrlRef.current?.abort();
  }, [load]);

  // Infinite scroll: load the next page when the sentinel approaches the viewport.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current && page > 0) void load(page + 1, false);
      },
      { rootMargin: "900px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, page, load]);

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
      {featured ? <Featured movie={featured} /> : <div className="library-top-space" />}

      <div className="container">
        <div className="section-head">
          <div>
            <h2>{q ? t("lib.results", { q }) : t("lib.popular")}</h2>
            <p className="muted">{q ? (total !== null ? t("lib.count", { n: total }) : " ") : t("lib.popular_sub")}</p>
          </div>
          <button className={`btn ghost filters-toggle ${showFilters ? "active" : ""}`} onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters} aria-controls="filters">
            <FilterIcon width={18} height={18} />{t("lib.filters")}
          </button>
        </div>

        <div id="filters" className={`filters ${showFilters ? "open" : ""}`}>
          <label className="filter">
            <span>{t("lib.genre")}</span>
            <select value={params.get("genre") ?? ""} onChange={(e) => setFilter("genre", e.target.value)}>
              <option value="">{t("lib.all_genres")}</option>
              {[...new Set([...(params.get("genre") ? [params.get("genre")!] : []), ...genres])].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>{t("lib.min_rating")}</span>
            <select value={params.get("min_rating") ?? ""} onChange={(e) => setFilter("min_rating", e.target.value)}>
              <option value="">{t("lib.any_rating")}</option>
              {[5, 6, 7, 8].map((r) => <option key={r} value={r}>{`${r}+ ★`}</option>)}
            </select>
          </label>
          <YearInput label={t("lib.year_from")} value={params.get("year_min") ?? ""} onCommit={(v) => setFilter("year_min", v)} />
          <YearInput label={t("lib.year_to")} value={params.get("year_max") ?? ""} onCommit={(v) => setFilter("year_max", v)} />
          <label className="filter">
            <span>{t("lib.sort")}</span>
            <select value={sort} onChange={(e) => setFilter("sort", e.target.value)}>
              <option value="popularity">{t("lib.sort_popularity")}</option>
              <option value="name">{t("lib.sort_name")}</option>
              <option value="year">{t("lib.sort_year")}</option>
              <option value="rating">{t("lib.sort_rating")}</option>
            </select>
          </label>
          <label className="filter">
            <span>&nbsp;</span>
            <select value={params.get("order") ?? ""} onChange={(e) => setFilter("order", e.target.value)} aria-label="Order">
              <option value="">{sort === "name" ? t("lib.order_asc") : t("lib.order_desc")}</option>
              <option value={sort === "name" ? "desc" : "asc"}>{sort === "name" ? t("lib.order_desc") : t("lib.order_asc")}</option>
            </select>
          </label>
          {hasFilters && <button className="btn ghost small reset" onClick={resetFilters}>{t("lib.reset")}</button>}
        </div>

        {warning === "sources_unavailable" && <Alert kind="info">{t("lib.unavailable")}</Alert>}
        {failed && <Alert>{t("err.generic")}</Alert>}

        <div className="movie-grid">
          {items.map((m, i) => <MovieCard key={m.id} movie={m} index={i} />)}
          {loading && items.length === 0 && Array.from({ length: 12 }, (_, i) => <MovieCardSkeleton key={i} />)}
        </div>

        {!loading && items.length === 0 && !failed && warning === null && total !== null && (
          <EmptyState icon={q ? <SearchIcon width={28} height={28} /> : <FilmIcon width={28} height={28} />} title={t("lib.empty")}>
            {t("lib.empty_sub")}
          </EmptyState>
        )}

        <div ref={sentinel} className="sentinel" aria-hidden="true" />
        {loading && items.length > 0 && <div className="load-more"><Spinner /></div>}
        {!hasMore && items.length > 0 && <p className="end-of-list">{t("lib.end")}</p>}
      </div>
    </div>
  );
}

function YearInput({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
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
    <label className="filter year">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={1850} max={2100} placeholder="YYYY" value={local}
        onChange={(e) => setLocal(e.target.value.slice(0, 4))} />
    </label>
  );
}
