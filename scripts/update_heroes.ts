/**
 * Обновление базы героев с olden-era.com.
 *
 * Скачивает список героев (слаги и портреты), русские и английские
 * страницы героев (имя, класс, статы, специализация, стартовые навыки),
 * описания навыков и портреты, затем перезаписывает src/data/heroes/ и
 * public/heroes/.
 *
 * Запуск из корня проекта: npm run update-heroes
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BASE, fetchText, fetchUrl, q, unescapeHtml } from './scrape_common.ts';

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(PROJECT, 'src', 'data', 'heroes');
const IMG_DIR = path.join(PROJECT, 'public', 'heroes');

/** Фракции героев; у нейтралов героев нет */
const FACTIONS = new Set(['temple', 'necropolis', 'sylvan', 'dungeon', 'hive', 'schism']);

/** Строка списка героев: слаг и абсолютный URL портрета (внешний хостинг) */
export interface HeroListItem {
  slug: string;
  img: string;
}

/** Данные страницы героя на одном языке; null — не найдено в разметке */
export interface ParsedHero {
  name: string | null;
  className: string | null;
  faction: string | null;
  attack: number | null;
  defense: number | null;
  spellPower: number | null;
  knowledge: number | null;
  specName: string | null;
  specDescription: string | null;
  skillIds: string[];
}

/** Название и описание навыка на одном языке */
export interface ParsedSkill {
  name: string | null;
  description: string | null;
}

/** Текст без тегов с нормализованными пробелами и сущностями */
const cleanText = (html: string): string =>
  unescapeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Упорядоченный список героев со страницы /ru/heroes (на EN якорей нет) */
export function parseHeroList(html: string): HeroListItem[] {
  const pattern = /<a[^>]+href="\/ru\/heroes\/([a-z0-9_-]+)"[^>]*>(.*?)<\/a>/gs;
  const items: HeroListItem[] = [];
  const seen = new Set<string>();
  for (const [, slug, inner] of html.matchAll(pattern)) {
    const img = /<img src="(https?:\/\/[^"]+)"/.exec(inner);
    if (!img || seen.has(slug)) continue;
    seen.add(slug);
    items.push({ slug, img: img[1] });
  }
  return items;
}

const HERO_STAT_RE: Record<'attack' | 'defense' | 'spellPower' | 'knowledge', RegExp> = {
  attack: statRe('attack'),
  defense: statRe('defence'),
  spellPower: statRe('spell_power'),
  // «Знание» на сайте названо inteligence (без второй l) — это формат данных.
  knowledge: statRe('inteligence'),
};

function statRe(icon: string): RegExp {
  return new RegExp(
    `/img/stats/${icon}\\.webp"[^>]*/></span><span class="stat-value">(\\d+)</span>`,
  );
}

export function parseHero(html: string): ParsedHero {
  const num = (re: RegExp): number | null => {
    const m = re.exec(html);
    return m ? Number(m[1]) : null;
  };
  const name = /hero-content-name-item-header2[^"]*"[^>]*><h2>([^<]+)<\/h2>/.exec(html);
  const className = /hero-content-class-title[^>]*>.*?<\/span>:\s*(?:<!-- -->)?([^<]+)</.exec(html);
  const faction = /hero-content-fraction-img"><img src="\/img\/factions\/([a-z_]+)\.webp"/.exec(html);
  const specName = /specialty-name">([^<]+)</.exec(html);
  // Первый тултип специализации после её имени; блок дублируется — берём первый.
  const specWindow = specName ? html.slice(specName.index) : '';
  const specDesc = /unit-content-ability-tooltip-desc">(.*?)<\/span>/s.exec(specWindow);
  const skillIds: string[] = [];
  for (const [, id] of html.matchAll(/class="hero-content-skill" title="([a-z0-9_]+)"/g)) {
    if (!skillIds.includes(id)) skillIds.push(id);
  }
  return {
    name: name ? cleanText(name[1]) : null,
    className: className ? cleanText(className[1]) : null,
    faction: faction?.[1] ?? null,
    attack: num(HERO_STAT_RE.attack),
    defense: num(HERO_STAT_RE.defense),
    spellPower: num(HERO_STAT_RE.spellPower),
    knowledge: num(HERO_STAT_RE.knowledge),
    specName: specName ? cleanText(specName[1]) : null,
    specDescription: specDesc ? cleanText(specDesc[1]) : null,
    skillIds,
  };
}

/** Название (из <title> до « — ») и описание со страницы навыка */
export function parseSkill(html: string): ParsedSkill {
  const title = /<title>([^<]+?) — /.exec(html);
  const desc = /skill-description-section">(.*?)<\/div>/s.exec(html);
  return {
    name: title ? cleanText(title[1]) : null,
    description: desc ? cleanText(desc[1]) : null,
  };
}

/** Идентификатор специализации: слаг английского названия */
export function specId(nameEn: string): string {
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Собранный герой: обе языковые версии и данные списка */
export interface Hero {
  slug: string;
  img: string;
  ru: ParsedHero;
  en: ParsedHero;
}

export function emitHero(hero: Hero, skills: Map<string, { ru: ParsedSkill; en: ParsedSkill }>): string {
  const { slug, ru, en } = hero;
  const lines = [
    `id: ${slug}`,
    `name: ${q(ru.name ?? '')}`,
    `nameEn: ${q(en.name ?? '')}`,
    `faction: ${ru.faction}`,
    `class: ${q(ru.className ?? '')}`,
    `classEn: ${q(en.className ?? '')}`,
    `image: heroes/${ru.faction}/${slug}.webp`,
    'stats:',
    `  attack: ${ru.attack}`,
    `  defense: ${ru.defense}`,
    `  spellPower: ${ru.spellPower}`,
    `  knowledge: ${ru.knowledge}`,
    'specialization:',
    `  id: ${specId(en.specName ?? '')}`,
    `  name: ${q(ru.specName ?? '')}`,
    `  nameEn: ${q(en.specName ?? '')}`,
    `  description: ${q(ru.specDescription ?? '')}`,
    `  descriptionEn: ${q(en.specDescription ?? '')}`,
    'skills:',
  ];
  for (const id of ru.skillIds) {
    const skill = skills.get(id);
    lines.push(
      `  - id: ${id}`,
      `    name: ${q(skill?.ru.name ?? '')}`,
      `    nameEn: ${q(skill?.en.name ?? '')}`,
      `    description: ${q(skill?.ru.description ?? '')}`,
      `    descriptionEn: ${q(skill?.en.description ?? '')}`,
    );
  }
  lines.push(`source: ${BASE}/ru/heroes/${slug}`);
  return lines.join('\n') + '\n';
}

async function main(): Promise<number> {
  console.log('Загружаю список героев...');
  const list = parseHeroList(await fetchText(`${BASE}/ru/heroes`));
  console.log(`Найдено героев: ${list.length}`);

  const heroes: Hero[] = [];
  const skillIds = new Set<string>();
  for (const [i, item] of list.entries()) {
    console.log(`[${i + 1}/${list.length}] ${item.slug}`);
    const ru = parseHero(await fetchText(`${BASE}/ru/heroes/${item.slug}`));
    const en = parseHero(await fetchText(`${BASE}/en/heroes/${item.slug}`));
    for (const id of ru.skillIds) skillIds.add(id);
    heroes.push({ slug: item.slug, img: item.img, ru, en });
    await sleep(300);
  }

  console.log(`Загружаю описания навыков (${skillIds.size})...`);
  const skills = new Map<string, { ru: ParsedSkill; en: ParsedSkill }>();
  for (const id of skillIds) {
    skills.set(id, {
      ru: parseSkill(await fetchText(`${BASE}/ru/skills/${id}`)),
      en: parseSkill(await fetchText(`${BASE}/en/skills/${id}`)),
    });
    await sleep(300);
  }

  const problems: string[] = [];
  for (const h of heroes) {
    const { ru, en } = h;
    if (!ru.name || !en.name) problems.push(`${h.slug}: нет имени`);
    if (!ru.faction || !FACTIONS.has(ru.faction)) {
      problems.push(`${h.slug}: неизвестная фракция ${ru.faction}`);
    }
    if ([ru.attack, ru.defense, ru.spellPower, ru.knowledge].some((v) => v === null)) {
      problems.push(`${h.slug}: неполные статы`);
    }
    if (!ru.specName || !ru.specDescription || !en.specName || !en.specDescription) {
      problems.push(`${h.slug}: неполная специализация`);
    }
    if (ru.skillIds.length === 0) problems.push(`${h.slug}: нет стартовых навыков`);
  }
  for (const [id, s] of skills) {
    if (!s.ru.name || !s.ru.description || !s.en.name || !s.en.description) {
      problems.push(`навык ${id}: неполные тексты`);
    }
  }
  if (problems.length > 0) {
    console.log(`ОШИБКА:\n  ${problems.join('\n  ')}`);
    return 1;
  }

  console.log('Скачиваю портреты...');
  for (const h of heroes) {
    // Портреты героев сайт держит на внешнем хостинге — качаем по полному URL.
    const img = new Uint8Array(await fetchUrl(h.img, { Referer: `${BASE}/` }));
    if (img.length === 0) {
      console.log(`ОШИБКА: пустой портрет у ${h.slug}`);
      return 1;
    }
    const imgPath = path.join(IMG_DIR, h.ru.faction as string, `${h.slug}.webp`);
    mkdirSync(path.dirname(imgPath), { recursive: true });
    writeFileSync(imgPath, img);
    await sleep(300);
  }

  for (const h of heroes) {
    const dir = path.join(DATA_DIR, h.ru.faction as string);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${h.slug}.yaml`), emitHero(h, skills));
  }
  console.log(`Готово: ${heroes.length} героев записано в ${DATA_DIR}`);
  return 0;
}

// Прямой запуск: node scripts/update_heroes.ts; при импорте main не выполняется.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
