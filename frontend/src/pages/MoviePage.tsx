import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, formatDate, type CommentItem, type MovieDetail, type StreamStatus } from "../api";
import { useAuth } from "../auth";
import {
  ArrowLeftIcon, CalendarIcon, CaptionsIcon, CheckIcon, ClockIcon, ExternalIcon, EyeIcon, FilmIcon, PlayIcon, StarIcon,
} from "../components/icons";
import VideoPlayer from "../components/VideoPlayer";
import { Alert, Avatar, EmptyState, FullPageSpinner, Spinner } from "../components/ui";
import { useI18n } from "../i18n";

const MAX_COMMENT = 1000;

function formatRate(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

const LANG_NAMES: Record<string, string> = { en: "English", fr: "Français", es: "Español", de: "Deutsch", it: "Italiano", ja: "日本語", ru: "Русский", pt: "Português", nl: "Nederlands", sv: "Svenska" };

function Stream({ movie, onSubtitlesMaybeChanged }: { movie: MovieDetail; onSubtitlesMaybeChanged: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const readyOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let ticks = 0;
    readyOnce.current = false;
    setStatus(null);
    setFailed(false);
    const poll = async (first: boolean) => {
      try {
        const s = await api<StreamStatus>(`/movies/${movie.id}/stream`, { method: first ? "POST" : "GET" });
        if (cancelled) return;
        setStatus(s);
        if (s.ready) readyOnce.current = true;
        ticks += 1;
        if (ticks % 6 === 0) onSubtitlesMaybeChanged();
        const done = s.state === "error" || (s.state === "complete" && (s.mode !== "transcode" || !!s.duration));
        if (done) {
          if (s.state === "complete") onSubtitlesMaybeChanged();
          return;
        }
        timer = window.setTimeout(() => void poll(false), readyOnce.current ? 4000 : 1500);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void poll(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, attempt]);

  const movieLang = movie.language ?? "en";
  const preferred = user?.language ?? "en";
  const defaultSub = preferred !== movieLang ? preferred : null;

  if (failed || status?.state === "error") {
    return (
      <div className="stream-box">
        <div className="stream-state">
          <Alert>{status?.error ?? t("movie.stream_error")}</Alert>
          <button className="btn primary" onClick={() => setAttempt((a) => a + 1)}>{t("movie.retry")}</button>
        </div>
      </div>
    );
  }

  const ready = !!status && (status.ready || readyOnce.current) && status.mode !== null && (status.mode === "native" || !!status.duration || status.state === "complete");
  if (!ready) {
    return (
      <div className="stream-box">
        {movie.backdrop_url && <div className="stream-bg" style={{ backgroundImage: `url("${movie.backdrop_url}")` }} />}
        <div className="stream-state">
          <Spinner size={42} />
          <h3>{t("movie.ready_in")}</h3>
          <p className="muted">
            {!status || status.state === "preparing" || status.state === "idle"
              ? t("movie.preparing")
              : t("movie.buffering", { p: Math.round(status.buffer), rate: formatRate(status.download_rate), peers: status.peers })}
          </p>
          <div className="meter"><div style={{ width: `${Math.max(3, Math.min(100, status?.buffer ?? 0))}%` }} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="stream-ready">
      <VideoPlayer
        movieId={movie.id}
        mode={status!.mode!}
        knownDuration={status!.duration}
        subtitles={movie.available_subtitles}
        defaultSubtitle={defaultSub}
        poster={movie.backdrop_url}
      />
      <div className="stream-meta">
        {status!.state === "complete" ? (
          <span className="pill success"><CheckIcon width={14} height={14} />{t("movie.downloaded")}</span>
        ) : (
          <span className="pill">
            <span className="pulse" />{t("movie.downloading", { p: status!.progress.toFixed(1) })} · {formatRate(status!.download_rate)}/s
          </span>
        )}
        {status!.mode === "transcode" && status!.container && (
          <span className="pill">{t("movie.converting", { c: status!.container.toUpperCase() })}</span>
        )}
      </div>
    </div>
  );
}

function Comments({ movieId, onCountChange }: { movieId: number; onCountChange: (n: number) => void }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    api<CommentItem[]>(`/movies/${movieId}/comments`, { signal: ctrl.signal })
      .then(setComments)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [movieId]);

  useEffect(() => {
    if (comments) onCountChange(comments.length);
  }, [comments, onCountChange]);

  const post = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || value.length > MAX_COMMENT) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api<CommentItem>(`/movies/${movieId}/comments`, { method: "POST", json: { comment: value } });
      setComments((list) => [c, ...(list ?? [])]);
      setText("");
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: number) => {
    const value = editText.trim();
    if (!value || value.length > MAX_COMMENT) return;
    try {
      const c = await api<CommentItem>(`/comments/${id}`, { method: "PATCH", json: { comment: value } });
      setComments((list) => (list ?? []).map((x) => (x.id === id ? c : x)));
      setEditing(null);
    } catch {
      setError(t("err.generic"));
    }
  };

  const remove = async (id: number) => {
    try {
      await api(`/comments/${id}`, { method: "DELETE" });
      setComments((list) => (list ?? []).filter((x) => x.id !== id));
    } catch {
      setError(t("err.generic"));
    }
  };

  const left = MAX_COMMENT - text.length;
  return (
    <section className="comments">
      <h2>{t("movie.comments")} {comments && <span className="count">{comments.length}</span>}</h2>
      {user && (
        <form className="comment-form" onSubmit={post}>
          <Avatar url={user.profile_picture_url} name={user.username} first={user.first_name} last={user.last_name} size={40} />
          <div className="comment-input">
            <textarea value={text} maxLength={MAX_COMMENT} rows={3} placeholder={t("movie.comment_placeholder")}
              aria-label={t("movie.comment_placeholder")} onChange={(e) => setText(e.target.value)} />
            <div className="comment-form-foot">
              <span className={`muted small ${left < 100 ? "warn" : ""}`}>{t("movie.chars_left", { n: left })}</span>
              <button className="btn primary small" disabled={busy || !text.trim()}>{busy ? <Spinner size={16} /> : t("movie.post")}</button>
            </div>
          </div>
        </form>
      )}
      {error && <Alert>{error}</Alert>}
      {comments === null ? (
        <div className="load-more"><Spinner /></div>
      ) : comments.length === 0 ? (
        <p className="muted no-comments">{t("movie.no_comments")}</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Link to={`/users/${c.user_id}`} aria-label={c.username}>
                <Avatar url={c.author_picture_url} name={c.username} size={40} />
              </Link>
              <div className="comment-body">
                <div className="comment-head">
                  <Link to={`/users/${c.user_id}`} className="comment-author">{c.username}</Link>
                  <time dateTime={c.date}>{formatDate(c.date, lang)}</time>
                  {c.updated_at && <span className="muted small">· {t("movie.edited")}</span>}
                </div>
                {editing === c.id ? (
                  <div className="comment-edit">
                    <textarea value={editText} maxLength={MAX_COMMENT} rows={3} onChange={(e) => setEditText(e.target.value)}
                      aria-label={t("movie.edit")} />
                    <div className="comment-actions">
                      <button className="btn primary small" onClick={() => void saveEdit(c.id)} disabled={!editText.trim()}>{t("movie.save")}</button>
                      <button className="btn ghost small" onClick={() => setEditing(null)}>{t("movie.cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <p className="comment-text">{c.comment}</p>
                )}
                {user?.id === c.user_id && editing !== c.id && (
                  <div className="comment-actions">
                    <button className="link-btn" onClick={() => { setEditing(c.id); setEditText(c.comment); }}>{t("movie.edit")}</button>
                    <button className="link-btn danger" onClick={() => void remove(c.id)}>{t("movie.delete")}</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MoviePage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(params.get("play") === "1");
  const playerRef = useRef<HTMLDivElement>(null);
  const movieId = Number(id);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setMovie(await api<MovieDetail>(`/movies/${movieId}`, { signal }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else if (!(e instanceof DOMException)) setFailed(true);
    }
  }, [movieId]);

  useEffect(() => {
    setMovie(null);
    setNotFound(false);
    setFailed(false);
    setPlaying(params.get("play") === "1");
    if (!Number.isInteger(movieId) || movieId <= 0) {
      setNotFound(true);
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, load]);

  const refreshSubtitles = useCallback(() => {
    api<MovieDetail>(`/movies/${movieId}`)
      .then((m) => setMovie((prev) => (prev ? { ...prev, available_subtitles: m.available_subtitles, downloaded: m.downloaded } : m)))
      .catch(() => undefined);
  }, [movieId]);

  const setCount = useCallback((n: number) => {
    setMovie((m) => (m && m.comments_count !== n ? { ...m, comments_count: n } : m));
  }, []);

  const startPlaying = () => {
    setPlaying(true);
    if (params.get("play")) {
      const next = new URLSearchParams(params);
      next.delete("play");
      setParams(next, { replace: true });
    }
    window.setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  if (notFound) {
    return (
      <div className="container page-pad">
        <EmptyState icon={<FilmIcon width={28} height={28} />} title={t("movie.not_found")}>
          <Link to="/" className="btn primary">{t("movie.back")}</Link>
        </EmptyState>
      </div>
    );
  }
  if (failed) return <div className="container page-pad"><Alert>{t("err.generic")}</Alert></div>;
  if (!movie) return <FullPageSpinner />;

  const art = movie.backdrop_url ?? movie.cover_url;
  return (
    <div className="movie-page">
      <section className="movie-hero">
        {art && <div className={`movie-hero-bg ${movie.backdrop_url ? "" : "blurred"}`} style={{ backgroundImage: `url("${art}")` }} />}
        <div className="container movie-hero-inner">
          <Link to="/" className="back-link"><ArrowLeftIcon width={18} height={18} />{t("movie.back")}</Link>
          <div className="movie-head">
            <div className="movie-poster">
              {movie.cover_url ? <img src={movie.cover_url} alt={movie.name} referrerPolicy="no-referrer" />
                : <div className="poster-fallback"><FilmIcon width={40} height={40} /></div>}
            </div>
            <div className="movie-headline">
              {movie.watched && <span className="pill"><EyeIcon width={14} height={14} />{t("lib.watched")}</span>}
              <h1>{movie.name}</h1>
              <div className="meta-line">
                {movie.rating !== null && (
                  <span className="rating-inline big" title={movie.rating_source ?? undefined}>
                    <StarIcon width={16} height={16} />{movie.rating.toFixed(1)}<small>/10 TMDb</small>
                  </span>
                )}
                <span><CalendarIcon width={16} height={16} />{movie.year ?? t("movie.unknown")}</span>
                {movie.length && <span><ClockIcon width={16} height={16} />{t("movie.min", { n: movie.length })}</span>}
                {movie.available_subtitles.length > 0 && (
                  <span><CaptionsIcon width={16} height={16} />{movie.available_subtitles.map((s) => s.lang.toUpperCase()).join(" · ")}</span>
                )}
              </div>
              <div className="chips">{movie.genres.map((g) => <span key={g} className="chip">{g}</span>)}</div>
              {!playing && (
                <div className="hero-actions">
                  <button className="btn primary lg" onClick={startPlaying}>
                    <PlayIcon width={18} height={18} />{movie.watched ? t("movie.resume") : t("movie.play")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container movie-body">
        {playing && <div ref={playerRef} className="player-section"><Stream movie={movie} onSubtitlesMaybeChanged={refreshSubtitles} /></div>}

        <div className="movie-columns">
          <div className="movie-main">
            <section>
              <h2>{t("movie.summary")}</h2>
              <p className="summary">{movie.summary || t("movie.no_summary")}</p>
            </section>
            {movie.cast.length > 0 && (
              <section>
                <h2>{t("movie.cast")}</h2>
                <ul className="cast-grid">
                  {movie.cast.map((c) => (
                    <li key={c.name + c.character}>
                      <Avatar url={c.photo} name={c.name} size={64} first={c.name.split(" ")[0]} last={c.name.split(" ").slice(-1)[0]} />
                      <strong>{c.name}</strong>
                      {c.character && <span>{c.character}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Comments movieId={movie.id} onCountChange={setCount} />
          </div>
          <aside className="movie-side">
            <dl className="facts">
              <div><dt>{t("movie.director")}</dt><dd>{movie.directors.join(", ") || t("movie.unknown")}</dd></div>
              {movie.producers.length > 0 && <div><dt>{t("movie.producers")}</dt><dd>{movie.producers.join(", ")}</dd></div>}
              {movie.cast.length > 0 && <div><dt>{t("movie.cast")}</dt><dd>{movie.cast.slice(0, 4).map((c) => c.name).join(", ")}</dd></div>}
              <div><dt>{t("movie.language")}</dt><dd>{movie.language ? LANG_NAMES[movie.language] ?? movie.language.toUpperCase() : t("movie.unknown")}</dd></div>
              <div><dt>{t("movie.subtitles")}</dt><dd>{movie.available_subtitles.length ? movie.available_subtitles.map((s) => s.label).join(", ") : t("movie.no_subtitles")}</dd></div>
              <div>
                <dt>{t("movie.source")}</dt>
                <dd>
                  {movie.source === "archive" ? "Internet Archive" : "PeerTube"}
                  {movie.source_url && (
                    <a className="link source-link" href={movie.source_url} target="_blank" rel="noopener noreferrer">
                      {t("movie.view_source")} <ExternalIcon width={14} height={14} />
                    </a>
                  )}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
