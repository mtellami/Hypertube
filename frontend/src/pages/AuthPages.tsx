import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, type FormResult, type Lang } from "../api";
import { useAuth } from "../auth";
import { DiscordIcon, FortyTwoIcon, GithubIcon, GitlabIcon } from "../components/icons";
import { Alert, Field, SelectField, Spinner } from "../components/ui";
import { LANGUAGES, isLang, useI18n, type TFunction } from "../i18n";

// --- client-side validation (mirrors the server rules) ------------------------
export const rules = {
  email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
  username: (v: string) => /^[A-Za-z0-9_.-]{3,32}$/.test(v.trim()),
  name: (v: string) => v.trim().length >= 1 && v.trim().length <= 64 && !/[<>]/.test(v),
  password: (v: string) => v.length >= 8 && v.length <= 128 && /[A-Za-z]/.test(v) && /\d/.test(v),
};

/** Server messages are English; show our localized message for the same field when we know it. */
export function localizeFieldErrors(fields: Record<string, string> | undefined, t: TFunction) {
  const out: Record<string, string> = {};
  for (const [k, msg] of Object.entries(fields ?? {})) {
    if (/taken|already/i.test(msg)) out[k] = msg;
    else if (k === "email") out[k] = t("err.email");
    else if (k === "username") out[k] = t("err.username");
    else if (k === "first_name" || k === "last_name") out[k] = t("err.name");
    else if (k === "password") out[k] = /common/i.test(msg) ? msg : t("err.password");
    else out[k] = msg;
  }
  return out;
}

function PosterWall() {
  const [posters, setPosters] = useState<string[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    api<{ cover_url: string | null }[]>("/movies", { signal: ctrl.signal })
      .then((list) => setPosters(list.map((m) => m.cover_url).filter((u): u is string => !!u).slice(0, 24)))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  if (!posters.length) return <div className="poster-wall empty" aria-hidden="true" />;
  const cols = [0, 1, 2, 3].map((c) => posters.filter((_, i) => i % 4 === c));
  return (
    <div className="poster-wall" aria-hidden="true">
      {cols.map((col, i) => (
        <div key={i} className={`wall-col ${i % 2 ? "down" : "up"}`}>
          {[...col, ...col].map((src, j) => <img key={j} src={src} alt="" referrerPolicy="no-referrer" />)}
        </div>
      ))}
    </div>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth-page">
      <section className="auth-art">
        <PosterWall />
        <div className="auth-art-copy">
          <h2>{t("auth.hero_title")}</h2>
          <p>{t("auth.hero_sub")}</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

function OAuthButtons() {
  const { t } = useI18n();
  // 42 and GitHub are always offered; extra providers appear once configured on the server.
  const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    api<{ providers: string[] }>("/auth/oauth/providers", { signal: ctrl.signal })
      .then((r) => setExtra(r.providers.filter((p) => p === "discord" || p === "gitlab")))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return (
    <>
      <div className="divider"><span>{t("auth.or")}</span></div>
      <div className="oauth-buttons">
        <a className="btn oauth ft" href="/api/auth/oauth/42/login"><FortyTwoIcon width={22} height={16} />{t("auth.with_42")}</a>
        <a className="btn oauth gh" href="/api/auth/oauth/github/login"><GithubIcon />{t("auth.with_github")}</a>
        {extra.includes("discord") && (
          <a className="btn oauth dc" href="/api/auth/oauth/discord/login"><DiscordIcon />{t("auth.with_provider", { p: "Discord" })}</a>
        )}
        {extra.includes("gitlab") && (
          <a className="btn oauth gl" href="/api/auth/oauth/gitlab/login"><GitlabIcon />{t("auth.with_provider", { p: "GitLab" })}</a>
        )}
      </div>
    </>
  );
}

const OAUTH_ERRORS = ["oauth_unavailable", "oauth_state", "oauth_failed", "oauth_no_email"] as const;

export function Login() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(() => {
    const code = params.get("error");
    return code && (OAUTH_ERRORS as readonly string[]).includes(code) ? t(`err.${code}` as "err.oauth_failed") : null;
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!username.trim()) errs.username = t("err.required");
    if (!password) errs.password = t("err.required");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<FormResult>("/auth/login", { method: "POST", json: { username: username.trim(), password } });
      if (r.ok && r.user) {
        setUser(r.user);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from.startsWith("/") ? from : "/", { replace: true });
      } else setError(r.error ?? t("err.generic"));
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("auth.welcome")} subtitle={t("auth.login_sub")}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} noValidate className="form">
        <Field label={t("auth.username")} autoComplete="username" value={username} maxLength={32}
          onChange={(e) => setUsername(e.target.value)} error={errors.username} autoFocus />
        <Field label={t("auth.password")} type="password" autoComplete="current-password" value={password} maxLength={128}
          onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="form-row-end"><Link to="/forgot-password" className="link">{t("auth.forgot")}</Link></div>
        <button className="btn primary block" disabled={busy}>{busy ? <Spinner size={18} /> : t("auth.login")}</button>
      </form>
      <OAuthButtons />
      <p className="auth-switch">{t("auth.no_account")} <Link to="/register" className="link">{t("auth.create_account")}</Link></p>
    </AuthShell>
  );
}

export function Register() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", first_name: "", last_name: "", password: "", confirm: "" });
  const [language, setLanguage] = useState<Lang>(lang);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!rules.email(form.email)) errs.email = form.email ? t("err.email") : t("err.required");
    if (!rules.username(form.username)) errs.username = form.username ? t("err.username") : t("err.required");
    if (!rules.name(form.first_name)) errs.first_name = form.first_name ? t("err.name") : t("err.required");
    if (!rules.name(form.last_name)) errs.last_name = form.last_name ? t("err.name") : t("err.required");
    if (!rules.password(form.password)) errs.password = form.password ? t("err.password") : t("err.required");
    if (form.confirm !== form.password) errs.confirm = t("err.mismatch");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const { confirm: _c, ...payload } = form;
      const r = await api<FormResult>("/auth/register", { method: "POST", json: { ...payload, language } });
      if (r.ok && r.user) {
        setUser(r.user);
        navigate("/", { replace: true });
      } else {
        setErrors(localizeFieldErrors(r.fields, t));
        setError(r.error ?? t("err.generic"));
      }
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("auth.register_title")} subtitle={t("auth.register_sub")}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} noValidate className="form">
        <div className="form-grid">
          <Field label={t("auth.first_name")} autoComplete="given-name" value={form.first_name} maxLength={64}
            onChange={set("first_name")} error={errors.first_name} />
          <Field label={t("auth.last_name")} autoComplete="family-name" value={form.last_name} maxLength={64}
            onChange={set("last_name")} error={errors.last_name} />
        </div>
        <Field label={t("auth.email")} type="email" autoComplete="email" value={form.email} maxLength={254}
          onChange={set("email")} error={errors.email} />
        <Field label={t("auth.username")} autoComplete="username" value={form.username} maxLength={32}
          onChange={set("username")} error={errors.username} />
        <div className="form-grid">
          <Field label={t("auth.password")} type="password" autoComplete="new-password" value={form.password} maxLength={128}
            onChange={set("password")} error={errors.password} hint={t("auth.password_hint")} />
          <Field label={t("auth.confirm_password")} type="password" autoComplete="new-password" value={form.confirm}
            maxLength={128} onChange={set("confirm")} error={errors.confirm} />
        </div>
        <SelectField label={t("auth.language")} value={language} onChange={(v) => isLang(v) && setLanguage(v)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </SelectField>
        <button className="btn primary block" disabled={busy}>{busy ? <Spinner size={18} /> : t("auth.register")}</button>
      </form>
      <OAuthButtons />
      <p className="auth-switch">{t("auth.have_account")} <Link to="/login" className="link">{t("auth.sign_in")}</Link></p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rules.email(email)) return setError(email ? t("err.email") : t("err.required"));
    setBusy(true);
    setError(null);
    try {
      const r = await api<FormResult>("/auth/forgot-password", { method: "POST", json: { email: email.trim() } });
      if (r.ok) setSent(true);
      else setError(t("err.email"));
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("auth.forgot_title")} subtitle={t("auth.forgot_sub")}>
      {sent ? (
        <Alert kind="success">{t("auth.forgot_sent")}</Alert>
      ) : (
        <form onSubmit={submit} noValidate className="form">
          <Field label={t("auth.email")} type="email" autoComplete="email" value={email} maxLength={254}
            onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} autoFocus />
          <button className="btn primary block" disabled={busy}>{busy ? <Spinner size={18} /> : t("auth.send_link")}</button>
        </form>
      )}
      <p className="auth-switch"><Link to="/login" className="link">{t("auth.back_login")}</Link></p>
    </AuthShell>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(token ? null : t("auth.reset_invalid"));
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!rules.password(password)) errs.password = password ? t("err.password") : t("err.required");
    if (confirm !== password) errs.confirm = t("err.mismatch");
    setErrors(errs);
    if (Object.keys(errs).length || !token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<FormResult>("/auth/reset-password", { method: "POST", json: { token, password } });
      if (r.ok && r.user) {
        setUser(r.user);
        navigate("/", { replace: true });
      } else if (r.fields?.password) setErrors({ password: localizeFieldErrors(r.fields, t).password });
      else setError(t("auth.reset_invalid"));
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("auth.reset_title")} subtitle={t("auth.reset_sub")}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} noValidate className="form">
        <Field label={t("auth.new_password")} type="password" autoComplete="new-password" value={password} maxLength={128}
          onChange={(e) => setPassword(e.target.value)} error={errors.password} hint={t("auth.password_hint")} />
        <Field label={t("auth.confirm_password")} type="password" autoComplete="new-password" value={confirm} maxLength={128}
          onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <button className="btn primary block" disabled={busy || !token}>{busy ? <Spinner size={18} /> : t("auth.reset")}</button>
      </form>
      <p className="auth-switch"><Link to="/login" className="link">{t("auth.back_login")}</Link></p>
    </AuthShell>
  );
}
