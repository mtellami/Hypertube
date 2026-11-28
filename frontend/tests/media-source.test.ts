import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { attachMediaSource } from "../src/components/player/mediaSource";

class FakeBuffer extends EventTarget {
  updating = false;
  attempts = 0;
  quotaExceeded = false;

  appendBuffer() {
    this.attempts++;
    if (this.quotaExceeded)
      throw new DOMException("Buffer full", "QuotaExceededError");
    this.updating = true;
  }

  remove() {}
}

function fixture(t: TestContext) {
  const buffer = new FakeBuffer();
  let media: FakeMediaSource;
  class FakeMediaSource extends EventTarget {
    readyState = "open";
    ended = false;

    constructor() {
      super();
      media = this;
    }

    addSourceBuffer() {
      return buffer;
    }

    endOfStream() {
      this.ended = true;
    }
  }
  const original = globalThis.MediaSource;
  globalThis.MediaSource = FakeMediaSource as unknown as typeof MediaSource;
  t.after(() => {
    globalThis.MediaSource = original;
  });

  t.mock.method(URL, "createObjectURL", () => "blob:sample");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  let cancelled = false;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  let errors = 0;
  const video = {
    buffered: { length: 0 },
    currentTime: 45,
    src: "",
    load() {},
    removeAttribute() {
      this.src = "";
    },
  };
  const detach = attachMediaSource(
    video as unknown as HTMLVideoElement,
    "/api/sample",
    "video/mp4",
    () => {
      errors++;
    },
  );
  t.after(detach);

  return {
    buffer,
    video,
    detach,
    revoke,
    fetch,
    open: () => media.dispatchEvent(new Event("sourceopen")),
    get ended() {
      return media.ended;
    },
    get cancelled() {
      return cancelled;
    },
    get errors() {
      return errors;
    },
  };
}

test("detaching before sourceopen releases the object URL without fetching", async (t) => {
  const sample = fixture(t);
  sample.detach();
  sample.open();
  await setImmediate();

  assert.equal(sample.video.src, "");
  assert.equal(sample.revoke.mock.callCount(), 1);
  assert.equal(sample.fetch.mock.callCount(), 0);
  assert.equal(sample.errors, 0);
});

test("detaching aborts fetch and cancels a pending SourceBuffer append", async (t) => {
  const sample = fixture(t);
  sample.open();
  await setImmediate();
  assert.equal(sample.buffer.updating, true);
  const signal = sample.fetch.mock.calls[0].arguments[1]?.signal;

  sample.detach();
  await setImmediate();

  assert.equal(signal?.aborted, true);
  assert.equal(sample.cancelled, true);
  assert.equal(sample.ended, false);
  sample.buffer.dispatchEvent(new Event("error"));
  assert.equal(sample.errors, 0);
});

test("exhausted quota retries surface playback failure and cancel the reader", async (t) => {
  const sample = fixture(t);
  sample.buffer.quotaExceeded = true;
  sample.open();
  await setImmediate();

  assert.equal(sample.buffer.attempts, 3);
  assert.equal(sample.errors, 1);
  assert.equal(sample.cancelled, true);
  assert.equal(sample.ended, false);
});

test("SourceBuffer errors surface before updateend can report success", async (t) => {
  const sample = fixture(t);
  sample.open();
  await setImmediate();
  assert.equal(sample.buffer.updating, true);

  sample.buffer.dispatchEvent(new Event("error"));
  sample.buffer.dispatchEvent(new Event("updateend"));
  await setImmediate();

  assert.equal(sample.errors, 1);
  assert.equal(sample.cancelled, true);
  assert.equal(sample.ended, false);
});
