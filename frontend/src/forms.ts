import { z } from "zod";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { TFunction } from "./i18n";

const email = (t: TFunction) =>
  z
    .string()
    .trim()
    .min(1, t("err.required"))
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, t("err.email"));
const username = (t: TFunction) =>
  z
    .string()
    .min(1, t("err.required"))
    .regex(/^[A-Za-z0-9_.-]{3,32}$/, t("err.username"));
const name = (t: TFunction) =>
  z
    .string()
    .trim()
    .min(1, t("err.required"))
    .max(64, t("err.name"))
    .regex(/^[^<>]+$/, t("err.name"));
const password = (t: TFunction) =>
  z
    .string()
    .min(1, t("err.required"))
    .min(8, t("err.password"))
    .max(128, t("err.password"))
    .regex(/[A-Za-z]/, t("err.password"))
    .regex(/\d/, t("err.password"));

export const loginSchema = (t: TFunction) =>
  z.object({
    username: z.string().trim().min(1, t("err.required")),
    password: z.string().min(1, t("err.required")),
  });
export const profileSchema = (t: TFunction) =>
  z.object({
    first_name: name(t),
    last_name: name(t),
    username: username(t),
    email: email(t),
    language: z.enum(["en", "fr", "es"]),
  });
export const passwordSchema = (t: TFunction) =>
  z
    .object({
      password: password(t),
      confirm: z.string(),
    })
    .refine((data) => data.password === data.confirm, {
      path: ["confirm"],
      message: t("err.mismatch"),
    });
export const registrationSchema = (t: TFunction) =>
  profileSchema(t)
    .extend({
      password: password(t),
      confirm: z.string(),
    })
    .refine((data) => data.password === data.confirm, {
      path: ["confirm"],
      message: t("err.mismatch"),
    });
export const forgotSchema = (t: TFunction) => z.object({ email: email(t) });

export type LoginValues = z.infer<ReturnType<typeof loginSchema>>;
export type ProfileValues = z.infer<ReturnType<typeof profileSchema>>;
export type PasswordValues = z.infer<ReturnType<typeof passwordSchema>>;
export type RegistrationValues = z.infer<ReturnType<typeof registrationSchema>>;
export type ForgotValues = z.infer<ReturnType<typeof forgotSchema>>;

// API validation remains authoritative; map its field errors onto the same controls.
export function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fields: Record<string, string> | undefined,
  t: TFunction,
) {
  for (const [key, original] of Object.entries(fields ?? {})) {
    const translation = {
      email: "err.email",
      username: "err.username",
      first_name: "err.name",
      last_name: "err.name",
      password: "err.password",
    } as const;
    const message =
      /taken|already/i.test(original) ||
      (key === "password" && /common/i.test(original))
        ? original
        : key in translation
          ? t(translation[key as keyof typeof translation])
          : original;
    setError(key as Path<T>, { type: "server", message });
  }
}
