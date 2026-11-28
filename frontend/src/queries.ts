import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  api,
  type LibraryPage,
  type MovieCard,
  type MovieDetail,
  type User,
  type CommentItem,
} from "./api";
import { useAuth } from "./auth";

export function useViewerKey() {
  const { user, language } = useAuth();
  return ["viewer", user?.id, language] as const;
}

export function useLibraryQuery(params: URLSearchParams) {
  const viewer = useViewerKey();
  const filters = new URLSearchParams();
  for (const key of [
    "q",
    "genre",
    "min_rating",
    "year_min",
    "year_max",
    "sort",
    "order",
  ]) {
    const value = params.get(key)?.trim();
    if (value) filters.set(key, value);
  }
  return useInfiniteQuery({
    queryKey: [...viewer, "library", filters.toString()],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const qs = new URLSearchParams(filters);
      qs.set("page", String(pageParam));
      return api<LibraryPage>(`/library?${qs}`, { signal });
    },
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });
}

export function useMovieQuery(id: number, pollUntil = 0) {
  const viewer = useViewerKey();
  return useQuery({
    queryKey: [...viewer, "movie", id],
    queryFn: ({ signal }) => api<MovieDetail>(`/movies/${id}`, { signal }),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: () => (Date.now() < pollUntil ? 3000 : false),
  });
}

export function useCommentsQuery(id: number) {
  const viewer = useViewerKey();
  return useQuery({
    queryKey: [...viewer, "comments", id],
    queryFn: ({ signal }) =>
      api<CommentItem[]>(`/movies/${id}/comments`, { signal }),
  });
}

export function useProfileQueries(id: number) {
  const viewer = useViewerKey();
  const enabled = Number.isInteger(id) && id > 0;
  const profile = useQuery({
    queryKey: [...viewer, "profile", id],
    queryFn: ({ signal }) => api<User>(`/users/${id}`, { signal }),
    enabled,
  });
  const watched = useQuery({
    queryKey: [...viewer, "watched", id],
    queryFn: ({ signal }) =>
      api<MovieCard[]>(`/users/${id}/watched`, { signal }),
    enabled,
  });
  return { profile, watched };
}

export function usePostersQuery() {
  return useQuery({
    queryKey: ["posters"],
    queryFn: ({ signal }) =>
      api<{ cover_url: string | null }[]>("/movies", { signal }),
    staleTime: 300_000,
  });
}

export function useOAuthProvidersQuery() {
  return useQuery({
    queryKey: ["oauth-providers"],
    queryFn: ({ signal }) =>
      api<{ providers: string[] }>("/auth/oauth/providers", { signal }),
    staleTime: 300_000,
  });
}
