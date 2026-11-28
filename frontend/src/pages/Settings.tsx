import { useMutation } from "@tanstack/react-query";
import { buttonStyles } from "../components/ui-styles";
import { useRef, useState, type ChangeEvent } from "react";
import { api, type FormResult } from "../api";
import { useAuth } from "../auth";
import { LuUpload } from "react-icons/lu";
import { Alert, Avatar, Field, SelectField, Spinner } from "../components/ui";
import { LANGUAGES, isLang, useI18n } from "../i18n";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  profileSchema,
  passwordSchema,
  applyServerErrors,
  type ProfileValues,
  type PasswordValues,
} from "../forms";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function ProfileForm() {
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

function AvatarForm() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<FormResult>("/me/avatar", { method: "POST", form });
    },
    onSuccess: (r) => {
      if (r.ok && r.user) setUser(r.user);
      else setError(r.error ?? t("settings.avatar_type"));
    },
    onError: () => setError(t("err.generic")),
  });
  const busy = uploadMutation.isPending;
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type))
      return setError(t("settings.avatar_type"));
    if (file.size > 5 * 1024 * 1024) return setError(t("settings.avatar_size"));
    setError(null);
    uploadMutation.mutate(file);
  };

  return (
    <div className="avatar-form [&_>_div]:grid [&_>_div]:gap-2 [&_>_div]:justify-items-start flex items-center gap-5.5 flex-wrap">
      <Avatar
        url={user!.profile_picture_url}
        name={user!.username}
        first={user!.first_name}
        last={user!.last_name}
        size={96}
      />
      <div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={upload}
        />
        <button
          className={buttonStyles({ variant: "glass" })}
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <Spinner size={18} />
          ) : (
            <>
              <LuUpload size={18} />
              {t("settings.change_avatar")}
            </>
          )}
        </button>
        <p className="text-muted text-[0.8rem]">{t("settings.avatar_hint")}</p>
        {error && <p className="text-danger text-[0.8rem]">{error}</p>}
      </div>
    </div>
  );
}

function PasswordForm() {
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

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`
      copy-field [&_span]:text-muted [&_code]:overflow-hidden [&_code]:[text-overflow:ellipsis]
      [&_code]:whitespace-nowrap [&_code]:text-[0.82rem] mobile:grid-cols-[1fr_auto]
      mobile:[&_span]:[grid-column:1_/_-1] w-full grid grid-cols-[110px_minmax(0,_1fr)_auto] items-center
      gap-3 bg-canvas-alt border border-outline rounded-[12px] text-[0.85rem] py-2.5 px-3
    `}
    >
      <span>{label}</span>
      <code>{value}</code>
      <button
        type="button"
        className={buttonStyles({ variant: "ghost", size: "small" })}
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {copied ? t("settings.copied") : t("settings.copy")}
      </button>
    </div>
  );
}

function ApiCredentials() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const [secret, setSecret] = useState<{ id: string; secret: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const generate = useMutation({
    gcTime: 0,
    mutationFn: () =>
      api<{ ok: boolean; client_id: string; client_secret: string }>(
        "/me/api-credentials",
        { method: "POST" },
      ),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      if (!r.ok) return setError(t("err.generic"));
      setSecret({ id: r.client_id, secret: r.client_secret });
      setUser({ ...user!, api_client_id: r.client_id });
    },
    onError: () => setError(t("err.generic")),
  });
  const busy = generate.isPending;
  const clientId = secret?.id ?? user!.api_client_id;
  return (
    <div className="grid gap-3 justify-items-start">
      {error && <Alert>{error}</Alert>}
      {clientId && (
        <CopyField label={t("settings.client_id")} value={clientId} />
      )}
      {secret && (
        <CopyField label={t("settings.client_secret")} value={secret.secret} />
      )}
      {secret && (
        <pre className="w-full m-0 p-3.5 bg-[#04060d] border border-outline rounded-[12px] text-[0.78rem] overflow-x-auto text-[#a5d8ff]">{`curl -X POST ${window.location.origin}/api/oauth/token \\
  -d grant_type=client_credentials \\
  -d client_id=${secret.id} \\
  -d client_secret=${secret.secret}`}</pre>
      )}
      <button
        className={buttonStyles({ variant: "glass" })}
        onClick={() => generate.mutate()}
        disabled={busy}
      >
        {busy ? (
          <Spinner size={18} />
        ) : clientId ? (
          t("settings.regenerate")
        ) : (
          t("settings.generate")
        )}
      </button>
    </div>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div
      className={`
      content-shell w-full max-w-215 p-[0_var(--gutter)] settings-page
      [&_>_h1]:text-[clamp(1.7rem,_3vw,_2.3rem)] pt-[calc(var(--header-h)_+_40px)] pb-15 grid gap-5.5 my-0
      mx-auto
    `}
    >
      <h1>{t("settings.title")}</h1>
      {user!.oauth_providers && user!.oauth_providers.length > 0 && (
        <p className="text-muted">
          {t("settings.linked", {
            p: user!.oauth_providers
              .map(
                (p) =>
                  ({
                    "42": "42",
                    github: "GitHub",
                    discord: "Discord",
                    gitlab: "GitLab",
                  })[p] ?? p,
              )
              .join(", "),
          })}
        </p>
      )}
      <section className="panel [&_header_h2]:mb-1 [&_header_p]:text-[0.88rem] bg-surface border border-outline rounded-panel p-[clamp(18px,_3vw,_30px)] grid gap-5">
        <header>
          <h2>{t("settings.avatar")}</h2>
        </header>
        <AvatarForm />
      </section>
      <section className="panel [&_header_h2]:mb-1 [&_header_p]:text-[0.88rem] bg-surface border border-outline rounded-panel p-[clamp(18px,_3vw,_30px)] grid gap-5">
        <header>
          <h2>{t("settings.profile")}</h2>
        </header>
        <ProfileForm />
      </section>
      <section className="panel [&_header_h2]:mb-1 [&_header_p]:text-[0.88rem] bg-surface border border-outline rounded-panel p-[clamp(18px,_3vw,_30px)] grid gap-5">
        <header>
          <h2>{t("settings.password")}</h2>
          <p className="text-muted">{t("settings.password_sub")}</p>
        </header>
        <PasswordForm />
      </section>
      <section className="panel [&_header_h2]:mb-1 [&_header_p]:text-[0.88rem] bg-surface border border-outline rounded-panel p-[clamp(18px,_3vw,_30px)] grid gap-5">
        <header>
          <h2>{t("settings.api")}</h2>
          <p className="text-muted">{t("settings.api_sub")}</p>
        </header>
        <ApiCredentials />
      </section>
    </div>
  );
}
