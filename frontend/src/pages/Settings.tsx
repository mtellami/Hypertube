import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, type FormResult, type Lang } from "../api";
import { useAuth } from "../auth";
import { UploadIcon } from "../components/icons";
import { Alert, Avatar, Field, SelectField, Spinner } from "../components/ui";
import { LANGUAGES, isLang, useI18n } from "../i18n";
import { localizeFieldErrors, rules } from "./AuthPages";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function ProfileForm() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    first_name: user!.first_name, last_name: user!.last_name, username: user!.username, email: user!.email ?? "",
  });
  const [language, setLanguage] = useState<Lang>(user!.language);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!rules.name(form.first_name)) errs.first_name = t("err.name");
    if (!rules.name(form.last_name)) errs.last_name = t("err.name");
    if (!rules.username(form.username)) errs.username = t("err.username");
    if (!rules.email(form.email)) errs.email = t("err.email");
    setErrors(errs);
    setMsg(null);
    if (Object.keys(errs).length) return;
    // Only send what changed.
    const changes: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v.trim() !== String((user as unknown as Record<string, unknown>)[k] ?? "")) changes[k] = v.trim();
    }
    if (language !== user!.language) changes.language = language;
    if (!Object.keys(changes).length) return setMsg({ kind: "success", text: t("settings.saved") });
    setBusy(true);
    try {
      const r = await api<FormResult>("/me", { method: "PATCH", json: changes });
      if (r.ok && r.user) {
        setUser(r.user);
        setMsg({ kind: "success", text: t("settings.saved") });
      } else {
        setErrors(localizeFieldErrors(r.fields, t));
        setMsg({ kind: "error", text: r.error ?? t("err.generic") });
      }
    } catch {
      setMsg({ kind: "error", text: t("err.generic") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="form-grid">
        <Field label={t("auth.first_name")} value={form.first_name} maxLength={64} onChange={set("first_name")}
          error={errors.first_name} autoComplete="given-name" />
        <Field label={t("auth.last_name")} value={form.last_name} maxLength={64} onChange={set("last_name")}
          error={errors.last_name} autoComplete="family-name" />
      </div>
      <Field label={t("auth.username")} value={form.username} maxLength={32} onChange={set("username")}
        error={errors.username} autoComplete="username" />
      <Field label={t("auth.email")} type="email" value={form.email} maxLength={254} onChange={set("email")}
        error={errors.email} hint={t("settings.email_private")} autoComplete="email" />
      <SelectField label={t("auth.language")} value={language} onChange={(v) => isLang(v) && setLanguage(v)}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </SelectField>
      <div><button className="btn primary" disabled={busy}>{busy ? <Spinner size={18} /> : t("settings.save")}</button></div>
    </form>
  );
}

function AvatarForm() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError(t("settings.avatar_type"));
    if (file.size > 5 * 1024 * 1024) return setError(t("settings.avatar_size"));
    setError(null);
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<FormResult>("/me/avatar", { method: "POST", form });
      if (r.ok && r.user) setUser(r.user);
      else setError(r.error ?? t("settings.avatar_type"));
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-form">
      <Avatar url={user!.profile_picture_url} name={user!.username} first={user!.first_name} last={user!.last_name} size={96} />
      <div>
        <input ref={input} type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={upload} />
        <button className="btn glass" type="button" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner size={18} /> : <><UploadIcon width={18} height={18} />{t("settings.change_avatar")}</>}
        </button>
        <p className="field-hint">{t("settings.avatar_hint")}</p>
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}

function PasswordForm() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!rules.password(password)) errs.password = t("err.password");
    if (confirm !== password) errs.confirm = t("err.mismatch");
    setErrors(errs);
    setMsg(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api<FormResult>("/me", { method: "PATCH", json: { password } });
      if (r.ok && r.user) {
        setUser(r.user);
        setPassword("");
        setConfirm("");
        setMsg(t("settings.saved"));
      } else setErrors(localizeFieldErrors(r.fields, t));
    } catch {
      setErrors({ password: t("err.generic") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {msg && <Alert kind="success">{msg}</Alert>}
      <div className="form-grid">
        <Field label={t("auth.new_password")} type="password" value={password} maxLength={128} autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)} error={errors.password} hint={t("auth.password_hint")} />
        <Field label={t("auth.confirm_password")} type="password" value={confirm} maxLength={128} autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      </div>
      <div><button className="btn primary" disabled={busy}>{busy ? <Spinner size={18} /> : t("settings.update_password")}</button></div>
    </form>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <span>{label}</span>
      <code>{value}</code>
      <button type="button" className="btn ghost small" onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => undefined);
      }}>{copied ? t("settings.copied") : t("settings.copy")}</button>
    </div>
  );
}

function ApiCredentials() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const [secret, setSecret] = useState<{ id: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; client_id: string; client_secret: string }>("/me/api-credentials", { method: "POST" });
      setSecret({ id: r.client_id, secret: r.client_secret });
      setUser({ ...user!, api_client_id: r.client_id });
    } finally {
      setBusy(false);
    }
  };
  const clientId = secret?.id ?? user!.api_client_id;
  return (
    <div className="api-box">
      {clientId && <CopyField label={t("settings.client_id")} value={clientId} />}
      {secret && <CopyField label={t("settings.client_secret")} value={secret.secret} />}
      {secret && (
        <pre className="code-sample">{`curl -X POST ${window.location.origin}/api/oauth/token \\
  -d grant_type=client_credentials \\
  -d client_id=${secret.id} \\
  -d client_secret=${secret.secret}`}</pre>
      )}
      <button className="btn glass" onClick={() => void generate()} disabled={busy}>
        {busy ? <Spinner size={18} /> : clientId ? t("settings.regenerate") : t("settings.generate")}
      </button>
    </div>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="container settings-page">
      <h1>{t("settings.title")}</h1>
      {user!.oauth_providers && user!.oauth_providers.length > 0 && (
        <p className="muted">{t("settings.linked", { p: user!.oauth_providers.map((p) => (p === "42" ? "42" : "GitHub")).join(", ") })}</p>
      )}
      <section className="panel">
        <header><h2>{t("settings.avatar")}</h2></header>
        <AvatarForm />
      </section>
      <section className="panel">
        <header><h2>{t("settings.profile")}</h2></header>
        <ProfileForm />
      </section>
      <section className="panel">
        <header><h2>{t("settings.password")}</h2><p className="muted">{t("settings.password_sub")}</p></header>
        <PasswordForm />
      </section>
      <section className="panel">
        <header><h2>{t("settings.api")}</h2><p className="muted">{t("settings.api_sub")}</p></header>
        <ApiCredentials />
      </section>
    </div>
  );
}
