import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeCaption,
  parseCaptions,
  selectedTrack,
} from "../src/components/player/captions";

const french = { id: 1, lang: "fr", label: "French", url: "/fr.vtt" };
const english = { id: 2, lang: "en", label: "English", url: "/en.vtt" };

test("refreshing subtitle tracks respects Off and explicit language choices", () => {
  assert.equal(selectedTrack([english], undefined, "fr"), undefined);
  assert.equal(selectedTrack([english, french], undefined, "fr"), french);
  assert.equal(selectedTrack([english, french], null, "fr"), undefined);
  assert.equal(selectedTrack([french, english], "en", "fr"), english);
  assert.equal(selectedTrack([french], "en", "fr"), undefined);
});

test("WebVTT cues stay aligned to movie time after a converted seek", async () => {
  const cues = await parseCaptions(
    [
      "WEBVTT",
      "",
      "NOTE 00:10.000 --> 00:13.000",
      "This is a note.",
      "",
      "first",
      "00:12.000 --> 00:14.000 align:start",
      "<i>Hello</i> &amp; welcome!",
      "Second line.",
      "",
      "00:16.000 --> 00:18.000",
      "Another cue.",
      "",
    ].join("\r\n"),
  );

  assert.equal(cues.length, 2);
  assert.equal(activeCaption(cues, 10, 1.99), undefined);
  assert.equal(
    activeCaption(cues, 10, 2)?.text,
    "Hello & welcome!\nSecond line.",
  );
  assert.equal(activeCaption(cues, 10, 4), undefined);
  assert.equal(activeCaption(cues, 15, 1)?.text, "Another cue.");
  assert.equal(activeCaption(cues, 0, 16)?.text, "Another cue.");
});
