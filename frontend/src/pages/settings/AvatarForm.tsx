import { useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { LuUpload } from "react-icons/lu";
import { api, type FormResult } from "../../api/client";
import { useAuth } from "../../common/auth";
import { useI18n } from "../../common/i18n";
import { Avatar, Spinner } from "../../components/ui";
import { buttonStyles } from "../../components/ui-styles";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function AvatarForm() {
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
