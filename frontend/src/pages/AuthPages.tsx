import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  loginSchema,
  registrationSchema,
  forgotSchema,
  passwordSchema,
  applyServerErrors,
  type LoginValues,
  type RegistrationValues,
  type ForgotValues,
  type PasswordValues,
} from "../forms";
import { usePostersQuery, useOAuthProvidersQuery } from "../queries";
import { buttonStyles } from "../components/ui-styles";
import { useState, type ReactNode } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { api, type FormResult } from "../api";
import { useAuth } from "../auth";
import { SiDiscord, Si42, SiGithub, SiGitlab } from "react-icons/si";
import { Alert, Field, SelectField, Spinner } from "../components/ui";
import { LANGUAGES, isLang, useI18n } from "../i18n";

function PosterWall() {
  const { data } = usePostersQuery();
  const posters = (data ?? [])
    .map((m) => m.cover_url)
    .filter((url): url is string => !!url)
    .slice(0, 24);
  if (!posters.length)
    return (
      <div
        className="poster-wall [transform:rotate(-8deg)_scale(1.15)] [&.empty]:bg-auth-glow absolute inset-[-40px] grid grid-cols-[repeat(4,_1fr)] gap-3.5 opacity-80 empty"
        aria-hidden="true"
      />
    );
  const cols = [0, 1, 2, 3].map((c) => posters.filter((_, i) => i % 4 === c));
  return (
    <div
      className="poster-wall [transform:rotate(-8deg)_scale(1.15)] [&.empty]:bg-auth-glow absolute inset-[-40px] grid grid-cols-[repeat(4,_1fr)] gap-3.5 opacity-80"
      aria-hidden="true"
    >
      {cols.map((col, i) => (
        <div
          key={i}
          className={`wall-col animate-[drift-up_70s_linear_infinite] [&.down]:[animation-name:drift-down] [&_img]:w-full [&_img]:aspect-[2/3] [&_img]:object-cover [&_img]:rounded-[12px] [&_img]:bg-surface-raised [&_img]:[filter:saturate(1.1)] grid gap-3.5 content-start ${i % 2 ? "down" : "up"}`}
        >
          {[...col, ...col].map((src, j) => (
            <img key={j} src={src} alt="" referrerPolicy="no-referrer" />
          ))}
        </div>
      ))}
    </div>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="auth-page tablet:grid-cols-[1fr] min-h-screen grid grid-cols-[1.1fr_1fr]">
      <section className="auth-art after:content-[''] after:absolute after:inset-0 after:bg-auth-overlay tablet:hidden relative overflow-hidden bg-[#04060d]">
        <PosterWall />
        <div
          className={`
          auth-art-copy [&_h2]:text-[clamp(2rem,_3.6vw,_3.2rem)] [&_h2]:font-bold [&_h2]:mb-3.5
          [&_p]:text-secondary [&_p]:text-[1.05rem] absolute z-[2] left-[clamp(28px,_6vw,_72px)] right-7
          bottom-[clamp(40px,_9vh,_90px)] max-w-130
        `}
        >
          <h2>{t("auth.hero_title")}</h2>
          <p>{t("auth.hero_sub")}</p>
        </div>
      </section>
      <section className="grid place-items-center p-[calc(var(--header-h)_+_24px)_var(--gutter)_48px]">
        <div className="auth-card animate-[rise_0.5s_var(--ease)] [&_h1]:text-[clamp(1.7rem,_3vw,_2.2rem)] [&_h1]:mb-2 [&_.alert]:mb-4 w-full max-w-110">
          <h1>{title}</h1>
          <p className="text-muted mb-6.5">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

function OAuthButtons() {
  const { t } = useI18n();
  // 42 and GitHub are always offered; extra providers appear once configured on the server.
  const { data } = useOAuthProvidersQuery();
  const extra = data?.providers ?? [];
  return (
    <>
      <div
        className={`
        divider [margin:22px_0_16px] before:content-[''] before:flex-1 before:h-[1px]
        before:[background:var(--line-strong)] after:content-[''] after:flex-1 after:h-[1px]
        after:[background:var(--line-strong)] flex items-center gap-3.5 text-muted text-[0.8rem] uppercase
        tracking-[0.1em]
      `}
      >
        <span>{t("auth.or")}</span>
      </div>
      <div className="oauth-buttons mobile:grid-cols-[1fr] grid grid-cols-[1fr_1fr] gap-2.5">
        <a
          className={`${buttonStyles({ variant: "oauth" })} ft`}
          href="/api/auth/oauth/42/login"
        >
          <Si42 size={22} style={{ height: 16 }} />
          {t("auth.with_42")}
        </a>
        <a
          className={`${buttonStyles({ variant: "oauth" })} gh`}
          href="/api/auth/oauth/github/login"
        >
          <SiGithub />
          {t("auth.with_github")}
        </a>
        {extra.includes("discord") && (
          <a
            className={`${buttonStyles({ variant: "oauth" })} dc`}
            href="/api/auth/oauth/discord/login"
          >
            <SiDiscord />
            {t("auth.with_provider", { p: "Discord" })}
          </a>
        )}
        {extra.includes("gitlab") && (
          <a
            className={`${buttonStyles({ variant: "oauth" })} gl`}
            href="/api/auth/oauth/gitlab/login"
          >
            <SiGitlab />
            {t("auth.with_provider", { p: "GitLab" })}
          </a>
        )}
      </div>
    </>
  );
}

const OAUTH_ERRORS = [
  "oauth_unavailable",
  "oauth_state",
  "oauth_failed",
  "oauth_no_email",
] as const;

export function Login() {
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

export function Register() {
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

export function ForgotPassword() {
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

export function ResetPassword() {
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
