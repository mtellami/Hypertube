import { buttonStyles } from "../components/ui-styles";
import { useProfileQueries } from "../api/queries";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { formatDate } from "../common/format";
import { useAuth } from "../common/auth";
import { LuCalendar, LuFilm, LuSettings, LuUser } from "react-icons/lu";
import MovieCard from "../components/MovieCard";
import { Alert, Avatar, EmptyState, FullPageSpinner } from "../components/ui";
import { LANGUAGES, useI18n } from "../common/i18n";

export default function Profile() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user: me } = useAuth();
  const userId = Number(id);
  const { profile, watched: watchedQuery } = useProfileQueries(userId);
  const user = profile.data;
  const watched = watchedQuery.data ?? null;
  const notFound =
    !Number.isInteger(userId) ||
    userId <= 0 ||
    (profile.error instanceof ApiError && profile.error.status === 404);
  const failed = profile.isError && !notFound;

  if (notFound) {
    return (
      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] pt-[calc(var(--header-h)_+_48px)] pb-16 my-0 mx-auto">
        <EmptyState icon={<LuUser size={28} />} title={t("profile.not_found")}>
          <Link to="/" className={buttonStyles({ variant: "primary" })}>
            {t("movie.back")}
          </Link>
        </EmptyState>
      </div>
    );
  }
  if (failed)
    return (
      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] pt-[calc(var(--header-h)_+_48px)] pb-16 my-0 mx-auto">
        <Alert>{t("err.generic")}</Alert>
      </div>
    );
  if (!user) return <FullPageSpinner />;

  const own = me?.id === user.id;
  const langLabel =
    LANGUAGES.find((l) => l.code === user.language)?.label ?? user.language;
  return (
    <div className="profile-page">
      <section className="profile-hero [border-bottom:1px_solid_var(--line)] relative pt-[calc(var(--header-h)_+_50px)] pb-9 overflow-hidden">
        <div className="profile-hero-glow bg-profile-glow absolute inset-0" />
        <div
          className={`
          content-shell w-full max-w-360 p-[0_var(--gutter)] profile-head
          [&_.avatar]:shadow-[0_0_0_4px_var(--bg),_0_0_0_6px_rgba(var(--accent-rgb),_0.6),_var(--shadow)]
          [&_.avatar]:animate-[rise_0.5s_var(--ease)] relative flex items-center gap-[clamp(18px,_4vw,_36px)]
          flex-wrap my-0 mx-auto
        `}
        >
          <Avatar
            url={user.profile_picture_url}
            name={user.username}
            first={user.first_name}
            last={user.last_name}
            size={132}
          />
          <div className="profile-id [&_.handle]:text-highlight [&_.handle]:font-semibold grid gap-1.5 flex-1 min-w-55">
            <h1>
              {user.first_name} {user.last_name}
            </h1>
            <p className="handle">@{user.username}</p>
            <p className="meta-line [&_>_span]:inline-flex [&_>_span]:items-center [&_>_span]:gap-1.5 flex flex-wrap items-center gap-y-2 gap-x-4.5 text-secondary text-[0.92rem]">
              <span>
                <LuCalendar size={16} />
                {t("profile.member_since", {
                  d: formatDate(user.created_at, lang),
                })}
              </span>
              <span>{t("profile.language", { l: langLabel })}</span>
            </p>
          </div>
          {own && (
            <Link
              to="/settings"
              className={`${buttonStyles({ variant: "glass" })} self-center`}
            >
              <LuSettings size={18} />
              {t("profile.edit")}
            </Link>
          )}
        </div>
      </section>
      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] pt-8 pb-16 my-0 mx-auto">
        <h2>{t("profile.recent")}</h2>
        {watched === null ? null : watched.length === 0 ? (
          <EmptyState
            icon={<LuFilm size={28} />}
            title={t("profile.no_recent")}
          />
        ) : (
          <div
            className={`
            movie-grid mobile:grid-cols-[repeat(auto-fill,_minmax(132px,_1fr))] mobile:gap-y-5.5 mobile:gap-x-3.5
            phone:grid-cols-[repeat(2,_minmax(0,_1fr))] grid grid-cols-[repeat(auto-fill,_minmax(168px,_1fr))]
            gap-y-7 gap-x-5
          `}
          >
            {watched.map((m, i) => (
              <MovieCard key={m.id} movie={m} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
