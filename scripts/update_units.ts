/**
 * Обновление базы юнитов с olden-era.com.
 *
 * Скачивает список юнитов (RU-имена и фракции), статы с английских
 * страниц, способности с русских и английских страниц и портреты, затем
 * перезаписывает src/data/units/ и public/units/.
 *
 * Запуск из корня проекта: npm run update-units
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BASE, fetchText, fetchUrl, q, unescapeHtml } from './scrape_common.ts';

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(PROJECT, 'src', 'data', 'units');
const IMG_DIR = path.join(PROJECT, 'public', 'units');

/** Строка списка юнитов: слаг, имя на языке страницы, фракция, портрет */
export interface ListItem {
  slug: string;
  name: string;
  faction: string;
  img: string;
}

/** Способность юнита: слаг иконки, русские и английские тексты */
export interface Ability {
  id: string;
  name: string;
  description: string;
  /** Английские название и описание; нет — способность не найдена на EN-странице */
  nameEn?: string;
  descriptionEn?: string;
}

/** Статы со страницы юнита; null — значение не найдено в разметке */
export interface ParsedStats {
  tier: number | null;
  health: number | null;
  attack: number | null;
  defense: number | null;
  initiative: number | null;
  speed: number | null;
  growth: number | null;
  damageMin: number | null;
  damageMax: number | null;
  cost: number | null;
  attackType: 'melee' | 'long_reach' | 'ranged';
  flying: boolean;
}

/** Собранный юнит; grade и upgradeOf проставляет assignGrades */
export interface Unit extends ParsedStats {
  slug: string;
  nameRu: string;
  nameEn: string;
  faction: string;
  abilities: Ability[];
  grade: number;
  upgradeOf?: string;
}

function stripText(html: string): string {
  return html
    .replace(/<script.*?<\/script>/gs, ' ')
    .replace(/<style.*?<\/style>/gs, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/\s+/g, ' ')
    .replace(/\s*\|[\s|]*/g, '|');
}

/** Упорядоченный список юнитов со страницы /<lang>/units */
export function parseList(html: string, lang: string): ListItem[] {
  const pattern = new RegExp(
    `<a[^>]+href="(/${lang}/units/([^"?]+))[^"]*"[^>]*>(.*?)</a>`,
    'gs',
  );
  const items: ListItem[] = [];
  for (const [, , slug, inner] of html.matchAll(pattern)) {
    const img = /src="(\/img\/units\/([a-z_]+)\/[^"]+)"/.exec(inner);
    if (!img) continue;
    const name = inner.replace(/<[^>]+>/g, ' ');
    items.push({
      slug,
      name: unescapeHtml(name.replace(/\s+/g, ' ').trim()),
      faction: img[2],
      img: img[1],
    });
  }
  return items;
}

const STAT_RE = {
  health: /health\|:\|(\d+)/,
  attack: /attack\|:\|(\d+)/,
  defense: /defence\|:\|(\d+)/,
  initiative: /initiative\|:\|(\d+)/,
  speed: /speed\|:\|(\d+)/,
  growth: /growth\|:\|(\d+)/,
};

export function parseUnit(html: string): ParsedStats {
  const t = stripText(html);
  const num = (re: RegExp): number | null => {
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  };
  const damage = /damage\|:\|(\d+)(?:\s*[–—-]\s*(\d+))?\|/.exec(t);
  return {
    tier: num(/Tier\|(\d+)\|/),
    health: num(STAT_RE.health),
    attack: num(STAT_RE.attack),
    defense: num(STAT_RE.defense),
    initiative: num(STAT_RE.initiative),
    speed: num(STAT_RE.speed),
    growth: num(STAT_RE.growth),
    damageMin: damage ? Number(damage[1]) : null,
    damageMax: damage ? Number(damage[2] ?? damage[1]) : null,
    cost: num(/Cost\|(\d+)/),
    attackType: /\/img\/abilities\/(ranged_attack|shooter)\b/.test(html)
      ? 'ranged'
      : html.includes('/img/abilities/long_reach')
        ? 'long_reach'
        : 'melee',
    flying: html.includes('/img/abilities/flying'),
  };
}

const FLIGHT_CHUNK_RE = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

/**
 * Склеенный RSC-payload страницы Next.js без JS-экранирования.
 *
 * Склейка до разбора важна: карточка способности может быть разрезана
 * между соседними push-чанками.
 */
export function decodeFlight(html: string): string {
  return [...html.matchAll(FLIGHT_CHUNK_RE)]
    .map((m) => JSON.parse(`"${m[1]}"`) as string)
    .join('');
}

/** Позиция после закрывающей кавычки JSON-строки, открытой в i; −1 если нет */
function scanString(text: string, i: number): number {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '"') return j + 1;
  }
  return -1;
}

/** Позиция после JSON-значения (строки, массива, объекта или скаляра) в i */
function scanValue(text: string, i: number): number {
  const first = text[i];
  if (first === '"') return scanString(text, i);
  if (first === '[' || first === '{') {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (ch === '"') {
        const end = scanString(text, j);
        if (end === -1) return -1;
        j = end - 1;
      } else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return -1;
  }
  const m = /^[^\s,\]}]+/.exec(text.slice(i));
  return m ? i + m[0].length : -1;
}

/**
 * Первое JSON-значение в тексте с позиции start; за ним может идти любой
 * хвост (аналог json.JSONDecoder().raw_decode). undefined — не разобралось.
 */
export function rawDecode(text: string, start: number): unknown {
  const end = scanValue(text, start);
  if (end === -1) return undefined;
  try {
    return JSON.parse(text.slice(start, end));
  } catch {
    return undefined;
  }
}

/** Текст из дерева children RSC: строки собираются рекурсивно */
function collectText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    // Элемент React в RSC: ["$", "tag", key, {props}] — текст в children.
    if (node.length === 4 && node[0] === '$' && typeof node[3] === 'object'
        && node[3] !== null && !Array.isArray(node[3])) {
      const children = (node[3] as Record<string, unknown>).children;
      return children != null ? collectText(children) : '';
    }
    return node.map(collectText).join('');
  }
  return '';
}

/** Текст children первого узла с данным классом внутри окна */
function childrenText(window: string, className: string): string | null {
  const m = new RegExp(`${className}\\\\?",\\\\?"children\\\\?":`).exec(window);
  if (!m) return null;
  const value = rawDecode(window, m.index + m[0].length);
  if (value === undefined) return null;
  const text = collectText(value).replace(/\s+/g, ' ').trim();
  return unescapeHtml(text) || null;
}

/**
 * Способности юнита из RSC-payload: слаг иконки, название, описание.
 *
 * Окно карточки — от её иконки до следующей иконки способности; иконки
 * без тултипа рядом (декоративные повторы) пропускаются, слаги
 * дедуплицируются по первому полному вхождению.
 */
export function parseAbilities(flight: string): Ability[] {
  const abilities: Ability[] = [];
  const seen = new Set<string>();
  const icons = [...flight.matchAll(/\/img\/abilities\/([a-z0-9_]+)\.webp/g)];
  for (let i = 0; i < icons.length; i++) {
    const m = icons[i];
    const slug = m[1];
    const end = i + 1 < icons.length ? icons[i + 1].index : flight.length;
    const window = flight.slice(m.index + m[0].length, end);
    const name = childrenText(window, 'ability-tooltip-title')
      ?? childrenText(window, 'ability-name');
    if (!name || seen.has(slug)) continue;
    seen.add(slug);
    abilities.push({
      id: slug,
      name,
      description: childrenText(window, 'ability-tooltip-desc') ?? '',
    });
  }
  return abilities;
}

export function emit(unit: Unit): string {
  const lines = [
    `id: ${unit.slug}`,
    `name: ${q(unit.nameRu)}`,
    `nameEn: ${q(unit.nameEn)}`,
    `faction: ${unit.faction}`,
    `tier: ${unit.tier}`,
    `grade: ${unit.grade}`,
  ];
  if (unit.upgradeOf) lines.push(`upgradeOf: ${unit.upgradeOf}`);
  lines.push(
    `image: units/${unit.faction}/${unit.slug}.webp`,
    'stats:',
    `  health: ${unit.health}`,
    `  attack: ${unit.attack}`,
    `  defense: ${unit.defense}`,
    `  damageMin: ${unit.damageMin}`,
    `  damageMax: ${unit.damageMax}`,
    `  initiative: ${unit.initiative}`,
    `  speed: ${unit.speed}`,
    `attackType: ${unit.attackType}`,
    `flying: ${unit.flying}`,
  );
  if (unit.abilities.length > 0) {
    lines.push('abilities:');
    for (const a of unit.abilities) {
      lines.push(`  - id: ${a.id}`, `    name: ${q(a.name)}`);
      if (a.nameEn !== undefined) lines.push(`    nameEn: ${q(a.nameEn)}`);
      lines.push(`    description: ${q(a.description)}`);
      if (a.descriptionEn !== undefined) {
        lines.push(`    descriptionEn: ${q(a.descriptionEn)}`);
      }
    }
  }
  if (unit.growth !== null) lines.push(`growth: ${unit.growth}`);
  if (unit.cost !== null) lines.push(`cost: ${unit.cost}`);
  lines.push(`source: ${BASE}/ru/units/${unit.slug}`);
  return lines.join('\n') + '\n';
}

/**
 * Нейтралы — одиночные юниты; фракционные идут тройками:
 * база + два альтернативных улучшения одного тира.
 */
export function assignGrades(units: Unit[]): string[][] {
  for (const u of units) u.grade = 0;
  const factional = units.filter((u) => u.faction !== 'neutral');
  const problems: string[][] = [];
  for (let i = 0; i < factional.length; i += 3) {
    const group = factional.slice(i, i + 3);
    if (group.length !== 3
        || new Set(group.map((u) => u.faction)).size !== 1
        || new Set(group.map((u) => u.tier)).size !== 1) {
      problems.push(group.map((u) => u.slug));
      continue;
    }
    group.slice(1).forEach((u, idx) => {
      u.grade = idx + 1;
      u.upgradeOf = group[0].slug;
    });
  }
  return problems;
}

async function main(): Promise<number> {
  console.log('Загружаю списки юнитов...');
  const ruList = parseList(await fetchText(`${BASE}/ru/units`), 'ru');
  const enList = parseList(await fetchText(`${BASE}/en/units`), 'en');
  const enBySlug = new Map(enList.map((u) => [u.slug, u.name]));
  console.log(`Найдено юнитов: ${ruList.length}`);

  const units: Unit[] = [];
  for (const [i, u] of ruList.entries()) {
    const { slug } = u;
    console.log(`[${i + 1}/${ruList.length}] ${slug}`);
    const enHtml = await fetchText(`${BASE}/en/units/${slug}`);
    const stats = parseUnit(enHtml);
    const ruHtml = await fetchText(`${BASE}/ru/units/${slug}`);
    const enAbilities = new Map(
      parseAbilities(decodeFlight(enHtml)).map((a) => [a.id, a]),
    );
    const abilities = parseAbilities(decodeFlight(ruHtml)).map((a) => {
      const en = enAbilities.get(a.id);
      return en ? { ...a, nameEn: en.name, descriptionEn: en.description } : a;
    });
    const abilityIds = new Set(abilities.map((a) => a.id));
    const expected: Partial<Record<Unit['attackType'], string>> = {
      ranged: 'ranged_attack',
      long_reach: 'long_reach',
    };
    const marker = expected[stats.attackType];
    if (marker && !abilityIds.has(marker)) {
      console.log(
        `  ВНИМАНИЕ: attackType=${stats.attackType}, но ${marker} нет в способностях`,
      );
    }
    const imgPath = path.join(IMG_DIR, u.faction, `${slug}.webp`);
    mkdirSync(path.dirname(imgPath), { recursive: true });
    writeFileSync(imgPath, new Uint8Array(await fetchUrl(`${BASE}${u.img}`)));
    units.push({
      slug,
      nameRu: u.name,
      nameEn: enBySlug.get(slug) ?? '',
      faction: u.faction,
      abilities,
      grade: 0,
      ...stats,
    });
    await sleep(300);
  }

  const required = ['tier', 'health', 'attack', 'defense', 'damageMin',
    'damageMax', 'initiative', 'speed'] as const;
  const broken = units.filter((u) => required.some((k) => u[k] === null));
  if (broken.length > 0) {
    console.log(`ОШИБКА: неполные данные у ${JSON.stringify(broken.map((u) => u.slug))}`);
    return 1;
  }
  // У каждого юнита есть хотя бы базовая атака: пустой список — дрейф разметки.
  const noAbilities = units.filter((u) => u.abilities.length === 0);
  if (noAbilities.length > 0) {
    console.log(
      `ОШИБКА: не разобраны способности у ${JSON.stringify(noAbilities.map((u) => u.slug))}`,
    );
    return 1;
  }
  const problems = assignGrades(units);
  if (problems.length > 0) {
    console.log(`ОШИБКА группировки база/улучшения: ${JSON.stringify(problems)}`);
    return 1;
  }

  for (const u of units) {
    const dir = path.join(DATA_DIR, u.faction);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${u.slug}.yaml`), emit(u));
  }
  console.log(`Готово: ${units.length} юнитов записано в ${DATA_DIR}`);
  return 0;
}

// Прямой запуск: node scripts/update_units.ts; при импорте main не выполняется.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
