import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { requestStream } from "../src/stream-query";

test("a StrictMode-style unsubscribe/remount shares the initial stream POST", async () => {
  const original = globalThis.fetch;
  const client = new QueryClient();
  const key = ["viewer", 1, "en", "stream", 7, 0];
  let requests = 0;
  let finish!: (response: Response) => void;
  globalThis.fetch = async (_url, init) => {
    requests++;
    assert.equal(init?.method, "POST");
    assert.equal(init?.signal, undefined);
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  };
  try {
    const observer = new QueryObserver(client, {
      queryKey: key,
      gcTime: 0,
      retry: false,
      queryFn: (context) => requestStream(client, key, 7, context),
    });
    const unsubscribe = observer.subscribe(() => {});
    unsubscribe();
    const resubscribe = observer.subscribe(() => {});
    assert.equal(requests, 1);
    finish(
      new Response(JSON.stringify({ state: "preparing", ready: false }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(client.getQueryData(key), {
      state: "preparing",
      ready: false,
    });
    resubscribe();
  } finally {
    client.clear();
    globalThis.fetch = original;
  }
});

test("subsequent stream polling uses a cancellable GET", async () => {
  const original = globalThis.fetch;
  const client = new QueryClient();
  const key = ["viewer", 1, "en", "stream", 7, 0];
  client.setQueryData(key, { state: "preparing", ready: false });
  let receivedSignal: AbortSignal | undefined;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, "GET");
    receivedSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) =>
      receivedSignal!.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      ),
    );
  };
  try {
    const observer = new QueryObserver(client, {
      queryKey: key,
      staleTime: 0,
      retry: false,
      queryFn: (context) => requestStream(client, key, 7, context),
    });
    const unsubscribe = observer.subscribe(() => {});
    assert.ok(receivedSignal);
    unsubscribe();
    assert.equal(receivedSignal.aborted, true);
  } finally {
    client.clear();
    globalThis.fetch = original;
  }
});
