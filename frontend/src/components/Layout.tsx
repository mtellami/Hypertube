import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { LANGUAGES, isLang, useI18n } from "../i18n";
import { CloseIcon, LogoutIcon, SearchIcon, SettingsIcon, UserIcon } from "./icons";
import { Avatar } from "./ui";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Hypertube">
      <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#141b30" />
        <path d="M22 18v28M42 18v28M22 32h20" stroke="url(#lg)" strokeWidth="7" strokeLinecap="round" />
      </svg>
      <span>Hyper<b>tube</b></span>
    </Link>
  );
}

function HeaderSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQ = location.pathname === "/" ? params.get("q") ?? "" : "";
  const [value, setValue] = useState(urlQ);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (!typed.current) return;
    const id = window.setTimeout(() => {
      typed.current = false;
      const next = new URLSearchParams(location.pathname === "/" ? params : undefined);
      const q = value.trim();
      if (q) next.set("q", q.slice(0, 100));
      else next.delete("q");
      const qs = next.toString();
      navigate(qs ? `/?${qs}` : "/", { replace: location.pathname === "/" });
    }, 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    typed.current = false;
    const q = value.trim();
    navigate(q ? `/?q=${encodeURIComponent(q.slice(0, 100))}` : "/");
  };

  return (
    <form className="header-search" role="search" onSubmit={submit}>
      <SearchIcon className="header-search-icon" />
      <input
        type="search"
        value={value}
        maxLength={100}
        placeholder={t("nav.search")}
        aria-label={t("nav.search")}
        onChange={(e) => {
          typed.current = true;
          setValue(e.target.value);
        }}
      />
      {value && (
        <button type="button" className="icon-btn ghost small" aria-label={t("nav.clear_search")}
          onClick={() => { typed.current = true; setValue(""); }}>
          <CloseIcon width={16} height={16} />
        </button>
      )}
    </form>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const doLogout = async () => {
    await logout();
    navigate("/login");
  };
  return (
    <div className="user-menu" ref={ref}>
      <button className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t("nav.menu")}
        onClick={() => setOpen((o) => !o)}>
        <Avatar url={user.profile_picture_url} name={user.username} first={user.first_name} last={user.last_name} size={36} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.first_name} {user.last_name}</strong>
            <span>@{user.username}</span>
          </div>
          <Link role="menuitem" to={`/users/${user.id}`}><UserIcon width={18} height={18} />{t("nav.profile")}</Link>
          <Link role="menuitem" to="/settings"><SettingsIcon width={18} height={18} />{t("nav.settings")}</Link>
        </div>
      )}
      <button className="icon-btn" onClick={doLogout} title={t("nav.logout")} aria-label={t("nav.logout")}>
        <LogoutIcon />
      </button>
    </div>
  );
}

function Header() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
      <div className="header-inner">
        <Logo />
        {user && (
          <nav className="main-nav" aria-label="Main">
            <NavLink to="/" end>{t("nav.library")}</NavLink>
          </nav>
        )}
        {user && <HeaderSearch />}
        <div className="header-actions">
          {!loading && !user && (
            <>
              <Link to="/login" className="btn ghost">{t("auth.sign_in")}</Link>
              <Link to="/register" className="btn primary">{t("auth.create_account")}</Link>
            </>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { t } = useI18n();
  const { language, setLanguage } = useAuth();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>{t("footer.tagline")}</p>
        </div>
        <div className="footer-meta">
          <p>{t("footer.sources")}</p>
          <p className="muted">{t("footer.legal")} · © {new Date().getFullYear()} Hypertube</p>
        </div>
        <label className="footer-lang">
          <span>{t("footer.language")}</span>
          <select value={language} onChange={(e) => isLang(e.target.value) && void setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </div>
    </footer>
  );
}

export default function Layout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  return (
    <div className="app">
      <Header />
      <main className="site-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
