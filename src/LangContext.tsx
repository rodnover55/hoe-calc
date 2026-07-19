import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Lang } from './i18n';
import { DEFAULT_LANG, LANGUAGES, translate } from './i18n';

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Перевод ключа на текущий язык с подстановкой {параметров} */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'lang';

const KNOWN = new Set(LANGUAGES.map((language) => language.code));

/** Сохранённый язык, иначе первый подходящий язык браузера, иначе русский */
const initialLang = (): Lang => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Приватный режим или запрет хранилища: остаёмся на определении по браузеру.
  }
  if (saved && KNOWN.has(saved)) return saved;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (code && KNOWN.has(code)) return code;
  }
  return DEFAULT_LANG;
};

const I18nContext = createContext<I18n>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, params) => translate(DEFAULT_LANG, key, params),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Хранилище недоступно: выбор языка проживёт до перезагрузки.
    }
    document.documentElement.lang = lang;
    document.title = translate(lang, 'app.docTitle');
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- хук неотделим от провайдера
export const useI18n = (): I18n => useContext(I18nContext);
