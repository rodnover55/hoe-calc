import { parse } from 'yaml';

/**
 * Каталог навыков героев с olden-era.com: у каждого навыка три уровня
 * мастерства и поднавыки-модификаторы, открывающиеся с продвинутого
 * уровня. Влияющие на расчёт навыки и поднавыки перечислены в картах
 * heroEffects.ts; остальные только отображаются.
 */

/** Уровень мастерства: 1 — базовый, 2 — продвинутый, 3 — экспертный */
export type SkillLevel = 1 | 2 | 3;

/** Тексты одного уровня мастерства */
export interface SkillLevelText {
  /** Русское название уровня («Основы нападения») */
  name: string;
  /** Английское название уровня */
  nameEn: string;
  /** Русское описание */
  description: string;
  /** Английское описание */
  descriptionEn: string;
}

/** Поднавык-модификатор навыка */
export interface Subskill {
  /** Слаг поднавыка на olden-era.com; уникален в каталоге */
  id: string;
  /** Минимальный уровень мастерства, открывающий поднавык */
  tier: 2 | 3;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Русское описание */
  description: string;
  /** Английское описание */
  descriptionEn: string;
}

/** Навык из каталога src/data/skills */
export interface Skill {
  /** Слаг навыка без префикса уровня мастерства */
  id: string;
  /** Русское базовое имя («Атака») */
  name: string;
  /** Английское базовое имя */
  nameEn: string;
  /** Тексты уровней; индекс — уровень мастерства − 1 */
  levels: SkillLevelText[];
  subskills: Subskill[];
  source?: string;
}

/** Слаги уровней мастерства в порядке возрастания уровня */
const LEVEL_PREFIXES = ['basic', 'advanced', 'expert'] as const;

const files = import.meta.glob('./data/skills/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SKILLS: Skill[] = Object.values(files)
  .map((raw) => parse(raw) as Skill)
  .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

export const SKILLS_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export const clampSkillLevel = (n: number): SkillLevel =>
  Math.min(3, Math.max(1, Math.floor(n))) as SkillLevel;

/**
 * Разбор слага уровня навыка («basic_offence») на навык каталога и
 * уровень мастерства; null — префикс не распознан или навыка нет в
 * каталоге.
 */
export function levelOfSlug(slug: string): { skill: Skill; level: SkillLevel } | null {
  const m = /^(basic|advanced|expert)_(.+)$/.exec(slug);
  if (!m) return null;
  const skill = SKILLS_BY_ID.get(m[2]);
  if (!skill) return null;
  return { skill, level: (LEVEL_PREFIXES.indexOf(m[1] as (typeof LEVEL_PREFIXES)[number]) + 1) as SkillLevel };
}

/** Слаг уровня навыка на olden-era.com («expert_offence») */
export const slugOfLevel = (id: string, level: SkillLevel): string =>
  `${LEVEL_PREFIXES[level - 1]}_${id}`;

/** Поднавыки, доступные на уровне мастерства, в порядке каталога */
export const subskillsFor = (skill: Skill, level: number): Subskill[] =>
  skill.subskills.filter((sub) => sub.tier <= level);

/**
 * Нормализация списка поднавыков: неизвестные и недоступные на уровне
 * отбрасываются, повторы схлопываются, порядок — как в каталоге
 * (детерминизм ссылки и сравнения пресетов).
 */
export function normalizeMods(skill: Skill, level: number, mods: unknown): string[] {
  if (!Array.isArray(mods)) return [];
  const wanted = new Set(mods.filter((mod): mod is string => typeof mod === 'string'));
  return subskillsFor(skill, level)
    .map((sub) => sub.id)
    .filter((id) => wanted.has(id));
}
