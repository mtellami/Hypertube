import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../common/auth";
import { useI18n } from "../../common/i18n";
import { Alert, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";

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

export default function ApiCredentials() {
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
