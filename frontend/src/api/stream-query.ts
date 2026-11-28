import type {
  QueryClient,
  QueryFunctionContext,
  QueryKey,
} from "@tanstack/react-query";
import { api, type StreamStatus } from "./client";

export function requestStream(
  client: QueryClient,
  key: QueryKey,
  movieId: number,
  context: QueryFunctionContext,
) {
  const started = client.getQueryData<StreamStatus>(key);
  // Starting a stream is a side effect. Let its response populate the shared query
  // even if React briefly unsubscribes during StrictMode's development remount.
  // Polling requests can safely be cancelled when the player unmounts.
  return api<StreamStatus>(
    `/movies/${movieId}/stream`,
    started ? { signal: context.signal } : { method: "POST" },
  );
}
