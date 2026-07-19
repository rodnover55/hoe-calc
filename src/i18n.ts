/**
 * Локализация интерфейса.
 *
 * Каждый язык — отдельный yaml-файл в src/locales/: code, label (подпись
 * кнопки переключателя), locale (BCP-47 для формата чисел и правил
 * множественного числа) и strings — вложенные секции строк, при загрузке
 * разворачиваемые в плоские ключи через точку («cards.dies»). Новый язык
 * подхватывается автоматически; недостающие ключи берутся из русской
 * локали — она эталонная и содержит полный набор.
 */

import { parse } from 'yaml';

/** Код языка интерфейса: «ru», «en», … */
export type Lang = string;

export interface Language {
  code: Lang;
  /** Подпись на кнопке переключателя */
  label: string;
  /** BCP-47-локаль: формат чисел и правила множественного числа */
  locale: string;
  /** Строки локали: вложенные секции yaml развёрнуты в ключи через точку */
  strings: Record<string, string>;
}

interface LocaleFile {
  code: string;
  label: string;
  locale: string;
  strings: Record<string, unknown>;
}

const flatten = (
  node: Record<string, unknown>,
  prefix: string,
  out: Record<string, string>,
): Record<string, string> => {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      flatten(value as Record<string, unknown>, path, out);
    } else {
      out[path] = String(value);
    }
  }
  return out;
};

const files = import.meta.glob('./locales/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const LANGUAGES: Language[] = Object.values(files)
  .map((raw) => parse(raw) as LocaleFile)
  .map((file) => ({
    code: file.code,
    label: file.label,
    locale: file.locale,
    strings: flatten(file.strings, '', {}),
  }))
  .sort((a, b) => a.code.localeCompare(b.code, 'en'));

const byCode = new Map(LANGUAGES.map((language) => [language.code, language]));

/** Эталонный язык: полный набор ключей, фолбэк для остальных */
export const DEFAULT_LANG: Lang = byCode.has('ru') ? 'ru' : LANGUAGES[0].code;

const lookup = (lang: Lang, key: string): string | undefined =>
  byCode.get(lang)?.strings[key] ?? byCode.get(DEFAULT_LANG)?.strings[key];

/** Перевод ключа с подстановкой {параметров}; нет перевода — сам ключ */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = lookup(lang, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params[name] !== undefined ? String(params[name]) : whole,
  );
}

const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * Форма слова по числу: ключ — секция локали с формами по категориям
 * Intl.PluralRules (one/few/many/other); отсутствующая категория берётся
 * из other.
 */
export function pluralWord(lang: Lang, key: string, n: number): string {
  const locale = numberLocale(lang);
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return lookup(lang, `${key}.${rules.select(n)}`) ?? translate(lang, `${key}.other`);
}

/** Локаль форматирования чисел выбранного языка */
export const numberLocale = (lang: Lang): string => byCode.get(lang)?.locale ?? lang;
