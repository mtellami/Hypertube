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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function bufferedAhead(video: HTMLVideoElement): number {
  const b = video.buffered;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= video.currentTime + 0.5 && video.currentTime <= b.end(i))
      return b.end(i) - video.currentTime;
  }
  return 0;
}

function waitIdle(sb: SourceBuffer, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!sb.updating) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      removeListeners();
      resolve();
    };
    const fail = () => {
      removeListeners();
      reject(new Error("Media buffer update failed"));
    };
    const abort = () => {
      removeListeners();
      reject(signal.reason);
    };
    function removeListeners() {
      sb.removeEventListener("updateend", finish);
      sb.removeEventListener("error", fail);
      sb.removeEventListener("abort", fail);
      signal.removeEventListener("abort", abort);
    }
    sb.addEventListener("updateend", finish);
    sb.addEventListener("error", fail);
    sb.addEventListener("abort", fail);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function append(
  sb: SourceBuffer,
  data: Uint8Array,
  video: HTMLVideoElement,
  signal: AbortSignal,
) {
  for (let attempt = 1; ; attempt++) {
    await waitIdle(sb, signal);
    signal.throwIfAborted();
    try {
      sb.appendBuffer(data as BufferSource);
      await waitIdle(sb, signal);
      return;
    } catch (e) {
      if (
        attempt === 3 ||
        !(e instanceof DOMException) ||
        e.name !== "QuotaExceededError"
      )
        throw e;
      // Buffer full: drop what is well behind the playhead, then retry.
      const end = video.currentTime - BEHIND_KEEP;
      if (end > 0) {
        sb.remove(0, end);
        await waitIdle(sb, signal);
      } else {
        await sleep(1000, signal);
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
  const { signal } = ctrl;
  let urlRevoked = false;
  const revokeUrl = () => {
    if (urlRevoked) return;
    URL.revokeObjectURL(objectUrl);
    urlRevoked = true;
  };

  const open = async () => {
    if (signal.aborted) return;
    revokeUrl();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let finished = false;
    try {
      const sb = ms.addSourceBuffer(mime);
      const res = await fetch(url, {
        credentials: "same-origin",
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      reader = res.body.getReader();
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
        await append(sb, data, video, signal);
      };
      let first = true;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          break;
        }
        pending.push(value);
        size += value.length;
        if (first || size >= CHUNK) {
          first = false; // send the init segment immediately so playback can start
          while (bufferedAhead(video) > AHEAD_LIMIT) await sleep(1000, signal);
          signal.throwIfAborted();
          await flush();
        }
      }
      await flush();
      await waitIdle(sb, signal);
      if (!signal.aborted && ms.readyState === "open") {
        ms.endOfStream();
      }
    } catch {
      if (!signal.aborted) onError();
    } finally {
      if (reader) {
        if (!finished) void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
  };

  ms.addEventListener("sourceopen", open, { once: true });
  video.src = objectUrl;
  return () => {
    ctrl.abort();
    ms.removeEventListener("sourceopen", open);
    revokeUrl();
    if (video.src === objectUrl) {
      video.removeAttribute("src");
      video.load();
    }
  };
}
