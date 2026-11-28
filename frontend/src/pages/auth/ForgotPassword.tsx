import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { api, type FormResult } from "../../api/client";
import { forgotSchema, type ForgotValues } from "../../common/forms";
import { useI18n } from "../../common/i18n";
import { Alert, Field, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";
import AuthShell from "./AuthShell";

export default function ForgotPassword() {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: busy },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema(t)),
    defaultValues: { email: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (values: ForgotValues) => {
    setError(null);
    try {
      const r = await api<FormResult>("/auth/forgot-password", {
        method: "POST",
        json: values,
      });
      if (r.ok) setSent(true);
      else setError(t("err.email"));
    } catch {
      setError(t("err.generic"));
    }
  };

  return (
    <AuthShell title={t("auth.forgot_title")} subtitle={t("auth.forgot_sub")}>
      {sent ? (
        <Alert kind="success">{t("auth.forgot_sent")}</Alert>
      ) : (
        <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-4">
          <Field
            label={t("auth.email")}
            type="email"
            autoComplete="email"
            {...register("email")}
            maxLength={254}
            error={errors.email?.message ?? error ?? undefined}
            autoFocus
          />
          <button
            className={buttonStyles({ variant: "primary", fullWidth: true })}
            disabled={busy}
          >
            {busy ? <Spinner size={18} /> : t("auth.send_link")}
          </button>
        </form>
      )}
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
