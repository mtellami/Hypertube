import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, type Lang, type User } from "./api";
import { I18nProvider, storeLang, storedLang } from "./i18n";

interface AuthValue {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  language: Lang;
  setLanguage: (l: Lang) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestLang, setGuestLang] = useState<Lang>(storedLang);

  useEffect(() => {
    setUnauthorizedHandler(() => setUserState(null));
    api<{ user: User | null }>("/auth/session")
      .then((r) => setUserState(r.user))
      .catch(() => setUserState(null))
      .finally(() => setLoading(false));
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) {
      storeLang(u.language);
      setGuestLang(u.language);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUserState(null);
    }
  }, []);

  const language = user?.language ?? guestLang;

  const setLanguage = useCallback(
    async (l: Lang) => {
      storeLang(l);
      setGuestLang(l);
      if (user) {
        const r = await api<{ ok: boolean; user?: User }>("/me", { method: "PATCH", json: { language: l } });
        if (r.ok && r.user) setUserState(r.user);
      }
    },
    [user],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({ user, loading, setUser, logout, language, setLanguage }),
    [user, loading, setUser, logout, language, setLanguage],
  );
  return (
    <AuthContext.Provider value={value}>
      <I18nProvider lang={language}>{children}</I18nProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
