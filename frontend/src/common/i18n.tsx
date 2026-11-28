import { useEffect, useCallback, type ReactNode } from "react";
import i18next from "i18next";
import {
  initReactI18next,
  I18nextProvider,
  useTranslation,
} from "react-i18next";
import type { Lang } from "../api/client";

import { en, enSingular } from "./locales/en";
import { fr, frSingular } from "./locales/fr";
import { es, esSingular } from "./locales/es";

type Key = keyof typeof en;
type Dict = Record<Key, string>;
const DICTS: Record<Lang, Dict> = { en, fr, es };
const SINGULAR = { en: enSingular, fr: frSingular, es: esSingular };

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

export type TFunction = (
  key: Key,
  params?: Record<string, string | number>,
) => string;

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(DICTS).map(([lang, translation]) => [
      lang,
      {
        translation: {
          ...translation,
          ...SINGULAR[lang as Lang],
          "lib.count_other": translation["lib.count"],
          "movie.chars_left_other": translation["movie.chars_left"],
        },
      },
    ]),
  ),
  lng: storedLang(),
  fallbackLng: "en",
  supportedLngs: ["en", "fr", "es"],
  keySeparator: false,
  initAsync: false,
  interpolation: { prefix: "{", suffix: "}", escapeValue: false },
  react: { useSuspense: false },
});

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  useEffect(() => {
    void i18n.changeLanguage(lang);
  }, [lang]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useI18n() {
  const { t: translate, i18n: instance } = useTranslation();
  const t = useCallback<TFunction>(
    (key, params) =>
      String(
        translate(key, {
          ...params,
          ...(typeof params?.n === "number" ? { count: params.n } : {}),
        }),
      ),
    [translate],
  );
  const lang = isLang(instance.resolvedLanguage)
    ? instance.resolvedLanguage
    : "en";
  return { lang, t };
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fr" || value === "es";
}

export function storedLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const v = localStorage.getItem("ht_lang");
    if (isLang(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

export function storeLang(lang: Lang) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("ht_lang", lang);
  } catch {
    /* storage unavailable */
  }
}
