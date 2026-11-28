import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useViewerKey } from "../../api/queries";
import { requestStream } from "../../api/stream-query";

export function useStreamStatus(movieId: number, refreshSubtitles: () => void) {
  const client = useQueryClient();
  const viewer = useViewerKey();
  const [attempt, setAttempt] = useState(0);
  const readyOnce = useRef(false);
  const ticks = useRef(0);
  const streamKey = [...viewer, "stream", movieId, attempt];
  const stream = useQuery({
    queryKey: streamKey,
    queryFn: (context) => requestStream(client, streamKey, movieId, context),
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
  }, [movieId, attempt]);
  useEffect(() => {
    if (!status) return;
    if (status.ready) readyOnce.current = true;
    ticks.current += 1;
    if (ticks.current % 6 === 0 || status.state === "complete")
      refreshSubtitles();
  }, [stream.dataUpdatedAt, status, refreshSubtitles]);

  const ready =
    !!status &&
    (status.ready || readyOnce.current) &&
    status.mode !== null &&
    (status.mode === "native" ||
      !!status.duration ||
      status.state === "complete");
  return {
    status,
    failed,
    ready,
    retry: () => setAttempt((value) => value + 1),
  };
}
