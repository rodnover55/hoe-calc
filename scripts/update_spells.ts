/**
 * Обновление каталога заклинаний с olden-era.com.
 *
 * Скачивает список заклинаний (слаги, включая «искусные» варианты `_m`),
 * затем русскую и английскую страницы каждого заклинания и перезаписывает
 * src/data/spells/. Название, школа, тир, мана и тексты четырёх уровней
 * берутся из JSON-LD страницы (CreativeWork): имена свойств английские в
 * обеих локалях, значения локализованы; школа — из пути собственной
 * картинки заклинания (у `_m`-вариантов она совпадает с базовой).
 * Иконки скачиваются в public/spells/<школа>/.
 *
 * Запуск из корня проекта: npm run update-spells
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BASE, fetchText, fetchUrl, q, unescapeHtml } from './scrape_common.ts';

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(PROJECT, 'src', 'data', 'spells');
const IMG_DIR = path.join(PROJECT, 'public', 'spells');

const SCHOOLS = ['arcane', 'daylight', 'nightshade', 'primal'] as const;

/** Текст без тегов с нормализованными пробелами и сущностями */
const cleanText = (html: string): string =>
  unescapeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Данные страницы заклинания на одном языке */
export interface ParsedSpellPage {
  /** Локализованное название; null — не найдено */
  name: string | null;
  /** Школа из пути картинки заклинания; null — не найдена */
  school: string | null;
  /** Путь картинки относительно /img/ («spells/daylight/blessing.webp») */
  image: string | null;
  tier: number | null;
  mana: number | null;
  /** Тексты уровней 1–4 из свойства «Level Effects» */
  levels: string[];
}

/** Тексты уровней из значения «Level Effects»: «tier1: … | tier2: …» */
export function parseLevelEffects(value: string): string[] {
  const levels: string[] = [];
  for (const part of value.split(/\s*\|\s*(?=tier\d+:)/)) {
    const m = part.match(/^tier(\d+):\s*(.*)$/s);
    if (m) levels[Number(m[1]) - 1] = cleanText(m[2]);
  }
  return levels;
}

export function parseSpellPage(html: string): ParsedSpellPage {
  const page: ParsedSpellPage = {
    name: null,
    school: null,
    image: null,
    tier: null,
    mana: null,
    levels: [],
  };
  for (const [, raw] of html.matchAll(
    /<script type="application\/ld\+json">(.*?)<\/script>/gs,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const work = data as {
      '@type'?: string;
      name?: string;
      image?: string;
      additionalProperty?: { name?: string; value?: unknown }[];
    };
    if (work['@type'] !== 'CreativeWork') continue;
    page.name = cleanText(String(work.name ?? '')) || null;
    const img = String(work.image ?? '').match(/\/img\/(spells\/([a-z0-9_]+)\/[a-z0-9_]+\.webp)$/);
    if (img) {
      page.image = img[1];
      page.school = img[2];
    }
    for (const prop of work.additionalProperty ?? []) {
      const value = cleanText(String(prop.value));
      if (prop.name === 'Tier / Level') page.tier = Number(value);
      if (prop.name === 'Mana Cost') page.mana = Number(value);
      if (prop.name === 'Level Effects') {
        page.levels = parseLevelEffects(String(prop.value));
      }
    }
  }
  return page;
}

/** Собранное заклинание: слаг и страницы на обоих языках */
export interface SpellData {
  slug: string;
  ru: ParsedSpellPage;
  en: ParsedSpellPage;
}

export function emitSpell(spell: SpellData): string {
  const lines = [
    `id: ${spell.slug}`,
    `name: ${q(spell.ru.name ?? '')}`,
    `nameEn: ${q(spell.en.name ?? '')}`,
    `school: ${spell.ru.school ?? ''}`,
    `tier: ${spell.ru.tier ?? 0}`,
    `mana: ${spell.ru.mana ?? 0}`,
    `image: ${spell.ru.image ?? ''}`,
    'levels:',
  ];
  spell.ru.levels.forEach((text, i) => {
    lines.push(
      `  - description: ${q(text)}`,
      `    descriptionEn: ${q(spell.en.levels[i] ?? '')}`,
    );
  });
  lines.push(`source: ${BASE}/ru/spells/${spell.slug}`);
  return lines.join('\n') + '\n';
}

/** Слаги заклинаний со страницы списка, по алфавиту */
export function parseSpellList(html: string): string[] {
  const slugs = new Set<string>();
  for (const [, slug] of html.matchAll(/href="\/ru\/spells\/([a-z0-9_]+)"/g)) {
    slugs.add(slug);
  }
  return [...slugs].sort();
}

function validate(spells: SpellData[]): string[] {
  const problems: string[] = [];
  for (const spell of spells) {
    if (!spell.ru.name || !spell.en.name) {
      problems.push(`${spell.slug}: нет названия`);
    }
    if (!spell.ru.school || !SCHOOLS.includes(spell.ru.school as (typeof SCHOOLS)[number])) {
      problems.push(`${spell.slug}: неизвестная школа «${spell.ru.school}»`);
    }
    if (spell.ru.school !== spell.en.school) {
      problems.push(`${spell.slug}: школы ru и en не совпадают`);
    }
    if (!Number.isFinite(spell.ru.tier) || (spell.ru.tier ?? 0) < 1) {
      problems.push(`${spell.slug}: некорректный тир «${spell.ru.tier}»`);
    }
    if (!Number.isFinite(spell.ru.mana) || (spell.ru.mana ?? -1) < 0) {
      problems.push(`${spell.slug}: некорректная мана «${spell.ru.mana}»`);
    }
    if (spell.ru.levels.length === 0) {
      problems.push(`${spell.slug}: нет текстов уровней`);
    }
    if (spell.ru.levels.length !== spell.en.levels.length) {
      problems.push(`${spell.slug}: число уровней ru и en не совпадает`);
    }
    for (const [i, text] of [...spell.ru.levels, ...spell.en.levels].entries()) {
      if (!text) problems.push(`${spell.slug}: пустой текст уровня #${i + 1}`);
    }
  }
  return problems;
}

async function main(): Promise<number> {
  console.log('Загружаю список заклинаний...');
  const slugs = parseSpellList(await fetchText(`${BASE}/ru/spells`));
  console.log(`Найдено заклинаний: ${slugs.length}`);

  const spells: SpellData[] = [];
  for (const [i, slug] of slugs.entries()) {
    console.log(`[${i + 1}/${slugs.length}] ${slug}`);
    const ru = parseSpellPage(await fetchText(`${BASE}/ru/spells/${slug}`));
    const en = parseSpellPage(await fetchText(`${BASE}/en/spells/${slug}`));
    spells.push({ slug, ru, en });
    await sleep(300);
  }

  const problems = validate(spells);
  if (problems.length > 0) {
    console.log(`ОШИБКА:\n  ${problems.join('\n  ')}`);
    return 1;
  }
  for (const spell of spells) {
    if (spell.ru.levels.length !== 4) {
      console.log(`Внимание: у ${spell.slug} уровней не 4, а ${spell.ru.levels.length}`);
    }
  }

  for (const spell of spells) {
    const dir = path.join(DATA_DIR, spell.ru.school ?? '');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${spell.slug}.yaml`), emitSpell(spell));
  }

  // Иконки: у `_m`-вариантов картинка базового заклинания — качаем без повторов.
  const images = [...new Set(spells.map((s) => s.ru.image).filter((s) => s !== null))];
  for (const image of images) {
    const target = path.join(IMG_DIR, path.relative('spells', image));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, new Uint8Array(await fetchUrl(`${BASE}/img/${image}`)));
    await sleep(300);
  }

  console.log(`Готово: ${spells.length} заклинаний записано в ${DATA_DIR}`);
  return 0;
}

// Прямой запуск: node scripts/update_spells.ts; при импорте main не выполняется.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
