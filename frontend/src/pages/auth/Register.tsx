import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { api, type FormResult } from "../../api/client";
import {
  registrationSchema,
  applyServerErrors,
  type RegistrationValues,
} from "../../common/forms";
import { LANGUAGES, isLang, useI18n } from "../../common/i18n";
import { Alert, Field, SelectField, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";
import AuthShell from "./AuthShell";
import { useAuth } from "../../common/auth";
import OAuthButtons from "./OAuthButtons";

export default function Register() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    watch,
    setValue,
    formState: { errors, isSubmitting: busy },
  } = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema(t)),
    defaultValues: {
      email: "",
      username: "",
      first_name: "",
      last_name: "",
      password: "",
      confirm: "",
      language: lang,
    },
  });
  const language = watch("language");
  const [error, setError] = useState<string | null>(null);
  const submit = async ({
    confirm: _confirm,
    ...payload
  }: RegistrationValues) => {
    setError(null);
    try {
      const r = await api<FormResult>("/auth/register", {
        method: "POST",
        json: payload,
      });
      if (r.ok && r.user) {
        setUser(r.user);
        navigate("/", { replace: true });
      } else {
        applyServerErrors(setFieldError, r.fields, t);
        setError(r.error ?? t("err.generic"));
      }
    } catch {
      setError(t("err.generic"));
    }
  };

  return (
    <AuthShell
      title={t("auth.register_title")}
      subtitle={t("auth.register_sub")}
    >
      {error && <Alert>{error}</Alert>}
      <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-4">
        <div className="form-grid mobile:grid-cols-[1fr] grid grid-cols-[1fr_1fr] gap-3.5">
          <Field
            label={t("auth.first_name")}
            autoComplete="given-name"
            {...register("first_name")}
            maxLength={64}
            error={errors.first_name?.message}
          />
          <Field
            label={t("auth.last_name")}
            autoComplete="family-name"
            {...register("last_name")}
            maxLength={64}
            error={errors.last_name?.message}
          />
        </div>
        <Field
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          {...register("email")}
          maxLength={254}
          error={errors.email?.message}
        />
        <Field
          label={t("auth.username")}
          autoComplete="username"
          {...register("username")}
          maxLength={32}
          error={errors.username?.message}
        />
        <div className="form-grid mobile:grid-cols-[1fr] grid grid-cols-[1fr_1fr] gap-3.5">
          <Field
            label={t("auth.password")}
            type="password"
            autoComplete="new-password"
            {...register("password")}
            maxLength={128}
            error={errors.password?.message}
            hint={t("auth.password_hint")}
          />
          <Field
            label={t("auth.confirm_password")}
            type="password"
            autoComplete="new-password"
            {...register("confirm")}
            maxLength={128}
            error={errors.confirm?.message}
          />
        </div>
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
        <button
          className={buttonStyles({ variant: "primary", fullWidth: true })}
          disabled={busy}
        >
          {busy ? <Spinner size={18} /> : t("auth.register")}
        </button>
      </form>
      <OAuthButtons />
      <p className="mt-5.5 text-center text-muted text-[0.92rem]">
        {t("auth.have_account")}{" "}
        <Link
          to="/login"
          className="link hover:[text-decoration:underline] hover:[text-underline-offset:3px] text-highlight font-medium"
        >
          {t("auth.sign_in")}
        </Link>
      </p>
    </AuthShell>
  );
}
