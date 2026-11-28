import { buttonStyles } from "../components/ui-styles";
import { Link } from "react-router-dom";
import { useI18n } from "../common/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div
      className={`
      content-shell w-full max-w-360 p-[0_var(--gutter)] pt-[calc(var(--header-h)_+_48px)] pb-16 not-found
      [&_.btn]:mt-3 text-center grid justify-items-center gap-3 min-h-[70vh] content-center my-0 mx-auto
    `}
    >
      <p
        className={`
        big-404 bg-(image:--accent-grad) [-webkit-background-clip:text] [background-clip:text] font-heading
        text-[clamp(5rem,_16vw,_9rem)] font-extrabold leading-[1] text-transparent
      `}
      >
        404
      </p>
      <h1>{t("nf.title")}</h1>
      <p className="text-muted">{t("nf.sub")}</p>
      <Link to="/" className={buttonStyles({ variant: "primary" })}>
        {t("movie.back")}
      </Link>
    </div>
  );
}
