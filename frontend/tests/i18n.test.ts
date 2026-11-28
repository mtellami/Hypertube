import assert from "node:assert/strict";
import { test } from "node:test";
import { i18n } from "../src/common/i18n";

test("existing dotted keys and brace placeholders work in every supported language", () => {
  assert.equal(
    i18n.t("auth.with_provider", { lng: "en", p: "GitHub" }),
    "Continue with GitHub",
  );
  for (const lng of ["en", "fr", "es"]) {
    const message = i18n.t("movie.buffering", {
      lng,
      p: 40,
      rate: 10,
      peers: 3,
    });
    assert.ok(message.includes("40"));
    assert.ok(!message.includes("{"));
    assert.notEqual(message, "movie.buffering");
  }
});

test("counts use locale-aware singular and plural forms", () => {
  assert.equal(i18n.t("lib.count", { lng: "en", count: 1, n: 1 }), "1 film");
  assert.equal(i18n.t("lib.count", { lng: "en", count: 2, n: 2 }), "2 films");
  assert.equal(
    i18n.t("lib.count", { lng: "es", count: 1, n: 1 }),
    "1 película",
  );
  assert.equal(
    i18n.t("lib.count", { lng: "es", count: 2, n: 2 }),
    "2 películas",
  );
});

test("unsupported locales fall back to English", () => {
  assert.equal(i18n.t("auth.sign_in", { lng: "de" }), "Sign in");
});
