/**
 * Общие хелперы скраперов olden-era.com: загрузка страниц с повторами,
 * раскодирование HTML-сущностей и экранирование строк для YAML.
 */
import { setTimeout as sleep } from 'node:timers/promises';

export const BASE = 'https://www.olden-era.com';
export const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function fetchUrl(
  url: string,
  headers: Record<string, string> = {},
): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': UA, ...headers },
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.arrayBuffer();
    } catch (e) {
      if (attempt === 2) throw e;
      console.log(`  повтор ${url}: ${e}`);
      await sleep(2000);
    }
  }
}

export const fetchText = async (url: string): Promise<string> =>
  new TextDecoder().decode(await fetchUrl(url));

/** Именованные HTML-сущности, встречающиеся в текстах сайта */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '­',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
};

/** Числовые ссылки и сущности из NAMED_ENTITIES; прочие остаются как есть */
export function unescapeHtml(s: string): string {
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? whole;
  });
}

export const q = (s: string): string => JSON.stringify(s);
