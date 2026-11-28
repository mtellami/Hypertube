import { SiDiscord, Si42, SiGithub, SiGitlab } from "react-icons/si";
import { useOAuthProvidersQuery } from "../../api/queries";
import { useI18n } from "../../common/i18n";
import { buttonStyles } from "../../components/ui-styles";

export default function OAuthButtons() {
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
