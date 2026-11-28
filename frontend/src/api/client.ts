export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  language: Lang;
  created_at: string;
  email?: string;
  has_password?: boolean;
  oauth_providers?: string[];
  api_client_id?: string | null;
}

export type Lang = "en" | "fr" | "es";

export interface MovieCard {
  id: number;
  name: string;
  year: number | null;
  rating: number | null;
  cover_url: string | null;
  genres: string[];
  source: string;
  watched: boolean;
}

export interface LibraryPage {
  results: MovieCard[];
  page: number;
  total: number;
  has_more: boolean;
  genres: string[];
  warning: string | null;
}

export interface CastMember {
  name: string;
  character: string;
  photo: string | null;
}

export interface SubtitleInfo {
  id: number;
  lang: string;
  label: string;
  url: string;
}

export interface MovieDetail {
  id: number;
  name: string;
  year: number | null;
  rating: number | null;
  rating_source: string | null;
  length: number | null;
  cover_url: string | null;
  backdrop_url: string | null;
  summary: string | null;
  genres: string[];
  language: string | null;
  directors: string[];
  producers: string[];
  cast: CastMember[];
  imdb_id: string | null;
  source: string;
  source_url: string | null;
  available_subtitles: SubtitleInfo[];
  comments_count: number;
  watched: boolean;
  downloaded: boolean;
}

export interface StreamStatus {
  state: "idle" | "preparing" | "downloading" | "complete" | "error";
  progress: number;
  buffer: number;
  download_rate: number;
  peers: number;
  ready: boolean;
  mode: "native" | "transcode" | null;
  container: string | null;
  duration: number | null;
  error: string | null;
  height: number | null;
  qualities: number[];
  mse_type: string | null;
  mse_type_converted: string | null;
}

export interface CommentItem {
  id: number;
  comment: string;
  username: string;
  user_id: number;
  author_picture_url: string | null;
  movie_id: number;
  date: string;
  updated_at: string | null;
}

/** UI endpoints report expected failures as {ok:false} with HTTP 200. */
export interface FormResult {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
  user?: User;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api<T>(
  path: string,
  options: {
    method?: string;
    json?: unknown;
    form?: FormData;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "X-Requested-With": "hypertube",
    Accept: "application/json",
  };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    credentials: "same-origin",
    signal: options.signal,
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, "Unauthorized");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data && (data.detail as string)) || res.statusText,
    );
  }
  return data as T;
}
