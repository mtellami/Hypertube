import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loginSchema,
  registrationSchema,
  passwordSchema,
  profileSchema,
  applyServerErrors,
} from "../src/forms";
import type { TFunction } from "../src/i18n";

const t: TFunction = (key) => key;
const profile = {
  first_name: "Ada",
  last_name: "Lovelace",
  username: "ada.dev",
  email: "ada@example.com",
  language: "en" as const,
};

test("login accepts existing passwords without imposing registration strength", () => {
  assert.deepEqual(
    loginSchema(t).parse({ username: " ada ", password: "old" }),
    { username: "ada", password: "old" },
  );
  assert.equal(
    loginSchema(t).safeParse({ username: " ", password: "" }).success,
    false,
  );
});

test("registration validates profile fields and confirmation before submission", () => {
  const schema = registrationSchema(t);
  assert.equal(
    schema.safeParse({
      ...profile,
      password: "password123",
      confirm: "password123",
    }).success,
    true,
  );
  for (const values of [
    { email: "invalid" },
    { username: "ab" },
    { first_name: "<script>" },
    { last_name: "x".repeat(65) },
    { password: "12345678", confirm: "12345678" },
    { password: "password", confirm: "password" },
    { confirm: "different" },
    { password: "a1".repeat(65), confirm: "a1".repeat(65) },
    { language: "de" },
  ]) {
    assert.equal(
      schema.safeParse({
        ...profile,
        password: "password123",
        confirm: "password123",
        ...values,
      }).success,
      false,
      JSON.stringify(values),
    );
  }
});

test("profile normalization and password confirmation match update contracts", () => {
  assert.equal(
    profileSchema(t).parse({ ...profile, first_name: " Ada " }).first_name,
    "Ada",
  );
  const result = passwordSchema(t).safeParse({
    password: "password123",
    confirm: "different",
  });
  assert.equal(result.success, false);
  if (!result.success)
    assert.deepEqual(result.error.issues[0].path, ["confirm"]);
});

test("server uniqueness errors survive localization and validation errors map to fields", () => {
  const errors: Record<string, string | undefined> = {};
  applyServerErrors(
    (name, error) => {
      errors[name] = error.message;
    },
    {
      username: "Already taken",
      email: "Invalid email",
      password: "Too common",
    },
    t,
  );
  assert.deepEqual(errors, {
    username: "Already taken",
    email: "err.email",
    password: "Too common",
  });
});
