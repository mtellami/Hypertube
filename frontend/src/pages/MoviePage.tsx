import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMovieQuery, useCommentsQuery, useViewerKey } from "../queries";
import { requestStream } from "../stream-query";
import { buttonStyles, textAreaStyles } from "../components/ui-styles";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  api,
  formatDate,
  type CommentItem,
  type MovieDetail,
} from "../api";
import { useAuth } from "../auth";
import {
  LuArrowLeft,
  LuCalendar,
  LuCaptions,
  LuCheck,
  LuClock,
  LuExternalLink,
  LuEye,
  LuFilm,
  LuPlay,
  LuStar,
} from "react-icons/lu";
import VideoPlayer, { hasUserActivation } from "../components/VideoPlayer";
import {
  Alert,
  Avatar,
  EmptyState,
  FullPageSpinner,
  Spinner,
} from "../components/ui";
import { useI18n } from "../i18n";

const MAX_COMMENT = 1000;
const EMPTY_COMMENTS: CommentItem[] = [];

function formatRate(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

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

function Stream({
  movie,
  onSubtitlesMaybeChanged,
}: {
  movie: MovieDetail;
  onSubtitlesMaybeChanged: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const client = useQueryClient();
  const viewer = useViewerKey();
  const [attempt, setAttempt] = useState(0);
  const readyOnce = useRef(false);
  const ticks = useRef(0);
  const streamKey = [...viewer, "stream", movie.id, attempt];
  const stream = useQuery({
    queryKey: streamKey,
    queryFn: (context) => requestStream(client, streamKey, movie.id, context),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data;
      if (
        query.state.error ||
        status?.state === "error" ||
        (status?.state === "complete" &&
          (status.mode !== "transcode" || !!status.duration))
      )
        return false;
      return status?.ready || readyOnce.current ? 4000 : 1500;
    },
  });
  const status = stream.data;
  const failed = stream.isError;
  useEffect(() => {
    readyOnce.current = false;
    ticks.current = 0;
  }, [movie.id, attempt]);
  useEffect(() => {
    if (!status) return;
    if (status.ready) readyOnce.current = true;
    ticks.current += 1;
    if (ticks.current % 6 === 0 || status.state === "complete")
      onSubtitlesMaybeChanged();
  }, [stream.dataUpdatedAt, status, onSubtitlesMaybeChanged]);

  const movieLang = movie.language ?? "en";
  const preferred = user?.language ?? "en";
  const defaultSub = preferred !== movieLang ? preferred : null;

  if (failed || status?.state === "error") {
    return (
      <div className="stream-box mobile:rounded-card relative aspect-video max-h-[78vh] w-full rounded-panel overflow-hidden bg-black border border-outline grid place-items-center">
        <div className="stream-state [&_h3]:text-[1.2rem] relative z-[1] grid justify-items-center gap-3 text-center p-6">
          <Alert>{status?.error ?? t("movie.stream_error")}</Alert>
          <button
            className={buttonStyles({ variant: "primary" })}
            onClick={() => setAttempt((a) => a + 1)}
          >
            {t("movie.retry")}
          </button>
        </div>
      </div>
    );
  }

  const ready =
    !!status &&
    (status.ready || readyOnce.current) &&
    status.mode !== null &&
    (status.mode === "native" ||
      !!status.duration ||
      status.state === "complete");
  if (!ready) {
    return (
      <div className="stream-box mobile:rounded-card relative aspect-video max-h-[78vh] w-full rounded-panel overflow-hidden bg-black border border-outline grid place-items-center">
        {movie.backdrop_url && (
          <div
            className="stream-bg [filter:blur(30px)_brightness(0.35)] absolute inset-[-40px] bg-cover bg-center"
            style={{ backgroundImage: `url("${movie.backdrop_url}")` }}
          />
        )}
        <div className="stream-state [&_h3]:text-[1.2rem] relative z-[1] grid justify-items-center gap-3 text-center p-6">
          <Spinner size={42} />
          <h3>{t("movie.ready_in")}</h3>
          <p className="text-muted">
            {!status || status.state === "preparing" || status.state === "idle"
              ? t("movie.preparing")
              : t("movie.buffering", {
                  p: Math.round(status.buffer),
                  rate: formatRate(status.download_rate),
                  peers: status.peers,
                })}
          </p>
          <div
            className={`
            meter [&_div]:h-full [&_div]:bg-(image:--accent-grad) [&_div]:[transition:width_0.6s_var(--ease)]
            w-[min(320px,_70vw)] h-1 bg-white/12 rounded-full overflow-hidden
          `}
          >
            <div
              style={{
                width: `${Math.max(3, Math.min(100, status?.buffer ?? 0))}%`,
              }}
            />
          </div>
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
        sourceHeight={status!.height}
        qualities={status!.qualities}
        mseType={status!.mse_type}
        mseTypeConverted={status!.mse_type_converted}
      />
      <div className="flex gap-2.5 flex-wrap mt-3">
        {status!.state === "complete" ? (
          <span
            className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary success py-0 px-3
          `}
          >
            <LuCheck size={14} />
            {t("movie.downloaded")}
          </span>
        ) : (
          <span
            className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3
          `}
          >
            <span className="pulse shadow-[0_0_0_0_rgba(var(--accent-rgb),_0.6)] animate-[pulse_1.6s_infinite] w-2 h-2 rounded-full bg-accent" />
            {t("movie.downloading", { p: status!.progress.toFixed(1) })} ·{" "}
            {formatRate(status!.download_rate)}/s
          </span>
        )}
        {status!.mode === "transcode" && status!.container && (
          <span
            className={`
            pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
            [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
            bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3
          `}
          >
            {t("movie.converting", { c: status!.container.toUpperCase() })}
          </span>
        )}
      </div>
    </div>
  );
}

function Comments({
  movieId,
  onCountChange,
}: {
  movieId: number;
  onCountChange: (n: number) => void;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const client = useQueryClient();
  const viewer = useViewerKey();
  const commentsKey = [...viewer, "comments", movieId];
  const commentsQuery = useCommentsQuery(movieId);
  const comments =
    commentsQuery.data ?? (commentsQuery.isError ? EMPTY_COMMENTS : null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const postMutation = useMutation({
    mutationFn: (comment: string) =>
      api<CommentItem>(`/movies/${movieId}/comments`, {
        method: "POST",
        json: { comment },
      }),
    onSuccess: (comment) => {
      client.setQueryData<CommentItem[]>(commentsKey, (list) => [
        comment,
        ...(list ?? []),
      ]);
      setText("");
    },
  });
  const editMutation = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      api<CommentItem>(`/comments/${id}`, {
        method: "PATCH",
        json: { comment },
      }),
    onSuccess: (comment) => {
      client.setQueryData<CommentItem[]>(commentsKey, (list) =>
        (list ?? []).map((item) => (item.id === comment.id ? comment : item)),
      );
      setEditing(null);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: number) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) =>
      client.setQueryData<CommentItem[]>(commentsKey, (list) =>
        (list ?? []).filter((item) => item.id !== id),
      ),
  });
  const busy = postMutation.isPending;
  useEffect(() => {
    if (comments) onCountChange(comments.length);
  }, [comments, onCountChange]);
  const post = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || value.length > MAX_COMMENT || busy) return;
    setError(null);
    try {
      await postMutation.mutateAsync(value);
    } catch {
      setError(t("err.generic"));
    }
  };
  const saveEdit = async (id: number) => {
    const value = editText.trim();
    if (!value || value.length > MAX_COMMENT || editMutation.isPending) return;
    setError(null);
    try {
      await editMutation.mutateAsync({ id, comment: value });
    } catch {
      setError(t("err.generic"));
    }
  };
  const remove = async (id: number) => {
    setError(null);
    try {
      await removeMutation.mutateAsync(id);
    } catch {
      setError(t("err.generic"));
    }
  };

  const left = MAX_COMMENT - text.length;
  return (
    <section
      className={`
      comments [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2.5 [&_.count]:text-[0.8rem] [&_.count]:font-sans
      [&_.count]:bg-surface-high [&_.count]:text-secondary [&_.count]:pt-0.5 [&_.count]:pb-0.5
      [&_.count]:pl-2.5 [&_.count]:pr-2.5 [&_.count]:rounded-[999px]
    `}
    >
      <h2>
        {t("movie.comments")}{" "}
        {comments && <span className="count">{comments.length}</span>}
      </h2>
      {user && (
        <form className="flex gap-3.5 mb-6.5" onSubmit={post}>
          <Avatar
            url={user.profile_picture_url}
            name={user.username}
            first={user.first_name}
            last={user.last_name}
            size={40}
          />
          <div className="flex-1 min-w-0 grid gap-2.5">
            <textarea
              className={textAreaStyles}
              value={text}
              maxLength={MAX_COMMENT}
              rows={3}
              placeholder={t("movie.comment_placeholder")}
              aria-label={t("movie.comment_placeholder")}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-between items-center gap-2.5">
              <span
                className={`text-[0.82rem] ${left < 100 ? "text-highlight" : "text-muted"}`}
              >
                {t("movie.chars_left", { n: left })}
              </span>
              <button
                className={buttonStyles({ variant: "primary", size: "small" })}
                disabled={busy || !text.trim()}
              >
                {busy ? <Spinner size={16} /> : t("movie.post")}
              </button>
            </div>
          </div>
        </form>
      )}
      {(error || commentsQuery.isError) && (
        <Alert>{error ?? t("err.generic")}</Alert>
      )}
      {comments === null ? (
        <div className="grid place-items-center p-8.5">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-muted py-4.5 px-0">{t("movie.no_comments")}</p>
      ) : (
        <ul className="list-none m-0 p-0 grid gap-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className={`
              comment [transition:background_0.2s] animate-[rise_0.35s_var(--ease)] hover:bg-surface mobile:pt-3
              mobile:pb-3 mobile:pl-1 mobile:pr-1 flex gap-3.5 p-4 rounded-card
            `}
            >
              <Link to={`/users/${c.user_id}`} aria-label={c.username}>
                <Avatar
                  url={c.author_picture_url}
                  name={c.username}
                  size={40}
                />
              </Link>
              <div className="flex-1 min-w-0 grid gap-1.5">
                <div className="comment-head [&_time]:text-muted [&_time]:text-[0.8rem] flex items-baseline gap-2.5 flex-wrap text-[0.86rem]">
                  <Link
                    to={`/users/${c.user_id}`}
                    className="comment-author hover:text-highlight font-semibold"
                  >
                    {c.username}
                  </Link>
                  <time dateTime={c.date}>{formatDate(c.date, lang)}</time>
                  {c.updated_at && (
                    <span className="text-muted small text-[0.82rem]">
                      · {t("movie.edited")}
                    </span>
                  )}
                </div>
                {editing === c.id ? (
                  <div className="comment-edit [&_.comment-actions]:gap-2 grid gap-2.5">
                    <textarea
                      className={textAreaStyles}
                      value={editText}
                      maxLength={MAX_COMMENT}
                      rows={3}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label={t("movie.edit")}
                    />
                    <div className="comment-actions flex gap-3.5">
                      <button
                        className={buttonStyles({
                          variant: "primary",
                          size: "small",
                        })}
                        onClick={() => void saveEdit(c.id)}
                        disabled={!editText.trim()}
                      >
                        {t("movie.save")}
                      </button>
                      <button
                        className={buttonStyles({
                          variant: "ghost",
                          size: "small",
                        })}
                        onClick={() => setEditing(null)}
                      >
                        {t("movie.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary whitespace-pre-wrap wrap-anywhere">
                    {c.comment}
                  </p>
                )}
                {user?.id === c.user_id && editing !== c.id && (
                  <div className="comment-actions flex gap-3.5">
                    <button
                      className="link-btn bg-transparent hover:text-foreground [&.danger:hover]:text-danger border-0 p-0 text-muted text-[0.82rem] font-medium"
                      onClick={() => {
                        setEditing(c.id);
                        setEditText(c.comment);
                      }}
                    >
                      {t("movie.edit")}
                    </button>
                    <button
                      className="link-btn bg-transparent hover:text-foreground [&.danger:hover]:text-danger border-0 p-0 text-muted text-[0.82rem] font-medium danger"
                      onClick={() => void remove(c.id)}
                    >
                      {t("movie.delete")}
                    </button>
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
  const [playing, setPlaying] = useState(
    params.get("play") === "1" && hasUserActivation(),
  );
  const [pollUntil, setPollUntil] = useState(() =>
    playing ? Date.now() + 60_000 : 0,
  );
  const playerRef = useRef<HTMLDivElement>(null);
  const movieId = Number(id);
  const client = useQueryClient();
  const viewer = useViewerKey();
  const movieQuery = useMovieQuery(movieId, pollUntil);
  const movie = movieQuery.data;
  const notFound =
    !Number.isInteger(movieId) ||
    movieId <= 0 ||
    (movieQuery.error instanceof ApiError && movieQuery.error.status === 404);
  const failed = movieQuery.isError && !movie && !notFound;
  useEffect(() => {
    const autoPlay = params.get("play") === "1" && hasUserActivation();
    setPlaying(autoPlay);
    setPollUntil(autoPlay ? Date.now() + 60_000 : 0);
    // Only navigating to another movie resets the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);
  const refreshSubtitles = useCallback(() => {
    void movieQuery.refetch();
  }, [movieQuery.refetch]);
  const viewerId = viewer[1];
  const viewerLanguage = viewer[2];
  const setCount = useCallback(
    (count: number) => {
      client.setQueryData<MovieDetail>(
        ["viewer", viewerId, viewerLanguage, "movie", movieId],
        (movie) =>
          movie && movie.comments_count !== count
            ? { ...movie, comments_count: count }
            : movie,
      );
    },
    [client, viewerId, viewerLanguage, movieId],
  );

  const startPlaying = () => {
    setPlaying(true);
    setPollUntil(Date.now() + 60_000);
    if (params.get("play")) {
      const next = new URLSearchParams(params);
      next.delete("play");
      setParams(next, { replace: true });
    }
    window.setTimeout(
      () =>
        playerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      50,
    );
  };

  if (notFound) {
    return (
      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] pt-[calc(var(--header-h)_+_48px)] pb-16 my-0 mx-auto">
        <EmptyState icon={<LuFilm size={28} />} title={t("movie.not_found")}>
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
  if (!movie) return <FullPageSpinner />;

  const art = movie.backdrop_url ?? movie.cover_url;
  return (
    <div className="movie-page">
      <section className="movie-hero after:content-[''] after:absolute after:inset-0 after:bg-movie-overlay relative overflow-hidden pt-[var(--header-h)]">
        {art && (
          <div
            className={`movie-hero-bg [background-position:center_20%] animate-[fade-in_0.8s_ease] [&.blurred]:inset-[-60px] [&.blurred]:[filter:blur(40px)_saturate(1.3)] [&.blurred]:opacity-50 absolute inset-0 bg-cover opacity-55 ${movie.backdrop_url ? "" : "blurred"}`}
            style={{ backgroundImage: `url("${art}")` }}
          />
        )}
        <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] relative z-[2] pt-6 pb-10 my-0 mx-auto">
          <Link
            to="/"
            className="back-link [transition:color_0.2s,_gap_0.2s] hover:text-foreground hover:gap-[11px] inline-flex items-center gap-2 text-secondary text-[0.88rem] mb-6.5"
          >
            <LuArrowLeft size={18} />
            {t("movie.back")}
          </Link>
          <div className="movie-head mobile:flex-col mobile:items-start flex gap-[clamp(20px,_4vw,_44px)] items-end">
            <div
              className={`
              movie-poster shadow-[0_30px_70px_-20px_rgba(0,_0,_0,_0.9)] animate-[rise_0.5s_var(--ease)]
              [&_img]:w-full [&_img]:h-full [&_img]:object-cover mobile:w-37.5 w-[clamp(150px,_20vw,_270px)]
              shrink-0 aspect-[2/3] rounded-card overflow-hidden bg-surface-raised relative
            `}
            >
              {movie.cover_url ? (
                <img
                  src={movie.cover_url}
                  alt={movie.name}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="poster-fallback bg-poster-fallback absolute inset-0 grid place-content-center justify-items-center gap-2.5 p-4 text-center text-muted text-[0.82rem]">
                  <LuFilm size={40} />
                </div>
              )}
            </div>
            <div className="movie-headline animate-[rise_0.6s_var(--ease)] [&_h1]:text-[clamp(1.9rem,_4.6vw,_3.4rem)] [&_h1]:wrap-anywhere grid gap-3.5 justify-items-start min-w-0">
              {movie.watched && (
                <span
                  className={`
                pill [&.success]:text-success [&.success]:[background:rgba(52,_211,_153,_0.1)]
                [&.success]:border-[rgba(52,_211,_153,_0.3)] inline-flex items-center gap-[7px] h-7.5 rounded-full
                bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3
              `}
                >
                  <LuEye size={14} />
                  {t("lib.watched")}
                </span>
              )}
              <h1>{movie.name}</h1>
              <div className="meta-line [&_>_span]:inline-flex [&_>_span]:items-center [&_>_span]:gap-1.5 flex flex-wrap items-center gap-y-2 gap-x-4.5 text-secondary text-[0.92rem]">
                {movie.rating !== null && (
                  <span
                    className="rating-inline [&_small]:text-muted [&_small]:font-medium [&_small]:ml-0.5 [&.big]:text-[1.05rem] text-[#ffd166] font-bold big"
                    title={movie.rating_source ?? undefined}
                  >
                    <LuStar size={16} fill="currentColor" stroke="none" />
                    {movie.rating.toFixed(1)}
                    <small>/10 TMDb</small>
                  </span>
                )}
                <span>
                  <LuCalendar size={16} />
                  {movie.year ?? t("movie.unknown")}
                </span>
                {movie.length && (
                  <span>
                    <LuClock size={16} />
                    {t("movie.min", { n: movie.length })}
                  </span>
                )}
                {movie.available_subtitles.length > 0 && (
                  <span>
                    <LuCaptions size={16} />
                    {movie.available_subtitles
                      .map((s) => s.lang.toUpperCase())
                      .join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {movie.genres.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center h-7 rounded-full bg-white/7 border border-outline text-[0.8rem] text-secondary py-0 px-3"
                  >
                    {g}
                  </span>
                ))}
              </div>
              {!playing && (
                <div className="mt-1.5">
                  <button
                    className={buttonStyles({ variant: "primary", size: "lg" })}
                    onClick={startPlaying}
                  >
                    <LuPlay size={18} fill="currentColor" stroke="none" />
                    {movie.watched ? t("movie.resume") : t("movie.play")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] pb-10 my-0 mx-auto">
        {playing && (
          <div
            ref={playerRef}
            className="player-section [margin:8px_0_40px] [scroll-margin-top:calc(var(--header-h)_+_20px)]"
          >
            <Stream movie={movie} onSubtitlesMaybeChanged={refreshSubtitles} />
          </div>
        )}

        <div className="movie-columns compact:grid-cols-[1fr] compact:gap-8 grid grid-cols-[minmax(0,_1fr)_320px] gap-12">
          <div className="grid gap-10 content-start">
            <section>
              <h2>{t("movie.summary")}</h2>
              <p className="text-secondary text-[1.02rem] leading-[1.7] max-w-205 whitespace-pre-line">
                {movie.summary || t("movie.no_summary")}
              </p>
            </section>
            {movie.cast.length > 0 && (
              <section>
                <h2>{t("movie.cast")}</h2>
                <ul
                  className={`
                  cast-grid [&_li]:grid [&_li]:justify-items-center [&_li]:text-center [&_li]:gap-1
                  [&_li]:text-[0.84rem] [&_li_.avatar]:mb-1.5
                  [&_li_.avatar]:shadow-[0_8px_20px_-8px_rgba(0,_0,_0,_0.8)] [&_span]:text-muted
                  [&_span]:text-[0.78rem] list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,_minmax(112px,_1fr))]
                  gap-4.5
                `}
                >
                  {movie.cast.map((c) => (
                    <li key={c.name + c.character}>
                      <Avatar
                        url={c.photo}
                        name={c.name}
                        size={64}
                        first={c.name.split(" ")[0]}
                        last={c.name.split(" ").slice(-1)[0]}
                      />
                      <strong>{c.name}</strong>
                      {c.character && <span>{c.character}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Comments movieId={movie.id} onCountChange={setCount} />
          </div>
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
                    ? (LANG_NAMES[movie.language] ??
                      movie.language.toUpperCase())
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
        </div>
      </div>
    </div>
  );
}
