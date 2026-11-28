import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { LuFilm } from "react-icons/lu";
import { ApiError } from "../api/client";
import { useMovieQuery } from "../api/queries";
import { useI18n } from "../common/i18n";
import { Alert, Avatar, EmptyState, FullPageSpinner } from "../components/ui";
import { buttonStyles } from "../components/ui-styles";
import { hasUserActivation } from "../components/player/playback";
import MovieComments from "./movie/MovieComments";
import MovieFacts from "./movie/MovieFacts";
import MovieHero from "./movie/MovieHero";
import MovieStream from "./movie/MovieStream";

export default function MoviePage() {
  const { id } = useParams();
  return <MovieDetails key={id} movieId={Number(id)} />;
}

function MovieDetails({ movieId }: { movieId: number }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState(
    () => params.get("play") === "1" && hasUserActivation(),
  );
  const [pollUntil, setPollUntil] = useState(() =>
    playing ? Date.now() + 60_000 : 0,
  );
  const playerRef = useRef<HTMLDivElement>(null);
  const movieQuery = useMovieQuery(movieId, pollUntil);
  const movie = movieQuery.data;
  const notFound =
    !Number.isInteger(movieId) ||
    movieId <= 0 ||
    (movieQuery.error instanceof ApiError && movieQuery.error.status === 404);
  const failed = movieQuery.isError && !movie && !notFound;
  const scrollTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(scrollTimer.current), []);
  const refreshSubtitles = useCallback(() => {
    void movieQuery.refetch();
  }, [movieQuery.refetch]);

  const startPlaying = () => {
    setPlaying(true);
    setPollUntil(Date.now() + 60_000);
    if (params.get("play")) {
      const next = new URLSearchParams(params);
      next.delete("play");
      setParams(next, { replace: true });
    }
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(
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

  return (
    <div className="movie-page">
      <MovieHero movie={movie} playing={playing} startPlaying={startPlaying} />

      <div className="content-shell w-full max-w-360 p-[0_var(--gutter)] pb-10 my-0 mx-auto">
        {playing && (
          <div
            ref={playerRef}
            className="player-section [margin:8px_0_40px] [scroll-margin-top:calc(var(--header-h)_+_20px)]"
          >
            <MovieStream
              movie={movie}
              onSubtitlesMaybeChanged={refreshSubtitles}
            />
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
            <MovieComments movieId={movie.id} />
          </div>
          <MovieFacts movie={movie} />
        </div>
      </div>
    </div>
  );
}
