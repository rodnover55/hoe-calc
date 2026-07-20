import { parse } from 'yaml';
import type { Lang } from './i18n';
import type { Faction } from './units';
import { FACTION_ORDER } from './units';

export interface HeroStats {
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
}

/** Специализация героя с olden-era.com */
export interface HeroSpecialization {
  /** Слаг английского названия; влияющие на расчёт перечислены в heroEffects.ts */
  id: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Русское описание */
  description: string;
  /** Английское описание */
  descriptionEn: string;
}

/** Стартовый навык героя с olden-era.com */
export interface HeroSkill {
  /** Слаг страницы навыка на olden-era.com */
  id: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Русское описание */
  description: string;
  /** Английское описание */
  descriptionEn: string;
}

/**
 * Игровой герой из базы olden-era.com; не путать с пользовательским
 * пресетом HeroPreset из presets.ts.
 */
export interface GameHero {
  id: string;
  /** Русское имя */
  name: string;
  /** Английское имя */
  nameEn: string;
  faction: Faction;
  /** Название класса; сайт не переводит его на русский */
  class: string;
  classEn: string;
  /** Путь к портрету относительно public/ */
  image: string;
  /** Стартовые характеристики героя первого уровня */
  stats: HeroStats;
  specialization: HeroSpecialization;
  skills: HeroSkill[];
  source?: string;
}

/** Имя героя на языке интерфейса; вне русского — английское */
export const heroName = (hero: GameHero, lang: Lang): string =>
  lang === 'ru' ? hero.name : hero.nameEn || hero.name;

/** Название специализации или навыка на языке интерфейса */
export const heroTextName = (
  text: HeroSpecialization | HeroSkill,
  lang: Lang,
): string => (lang === 'ru' ? text.name : text.nameEn || text.name);

/** Описание специализации или навыка на языке интерфейса */
export const heroTextDescription = (
  text: HeroSpecialization | HeroSkill,
  lang: Lang,
): string =>
  lang === 'ru' ? text.description : text.descriptionEn || text.description;

const files = import.meta.glob('./data/heroes/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const HEROES: GameHero[] = Object.values(files)
  .map((raw) => parse(raw) as GameHero)
  .sort(
    (a, b) =>
      FACTION_ORDER.indexOf(a.faction) - FACTION_ORDER.indexOf(b.faction) ||
      a.name.localeCompare(b.name, 'ru'),
  );

export const HEROES_BY_ID = new Map(HEROES.map((hero) => [hero.id, hero]));

/** Герои фракции в порядке каталога */
export const heroesOf = (faction: Faction): GameHero[] =>
  HEROES.filter((hero) => hero.faction === faction);
