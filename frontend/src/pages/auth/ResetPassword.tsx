import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type FormResult } from "../../api/client";
import {
  passwordSchema,
  applyServerErrors,
  type PasswordValues,
} from "../../common/forms";
import { useI18n } from "../../common/i18n";
import { Alert, Field, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";
import AuthShell from "./AuthShell";
import { useAuth } from "../../common/auth";

export default function ResetPassword() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting: busy },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema(t)),
    defaultValues: { password: "", confirm: "" },
  });
  const [error, setError] = useState<string | null>(
    token ? null : t("auth.reset_invalid"),
  );
  const submit = async ({ password }: PasswordValues) => {
    if (!token) return;
    setError(null);
    try {
      const r = await api<FormResult>("/auth/reset-password", {
        method: "POST",
        json: { token, password },
      });
      if (r.ok && r.user) {
        setUser(r.user);
        navigate("/", { replace: true });
      } else if (r.fields?.password)
        applyServerErrors(setFieldError, r.fields, t);
      else setError(t("auth.reset_invalid"));
    } catch {
      setError(t("err.generic"));
    }
  };

  return (
    <AuthShell title={t("auth.reset_title")} subtitle={t("auth.reset_sub")}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-4">
        <Field
          label={t("auth.new_password")}
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
        <button
          className={buttonStyles({ variant: "primary", fullWidth: true })}
          disabled={busy || !token}
        >
          {busy ? <Spinner size={18} /> : t("auth.reset")}
        </button>
      </form>
      <p className="mt-5.5 text-center text-muted text-[0.92rem]">
        <Link
          to="/login"
          className="link hover:[text-decoration:underline] hover:[text-underline-offset:3px] text-highlight font-medium"
        >
          {t("auth.back_login")}
        </Link>
      </p>
    </AuthShell>
  );
}
