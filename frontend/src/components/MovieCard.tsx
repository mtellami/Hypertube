import { useState } from "react";
import { Link } from "react-router-dom";
import type { MovieCard as Movie } from "../api";
import { useI18n } from "../i18n";
import { EyeIcon, FilmIcon, StarIcon } from "./icons";

export default function MovieCard({ movie, index = 0 }: { movie: Movie; index?: number }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  return (
    <Link to={`/movies/${movie.id}`} className={`movie-card ${movie.watched ? "is-watched" : ""}`}
      style={{ animationDelay: `${Math.min(index % 24, 12) * 30}ms` }}>
      <div className={`poster ${loaded ? "loaded" : ""}`}>
        {movie.cover_url && !broken ? (
          <img src={movie.cover_url} alt="" loading="lazy" referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />
        ) : (
          <div className="poster-fallback"><FilmIcon width={34} height={34} /><span>{movie.name}</span></div>
        )}
        <div className="poster-shade" />
        {movie.rating !== null && (
          <span className="badge rating" title="TMDb"><StarIcon width={12} height={12} />{movie.rating.toFixed(1)}</span>
        )}
        {movie.watched && (
          <span className="badge watched"><EyeIcon width={12} height={12} />{t("lib.watched")}</span>
        )}
      </div>
      <div className="card-body">
        <h3 title={movie.name}>{movie.name}</h3>
        <p>
          <span>{movie.year ?? "—"}</span>
          {movie.genres.length > 0 && <span className="dot">{movie.genres.slice(0, 2).join(", ")}</span>}
        </p>
      </div>
    </Link>
  );
}

export function MovieCardSkeleton() {
  return (
    <div className="movie-card skeleton" aria-hidden="true">
      <div className="poster shimmer" />
      <div className="card-body">
        <div className="line shimmer" />
        <div className="line short shimmer" />
      </div>
    </div>
  );
}
