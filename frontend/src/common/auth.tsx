import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  setUnauthorizedHandler,
  type Lang,
  type User,
} from "../api/client";
import { I18nProvider, storeLang, storedLang } from "./i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionKey } from "../api/query-client";

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
  const client = useQueryClient();
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) =>
      api<{ user: User | null }>("/auth/session", { signal }),
    retry: false,
    staleTime: Infinity,
  });
  const user = session.data?.user ?? null;
  const loading = session.isPending;
  const [guestLang, setGuestLang] = useState<Lang>(storedLang);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void client.cancelQueries({ queryKey: ["viewer"] });
      client.removeQueries({ queryKey: ["viewer"] });
      client.getMutationCache().clear();
      client.setQueryData(sessionKey, { user: null });
    });
    return () => setUnauthorizedHandler(null);
  }, [client]);

  const setUserState = useCallback(
    (u: User | null) => {
      const previous = client.getQueryData<{ user: User | null }>(
        sessionKey,
      )?.user;
      if (previous?.id !== u?.id || previous?.language !== u?.language) {
        void client.cancelQueries({ queryKey: ["viewer"] });
        client.removeQueries({ queryKey: ["viewer"] });
        client.getMutationCache().clear();
      }
      if (u) {
        client.setQueriesData<User>(
          {
            predicate: (query) =>
              query.queryKey[0] === "viewer" &&
              query.queryKey[1] === u.id &&
              query.queryKey[3] === "profile" &&
              query.queryKey[4] === u.id,
          },
          u,
        );
      }
      client.setQueryData(sessionKey, { user: u });
    },
    [client],
  );

  const setUser = useCallback(
    (u: User | null) => {
      setUserState(u);
      if (u) {
        storeLang(u.language);
        setGuestLang(u.language);
      }
    },
    [setUserState],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUserState(null);
    }
  }, [setUserState]);

  const language = user?.language ?? guestLang;

  const setLanguage = useCallback(
    async (l: Lang) => {
      storeLang(l);
      setGuestLang(l);
      if (user) {
        const r = await api<{ ok: boolean; user?: User }>("/me", {
          method: "PATCH",
          json: { language: l },
        });
        if (r.ok && r.user) setUserState(r.user);
      }
    },
    [user, setUserState],
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
