import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="container page-pad not-found">
      <p className="big-404">404</p>
      <h1>{t("nf.title")}</h1>
      <p className="muted">{t("nf.sub")}</p>
      <Link to="/" className="btn primary">{t("movie.back")}</Link>
    </div>
  );
}
