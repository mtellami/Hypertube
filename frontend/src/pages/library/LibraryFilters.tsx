import { useEffect, useState } from "react";
import type { LibraryFilterKey } from "../../api/library-filters";
import { useI18n } from "../../common/i18n";
import {
  buttonStyles,
  filterSelectStyles,
  filterYearStyles,
} from "../../components/ui-styles";

interface Props {
  params: URLSearchParams;
  genres: string[];
  showFilters: boolean;
  hasFilters: boolean;
  setFilter: (key: LibraryFilterKey, value: string) => void;
  resetFilters: () => void;
}

export default function LibraryFilters({
  params,
  genres,
  showFilters,
  hasFilters,
  setFilter,
  resetFilters,
}: Props) {
  const { t } = useI18n();
  const sort =
    params.get("sort") ?? (params.get("q")?.trim() ? "name" : "popularity");

  return (
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
