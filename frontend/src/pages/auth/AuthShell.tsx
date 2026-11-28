import type { ReactNode } from "react";
import { usePostersQuery } from "../../api/queries";
import { useI18n } from "../../common/i18n";

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

export default function AuthShell({
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
