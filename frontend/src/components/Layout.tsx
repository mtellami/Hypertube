import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { iconButtonStyles, buttonStyles } from "./ui-styles";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../common/auth";
import { LANGUAGES, isLang, useI18n } from "../common/i18n";
import { LuX, LuLogOut, LuSearch, LuSettings, LuUser } from "react-icons/lu";
import { Avatar } from "./ui";

export function Logo() {
  return (
    <Link
      to="/"
      className={`
        logo [&_b]:font-bold [&_b]:bg-(image:--accent-grad) [&_b]:[-webkit-background-clip:text]
        [&_b]:[background-clip:text] [&_b]:text-transparent phone:[&_span]:hidden inline-flex items-center
        gap-2.5 font-heading text-[1.22rem] font-semibold tracking-[-0.03em] shrink-0
      `}
      aria-label="Hypertube"
    >
      <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#141b30" />
        <path
          d="M22 18v28M42 18v28M22 32h20"
          stroke="url(#lg)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
      <span>
        Hyper<b>tube</b>
      </span>
    </Link>
  );
}

function HeaderSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQ = location.pathname === "/" ? (params.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQ);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (!typed.current) return;
    const id = window.setTimeout(() => {
      typed.current = false;
      const next = new URLSearchParams(
        location.pathname === "/" ? params : undefined,
      );
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
    <form
      className={`
        header-search [padding:0_8px_0_40px] [transition:border-color_0.2s,_background_0.2s,_box-shadow_0.2s]
        focus-within:border-[rgba(var(--accent-2-rgb),_0.55)] focus-within:bg-white/9
        focus-within:shadow-[0_0_0_4px_rgba(var(--accent-rgb),_0.12)] [&_input]:flex-1 [&_input]:min-w-0
        [&_input]:h-full [&_input]:bg-transparent [&_input]:border-0 [&_input]:outline-none
        [&_input]:text-[0.93rem] [&_input::-webkit-search-cancel-button]:hidden [&_+_.header-actions]:ml-0
        mobile:[order:3] mobile:[flex-basis:100%] mobile:max-w-[none] mobile:m-0 mobile:h-10 flex-1 max-w-130
        ml-auto relative flex items-center bg-white/6 border border-outline rounded-full h-10.5
      `}
      role="search"
      onSubmit={submit}
    >
      <LuSearch className="absolute left-3.5 text-muted" />
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
        <button
          type="button"
          className={iconButtonStyles({ ghost: true, small: true })}
          aria-label={t("nav.clear_search")}
          onClick={() => {
            typed.current = true;
            setValue("");
          }}
        >
          <LuX size={16} />
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
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  if (!user) return null;
  const doLogout = async () => {
    await logout();
    navigate("/login");
  };
  return (
    <div className="relative flex items-center gap-2.5">
      <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            className={`
          avatar-btn [border:2px_solid_transparent] bg-transparent [transition:border-color_0.2s]
          hover:border-[var(--accent)] [&[aria-expanded='true']]:border-[var(--accent)] p-0 rounded-full
        `}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t("nav.menu")}
          >
            <Avatar
              url={user.profile_picture_url}
              name={user.username}
              first={user.first_name}
              last={user.last_name}
              size={36}
            />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="end"
            sideOffset={10}
            collisionPadding={8}
            className={`
            menu shadow-[var(--shadow)] animate-[pop_0.18s_var(--ease)] [&_a]:flex [&_a]:items-center
            [&_a]:gap-2.5 [&_a]:pt-2.5 [&_a]:pb-2.5 [&_a]:pl-3 [&_a]:pr-3 [&_a]:rounded-[10px]
            [&_a]:text-secondary [&_a]:text-[0.92rem] [&_a:hover]:bg-white/6 [&_a:hover]:text-foreground
            z-60 [&_a[data-highlighted]]:bg-white/6 [&_a[data-highlighted]]:text-foreground [&_a]:outline-none min-w-55 p-2 bg-surface-raised border
            border-outline-strong rounded-card
          `}
            role="menu"
          >
            <div className="menu-head [padding:10px_12px_12px] [border-bottom:1px_solid_var(--line)] [&_span]:text-muted [&_span]:text-[0.84rem] mb-1.5 grid">
              <strong>
                {user.first_name} {user.last_name}
              </strong>
              <span>@{user.username}</span>
            </div>
            <DropdownMenu.Item asChild>
              <Link to={`/users/${user.id}`}>
                <LuUser size={18} />
                {t("nav.profile")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link to="/settings">
                <LuSettings size={18} />
                {t("nav.settings")}
              </Link>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button
        className={`${iconButtonStyles()}`}
        onClick={doLogout}
        title={t("nav.logout")}
        aria-label={t("nav.logout")}
      >
        <LuLogOut />
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
    <header
      className={`site-header bg-header-fade [transition:background_0.3s,_box-shadow_0.3s,_backdrop-filter_0.3s] [&.scrolled]:[background:rgba(9,_12,_24,_0.82)] [&.scrolled]:[backdrop-filter:blur(18px)_saturate(1.4)] [&.scrolled]:shadow-[0_1px_0_var(--line)] mobile:[background:rgba(9,_12,_24,_0.92)] mobile:[backdrop-filter:blur(16px)] fixed inset-[0_0_auto_0] z-[50] h-[var(--header-h)] ${scrolled ? "scrolled" : ""}`}
    >
      <div
        className={`
        header-inner mobile:flex-wrap mobile:content-center mobile:gap-y-2.5 mobile:gap-x-3.5 mobile:pt-2.5
        mobile:pb-2.5 h-full max-w-360 p-[0_var(--gutter)] flex items-center gap-5.5 my-0 mx-auto
      `}
      >
        <Logo />
        {user && (
          <nav
            className={`
            main-nav [&_a]:text-secondary [&_a]:font-medium [&_a]:text-[0.93rem] [&_a]:pt-2 [&_a]:pb-2 [&_a]:pl-1
            [&_a]:pr-1 [&_a]:[border-bottom:2px_solid_transparent] [&_a]:[transition:color_0.2s]
            [&_a:hover]:text-foreground [&_a.active]:text-foreground [&_a.active]:border-[var(--accent)]
            mobile:hidden
          `}
            aria-label="Main"
          >
            <NavLink to="/" end>
              {t("nav.library")}
            </NavLink>
          </nav>
        )}
        {user && <HeaderSearch />}
        <div
          className={`
          header-actions phone:[&_.btn]:pt-0 phone:[&_.btn]:pb-0 phone:[&_.btn]:pl-3 phone:[&_.btn]:pr-3
          phone:[&_.btn]:h-9 phone:[&_.btn]:text-[0.82rem] flex items-center gap-2.5 ml-auto
        `}
        >
          {!loading && !user && (
            <>
              <Link to="/login" className={buttonStyles({ variant: "ghost" })}>
                {t("auth.sign_in")}
              </Link>
              <Link
                to="/register"
                className={buttonStyles({ variant: "primary" })}
              >
                {t("auth.create_account")}
              </Link>
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
    <footer className="site-footer [border-top:1px_solid_var(--line)] bg-canvas-alt mt-10">
      <div className="footer-inner mobile:flex-col mobile:items-start mobile:gap-4.5 max-w-360 p-[34px_var(--gutter)] flex gap-8 items-center justify-between flex-wrap my-0 mx-auto">
        <div className="footer-brand [&_p]:text-muted [&_p]:text-[0.88rem] grid gap-2">
          <Logo />
          <p>{t("footer.tagline")}</p>
        </div>
        <div className="flex-1 min-w-60 max-w-140 text-[0.84rem] text-secondary grid gap-1">
          <p>{t("footer.sources")}</p>
          <p className="text-muted">
            {t("footer.legal")} · © {new Date().getFullYear()} Hypertube
          </p>
        </div>
        <label
          className={`
          footer-lang [&_select]:bg-surface-raised [&_select]:border [&_select]:border-outline-strong
          [&_select]:rounded-[10px] [&_select]:h-10 [&_select]:px-3 [&_select]:py-0 [&_select]:outline-none
          flex items-center gap-2.5 text-muted text-[0.86rem]
        `}
        >
          <span>{t("footer.language")}</span>
          <select
            value={language}
            onChange={(e) =>
              isLang(e.target.value) && void setLanguage(e.target.value)
            }
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
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
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
