import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, type FormResult } from "../../api/client";
import { useAuth } from "../../common/auth";
import {
  passwordSchema,
  applyServerErrors,
  type PasswordValues,
} from "../../common/forms";
import { useI18n } from "../../common/i18n";
import { Alert, Field, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";

export default function PasswordForm() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting: busy },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema(t)),
    defaultValues: { password: "", confirm: "" },
  });
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async ({ password }: PasswordValues) => {
    setMsg(null);
    try {
      const r = await api<FormResult>("/me", {
        method: "PATCH",
        json: { password },
      });
      if (r.ok && r.user) {
        setUser(r.user);
        reset();
        setMsg(t("settings.saved"));
      } else {
        applyServerErrors(setError, r.fields, t);
        if (!r.fields)
          setError("password", { message: r.error ?? t("err.generic") });
      }
    } catch {
      setError("password", { message: t("err.generic") });
    }
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {msg && <Alert kind="success">{msg}</Alert>}
      <div className="form-grid mobile:grid-cols-[1fr] grid grid-cols-[1fr_1fr] gap-3.5">
        <Field
          label={t("auth.new_password")}
          type="password"
          {...register("password")}
          maxLength={128}
          autoComplete="new-password"
          error={errors.password?.message}
          hint={t("auth.password_hint")}
        />
        <Field
          label={t("auth.confirm_password")}
          type="password"
          {...register("confirm")}
          maxLength={128}
          autoComplete="new-password"
          error={errors.confirm?.message}
        />
      </div>
      <div>
        <button
          className={buttonStyles({ variant: "primary" })}
          disabled={busy}
        >
          {busy ? <Spinner size={18} /> : t("settings.update_password")}
        </button>
      </div>
    </form>
  );
}
