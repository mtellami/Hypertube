import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, type FormResult } from "../../api/client";
import { useAuth } from "../../common/auth";
import {
  profileSchema,
  applyServerErrors,
  type ProfileValues,
} from "../../common/forms";
import { LANGUAGES, isLang, useI18n } from "../../common/i18n";
import { Alert, Field, SelectField, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";

export default function ProfileForm() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting: busy },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema(t)),
    defaultValues: {
      first_name: user!.first_name,
      last_name: user!.last_name,
      username: user!.username,
      email: user!.email ?? "",
      language: user!.language,
    },
  });
  const language = watch("language");
  const [msg, setMsg] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const submit = async (values: ProfileValues) => {
    setMsg(null);
    const changes = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) =>
          value !==
          String((user as unknown as Record<string, unknown>)[key] ?? ""),
      ),
    );
    if (!Object.keys(changes).length)
      return setMsg({ kind: "success", text: t("settings.saved") });
    try {
      const r = await api<FormResult>("/me", {
        method: "PATCH",
        json: changes,
      });
      if (r.ok && r.user) {
        setUser(r.user);
        setMsg({ kind: "success", text: t("settings.saved") });
      } else {
        applyServerErrors(setError, r.fields, t);
        setMsg({ kind: "error", text: r.error ?? t("err.generic") });
      }
    } catch {
      setMsg({ kind: "error", text: t("err.generic") });
    }
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="form-grid mobile:grid-cols-[1fr] grid grid-cols-[1fr_1fr] gap-3.5">
        <Field
          label={t("auth.first_name")}
          {...register("first_name")}
          maxLength={64}
          error={errors.first_name?.message}
          autoComplete="given-name"
        />
        <Field
          label={t("auth.last_name")}
          {...register("last_name")}
          maxLength={64}
          error={errors.last_name?.message}
          autoComplete="family-name"
        />
      </div>
      <Field
        label={t("auth.username")}
        {...register("username")}
        maxLength={32}
        error={errors.username?.message}
        autoComplete="username"
      />
      <Field
        label={t("auth.email")}
        type="email"
        {...register("email")}
        maxLength={254}
        error={errors.email?.message}
        hint={t("settings.email_private")}
        autoComplete="email"
      />
      <SelectField
        label={t("auth.language")}
        value={language}
        onChange={(v) =>
          isLang(v) && setValue("language", v, { shouldDirty: true })
        }
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </SelectField>
      <div>
        <button
          className={buttonStyles({ variant: "primary" })}
          disabled={busy}
        >
          {busy ? <Spinner size={18} /> : t("settings.save")}
        </button>
      </div>
    </form>
  );
}
