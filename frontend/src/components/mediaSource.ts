/**
 * Feeds a progressive fragmented-MP4 HTTP stream (produced on the fly by ffmpeg) into a
 * <video> element through the Media Source Extensions API: the response body is read
 * chunk by chunk and appended to a SourceBuffer, with back-pressure so the browser never
 * holds more than ~90 s of video ahead of the playhead.
 */

const AHEAD_LIMIT = 90; // seconds buffered ahead before we pause reading the network
const BEHIND_KEEP = 20; // seconds kept behind the playhead when the buffer is full
const CHUNK = 256 * 1024; // coalesce network chunks into appends of this size

export function mseSupported(mime: string | null | undefined): mime is string {
  return (
    !!mime &&
    typeof window.MediaSource !== "undefined" &&
    MediaSource.isTypeSupported(mime)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bufferedAhead(video: HTMLVideoElement): number {
  const b = video.buffered;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= video.currentTime + 0.5 && video.currentTime <= b.end(i))
      return b.end(i) - video.currentTime;
  }
  return 0;
}

function waitIdle(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve();
  return new Promise((resolve) =>
    sb.addEventListener("updateend", () => resolve(), { once: true }),
  );
}

async function append(
  sb: SourceBuffer,
  data: Uint8Array,
  video: HTMLVideoElement,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitIdle(sb);
    if (signal.aborted) return;
    try {
      sb.appendBuffer(data as BufferSource);
      await waitIdle(sb);
      return;
    } catch (e) {
      if (!(e instanceof DOMException) || e.name !== "QuotaExceededError")
        throw e;
      // Buffer full: drop what is well behind the playhead, then retry.
      const end = video.currentTime - BEHIND_KEEP;
      if (end > 0) {
        sb.remove(0, end);
        await waitIdle(sb);
      } else {
        await sleep(1000);
      }
    }
  }
}

/** Attach `url` to `video` via MediaSource. Returns a cleanup function that stops streaming. */
export function attachMediaSource(
  video: HTMLVideoElement,
  url: string,
  mime: string,
  onError: () => void,
): () => void {
  const ms = new MediaSource();
  const objectUrl = URL.createObjectURL(ms);
  const ctrl = new AbortController();

  ms.addEventListener(
    "sourceopen",
    async () => {
      URL.revokeObjectURL(objectUrl);
      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer(mime);
      } catch {
        onError();
        return;
      }
      try {
        const res = await fetch(url, {
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        let pending: Uint8Array[] = [];
        let size = 0;
        const flush = async () => {
          if (!size) return;
          const data = new Uint8Array(size);
          let pos = 0;
          for (const p of pending) {
            data.set(p, pos);
            pos += p.length;
          }
          pending = [];
          size = 0;
          await append(sb, data, video, ctrl.signal);
        };
        let first = true;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          pending.push(value);
          size += value.length;
          if (first || size >= CHUNK) {
            first = false; // send the init segment immediately so playback can start
            while (!ctrl.signal.aborted && bufferedAhead(video) > AHEAD_LIMIT)
              await sleep(1000);
            if (ctrl.signal.aborted) return;
            await flush();
          }
        }
        await flush();
        if (ms.readyState === "open") {
          await waitIdle(sb);
          ms.endOfStream();
        }
      } catch {
        if (!ctrl.signal.aborted) onError();
      }
    },
    { once: true },
  );

  video.src = objectUrl;
  return () => ctrl.abort();
}
