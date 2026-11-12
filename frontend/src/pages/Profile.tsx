import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, formatDate, type MovieCard as Movie, type User } from "../api";
import { useAuth } from "../auth";
import { CalendarIcon, FilmIcon, SettingsIcon, UserIcon } from "../components/icons";
import MovieCard from "../components/MovieCard";
import { Alert, Avatar, EmptyState, FullPageSpinner } from "../components/ui";
import { LANGUAGES, useI18n } from "../i18n";

export default function Profile() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user: me } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [watched, setWatched] = useState<Movie[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const userId = Number(id);

  useEffect(() => {
    setUser(null);
    setWatched(null);
    setNotFound(false);
    setFailed(false);
    if (!Number.isInteger(userId) || userId <= 0) {
      setNotFound(true);
      return;
    }
    const ctrl = new AbortController();
    api<User>(`/users/${userId}`, { signal: ctrl.signal })
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else if (!(e instanceof DOMException)) setFailed(true);
      });
    api<Movie[]>(`/users/${userId}/watched`, { signal: ctrl.signal }).then(setWatched).catch(() => undefined);
    return () => ctrl.abort();
  }, [userId]);

  if (notFound) {
    return (
      <div className="container page-pad">
        <EmptyState icon={<UserIcon width={28} height={28} />} title={t("profile.not_found")}>
          <Link to="/" className="btn primary">{t("movie.back")}</Link>
        </EmptyState>
      </div>
    );
  }
  if (failed) return <div className="container page-pad"><Alert>{t("err.generic")}</Alert></div>;
  if (!user) return <FullPageSpinner />;

  const own = me?.id === user.id;
  const langLabel = LANGUAGES.find((l) => l.code === user.language)?.label ?? user.language;
  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero-glow" />
        <div className="container profile-head">
          <Avatar url={user.profile_picture_url} name={user.username} first={user.first_name} last={user.last_name} size={132} />
          <div className="profile-id">
            <h1>{user.first_name} {user.last_name}</h1>
            <p className="handle">@{user.username}</p>
            <p className="meta-line">
              <span><CalendarIcon width={16} height={16} />{t("profile.member_since", { d: formatDate(user.created_at, lang) })}</span>
              <span>{t("profile.language", { l: langLabel })}</span>
            </p>
          </div>
          {own && (
            <Link to="/settings" className="btn glass profile-edit"><SettingsIcon width={18} height={18} />{t("profile.edit")}</Link>
          )}
        </div>
      </section>
      <div className="container page-pad-sm">
        <h2>{t("profile.recent")}</h2>
        {watched === null ? null : watched.length === 0 ? (
          <EmptyState icon={<FilmIcon width={28} height={28} />} title={t("profile.no_recent")} />
        ) : (
          <div className="movie-grid">{watched.map((m, i) => <MovieCard key={m.id} movie={m} index={i} />)}</div>
        )}
      </div>
    </div>
  );
}
