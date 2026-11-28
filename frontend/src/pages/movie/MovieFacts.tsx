import { LuExternalLink } from "react-icons/lu";
import type { MovieDetail } from "../../api/client";
import { useI18n } from "../../common/i18n";

const LANG_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  ja: "日本語",
  ru: "Русский",
  pt: "Português",
  nl: "Nederlands",
  sv: "Svenska",
};

export default function MovieFacts({ movie }: { movie: MovieDetail }) {
  const { t } = useI18n();
  return (
    <aside className="movie-side compact:static self-start sticky top-[calc(var(--header-h)_+_20px)]">
      <dl
        className={`
      facts [&_dt]:text-[0.75rem] [&_dt]:uppercase [&_dt]:tracking-[0.1em] [&_dt]:text-muted
      [&_dt]:font-semibold [&_dt]:mb-[3px] [&_dd]:m-0 [&_dd]:text-foreground [&_dd]:text-[0.92rem]
      [&_dd]:wrap-anywhere m-0 p-5.5 bg-surface border border-outline rounded-panel grid gap-4
    `}
      >
        <div>
          <dt>{t("movie.director")}</dt>
          <dd>{movie.directors.join(", ") || t("movie.unknown")}</dd>
        </div>
        {movie.producers.length > 0 && (
          <div>
            <dt>{t("movie.producers")}</dt>
            <dd>{movie.producers.join(", ")}</dd>
          </div>
        )}
        {movie.cast.length > 0 && (
          <div>
            <dt>{t("movie.cast")}</dt>
            <dd>
              {movie.cast
                .slice(0, 4)
                .map((c) => c.name)
                .join(", ")}
            </dd>
          </div>
        )}
        <div>
          <dt>{t("movie.language")}</dt>
          <dd>
            {movie.language
              ? (LANG_NAMES[movie.language] ?? movie.language.toUpperCase())
              : t("movie.unknown")}
          </dd>
        </div>
        <div>
          <dt>{t("movie.subtitles")}</dt>
          <dd>
            {movie.available_subtitles.length
              ? movie.available_subtitles.map((s) => s.label).join(", ")
              : t("movie.no_subtitles")}
          </dd>
        </div>
        <div>
          <dt>{t("movie.source")}</dt>
          <dd>
            {movie.source === "archive" ? "Internet Archive" : "PeerTube"}
            {movie.source_url && (
              <a
                className="link hover:[text-decoration:underline] hover:[text-underline-offset:3px] text-highlight font-medium inline-flex items-center gap-1 ml-2.5 text-[0.84rem]"
                href={movie.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("movie.view_source")} <LuExternalLink size={14} />
              </a>
            )}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
