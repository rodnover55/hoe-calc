import { parse } from 'yaml';

/**
 * Каталог заклинаний с olden-era.com: у каждого заклинания четыре уровня
 * изучения с текстами эффекта. Влияющие на расчёт урона эффекты
 * перечислены в карте spellEffects.ts; остальные заклинания только
 * отображаются.
 */

/** Уровень изучения заклинания */
export type SpellLevel = 1 | 2 | 3 | 4;

/** Школа магии */
export type SpellSchool = 'arcane' | 'daylight' | 'nightshade' | 'primal';

export const SPELL_SCHOOLS: SpellSchool[] = ['arcane', 'daylight', 'nightshade', 'primal'];

/**
 * Тексты одного уровня заклинания: первый уровень — полный эффект,
 * последующие — накопительные изменения («Урон обычных атак: 15% > 20%»)
 */
export interface SpellLevelText {
  /** Русское описание */
  description: string;
  /** Английское описание */
  descriptionEn: string;
}

/** Заклинание из каталога src/data/spells */
export interface Spell {
  /** Слаг на olden-era.com; «искусные» варианты — с суффиксом `_m` */
  id: string;
  /** Русское название («Благословение») */
  name: string;
  /** Английское название */
  nameEn: string;
  school: SpellSchool;
  /** Ранг заклинания 1–5; не путать с уровнем изучения 1–4 */
  tier: number;
  /** Стоимость в мане на первом уровне изучения */
  mana: number;
  /** Путь иконки в public/ («spells/daylight/blessing.webp») */
  image: string;
  /** Тексты уровней; индекс — уровень изучения − 1 */
  levels: SpellLevelText[];
  source?: string;
}

const files = import.meta.glob('./data/spells/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SPELLS: Spell[] = Object.values(files)
  .map((raw) => parse(raw) as Spell)
  .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

export const SPELLS_BY_ID = new Map(SPELLS.map((spell) => [spell.id, spell]));

export const clampSpellLevel = (n: number): SpellLevel =>
  Math.min(4, Math.max(1, Math.floor(n))) as SpellLevel;
