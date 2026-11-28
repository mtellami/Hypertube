import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { api, type FormResult } from "../../api/client";
import { loginSchema, type LoginValues } from "../../common/forms";
import { useI18n } from "../../common/i18n";
import { Alert, Field, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";
import AuthShell from "./AuthShell";
import { useAuth } from "../../common/auth";
import OAuthButtons from "./OAuthButtons";

const OAUTH_ERRORS = [
  "oauth_unavailable",
  "oauth_state",
  "oauth_failed",
  "oauth_no_email",
] as const;

export default function Login() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: busy },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema(t)),
    defaultValues: { username: "", password: "" },
  });
  const [error, setError] = useState<string | null>(() => {
    const code = params.get("error");
    return code && (OAUTH_ERRORS as readonly string[]).includes(code)
      ? t(`err.${code}` as "err.oauth_failed")
      : null;
  });
  const submit = async (values: LoginValues) => {
    setError(null);
    try {
      const r = await api<FormResult>("/auth/login", {
        method: "POST",
        json: values,
      });
      if (r.ok && r.user) {
        setUser(r.user);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(
          from && from.startsWith("/") && !from.startsWith("//") ? from : "/",
          { replace: true },
        );
      } else setError(r.error ?? t("err.generic"));
    } catch {
      setError(t("err.generic"));
    }
  };

  return (
    <AuthShell title={t("auth.welcome")} subtitle={t("auth.login_sub")}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-4">
        <Field
          label={t("auth.username")}
          autoComplete="username"
          {...register("username")}
          maxLength={32}
          error={errors.username?.message}
          autoFocus
        />
        <Field
          label={t("auth.password")}
          type="password"
          autoComplete="current-password"
          {...register("password")}
          maxLength={128}
          error={errors.password?.message}
        />
        <div className="flex justify-end mt-[-6px] text-[0.88rem]">
          <Link
            to="/forgot-password"
            className="link hover:[text-decoration:underline] hover:[text-underline-offset:3px] text-highlight font-medium"
          >
            {t("auth.forgot")}
          </Link>
        </div>
        <button
          className={buttonStyles({ variant: "primary", fullWidth: true })}
          disabled={busy}
        >
          {busy ? <Spinner size={18} /> : t("auth.login")}
        </button>
      </form>
      <OAuthButtons />
      <p className="mt-5.5 text-center text-muted text-[0.92rem]">
        {t("auth.no_account")}{" "}
        <Link
          to="/register"
          className="link hover:[text-decoration:underline] hover:[text-underline-offset:3px] text-highlight font-medium"
        >
          {t("auth.create_account")}
        </Link>
      </p>
    </AuthShell>
  );
}
