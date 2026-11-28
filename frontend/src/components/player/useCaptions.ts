import { useEffect, useState } from "react";
import type { SubtitleInfo } from "../../api/client";
import {
  activeCaption,
  parseCaptions,
  selectedTrack,
  type CaptionCue,
  type SubtitleChoice,
} from "./captions";

export function useCaptions(
  tracks: SubtitleInfo[],
  preferred: string | null,
  streamOffset: number,
  mediaTime: number,
) {
  const [choice, setChoice] = useState<SubtitleChoice>(undefined);
  const track = selectedTrack(tracks, choice, preferred);
  const url = track?.url;
  const [loaded, setLoaded] = useState<{ url: string; cues: CaptionCue[] }>();

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const { signal } = controller;
    void fetch(url, { credentials: "same-origin", signal })
      .then((response) => (response.ok ? response.text() : ""))
      .then(async (text) => {
        if (signal.aborted) return;
        const cues = text ? await parseCaptions(text) : [];
        if (!signal.aborted) setLoaded({ url, cues });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [url]);

  return {
    language: track?.lang ?? null,
    select: (language: string | null) => setChoice(language),
    cue:
      loaded && url === loaded.url
        ? activeCaption(loaded.cues, streamOffset, mediaTime)
        : undefined,
  };
}
