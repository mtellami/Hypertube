import { useAuth } from "../common/auth";
import { useI18n } from "../common/i18n";
import ApiCredentials from "./settings/ApiCredentials";
import AvatarForm from "./settings/AvatarForm";
import PasswordForm from "./settings/PasswordForm";
import ProfileForm from "./settings/ProfileForm";

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
