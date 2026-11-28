import { useCallback, useEffect, useRef, useState } from "react";
import { attachMediaSource, mseSupported } from "./mediaSource";
import { hasUserActivation } from "./playback";

interface Source {
  movieId: number;
  mode: "native" | "transcode";
  knownDuration: number | null;
  mseType: string | null;
  mseTypeConverted: string | null;
}

export function usePlayback({
  movieId,
  mode,
  knownDuration,
  mseType,
  mseTypeConverted,
}: Source) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [offset, setOffset] = useState(0);
  const [quality, setQuality] = useState<number | null>(null);
  const [mediaTime, setMediaTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState(false);
  const [audio, setAudio] = useState({ volume: 1, muted: false });
  const audioRef = useRef(audio);
  const playIntent = useRef<boolean>();
  const pendingSeek = useRef<number>();

  const converted = mode === "transcode" || quality !== null;
  const streamOffset = converted ? offset : 0;
  const endpoint = `/api/movies/${movieId}/stream/video`;
  const src = converted
    ? `${endpoint}?start=${offset.toFixed(2)}${quality === null ? "" : `&quality=${quality}`}`
    : endpoint;
  const mime = quality === null ? mseType : mseTypeConverted;
  const mediaSourceMime = converted && mseSupported(mime) ? mime : null;
  const delivery = converted
    ? mediaSourceMime
      ? "mediasource"
      : "progressive"
    : "ranges";
  const sourceKey = `${src}:${mediaSourceMime ?? delivery}`;
  const duration = converted ? (knownDuration ?? 0) : mediaDuration;
  const time = streamOffset + mediaTime;
  const bufferedPct = duration
    ? Math.min(100, ((streamOffset + buffered) / duration) * 100)
    : 0;

  const play = useCallback((video: HTMLVideoElement) => {
    playIntent.current = true;
    void video.play().catch((error: unknown) => {
      if (
        videoRef.current === video &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        playIntent.current = false;
        setWaiting(false);
      }
    });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(false);
    setPlaying(false);
    setMediaTime(0);
    setMediaDuration(0);
    setBuffered(0);
    video.volume = audioRef.current.volume;
    video.muted = audioRef.current.muted;
    const detach = mediaSourceMime
      ? attachMediaSource(video, src, mediaSourceMime, () => {
          if (videoRef.current === video) {
            setError(true);
            setWaiting(false);
          }
        })
      : undefined;
    if (!detach) video.src = src;

    const autoplay = playIntent.current ?? hasUserActivation();
    setWaiting(autoplay);
    if (autoplay) play(video);

    return () => {
      if (detach) detach();
      else {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [src, mediaSourceMime, play]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) play(video);
    else {
      playIntent.current = false;
      video.pause();
    }
  }, [play]);

  const seekTo = useCallback(
    (target: number) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      const position = Math.max(0, Math.min(duration - 1, target));
      if (!converted) video.currentTime = position;
      else if (position.toFixed(2) === offset.toFixed(2)) video.currentTime = 0;
      else {
        setMediaTime(0);
        setOffset(position);
      }
    },
    [duration, converted, offset],
  );

  const chooseQuality = (next: number | null) => {
    if (next === quality) return;
    pendingSeek.current = next === null && mode === "native" ? time : undefined;
    if (pendingSeek.current === undefined) setOffset(Math.max(0, time));
    setMediaTime(0);
    setQuality(next);
  };

  const updateBuffered = (video: HTMLVideoElement) => {
    const ranges = video.buffered;
    setBuffered(ranges.length ? ranges.end(ranges.length - 1) : 0);
  };

  const onPlay = () => {
    playIntent.current = true;
    setPlaying(true);
  };
  const onPause = () => {
    playIntent.current = false;
    setPlaying(false);
  };
  const syncTime = (video: HTMLVideoElement) => {
    setMediaTime(video.currentTime);
    updateBuffered(video);
  };
  const syncDuration = (video: HTMLVideoElement) => {
    if (Number.isFinite(video.duration)) setMediaDuration(video.duration);
  };
  const onLoadedMetadata = (video: HTMLVideoElement) => {
    if (pendingSeek.current !== undefined) {
      video.currentTime = pendingSeek.current;
      pendingSeek.current = undefined;
    }
  };
  const syncAudio = (video: HTMLVideoElement) => {
    audioRef.current = { volume: video.volume, muted: video.muted };
    setAudio(audioRef.current);
  };
  const toggleMute = () => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  };
  const setVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
  };
  const onMediaError = (video: HTMLVideoElement) => {
    if (!video.error) return;
    setError(true);
    setWaiting(false);
  };

  return {
    videoRef,
    sourceKey,
    delivery,
    streamOffset,
    mediaTime,
    time,
    duration,
    quality,
    chooseQuality,
    seekTo,
    bufferedPct,
    playing,
    waiting,
    error,
    audio,
    togglePlay,
    toggleMute,
    setVolume,
    setWaiting,
    onPlay,
    onPause,
    syncTime,
    syncDuration,
    onLoadedMetadata,
    updateBuffered,
    syncAudio,
    onMediaError,
  };
}
