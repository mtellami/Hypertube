import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

export const sessionKey = ["session"] as const;
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (attempt, error) =>
        !(
          error instanceof ApiError && [401, 403, 404].includes(error.status)
        ) && attempt < 1,
    },
    mutations: { retry: false },
  },
});
