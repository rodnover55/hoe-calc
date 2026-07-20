/**
 * Пресеты героев и их отрядов.
 *
 * Пресет героя запоминает атаку и защиту героя и владеет списком
 * сохранённых отрядов; отряд запоминает тип юнита (или ручной ввод)
 * и полные статы стека. Список пресетов один на обе стороны: атакующий
 * и защитник выбирают из него независимо (в том числе один и тот же
 * пресет), поэтому обмен сторон не теряет привязку к пресетам. Список
 * хранится вместе с остальным состоянием калькулятора в ссылке
 * (см. urlState.ts). Все операции иммутабельны и возвращают новые
 * массивы: результат кладётся в React-стейт как есть.
 */

import type { AttackerStats } from './formula';
import type { HeroPick } from './heroEffects';
import { EMPTY_HERO_PICK } from './heroEffects';
import { HEROES_BY_ID, heroName } from './heroes';
import type { Lang } from './i18n';
import { translate } from './i18n';
import { UNITS_BY_ID, unitName } from './units';

/** Порядок статов отряда: общий для снапшота и wire-формата ссылки */
export const UNIT_SNAPSHOT_KEYS = [
  'count',
  'health',
  'topHealth',
  'damageMin',
  'damageMax',
  'attack',
  'defense',
] as const;

/** Статы отряда без героя */
export type UnitSnapshot = Record<(typeof UNIT_SNAPSHOT_KEYS)[number], number>;

/** Сохранённый отряд внутри пресета героя */
export interface SavedUnit {
  /** Runtime-id: React-ключ и адрес CRUD; в ссылку не пишется */
  id: string;
  /** Автоимя по юниту и количеству; пользователь может переименовать */
  name: string;
  /** id юнита из units.ts; null — ручной ввод */
  unitId: string | null;
  stats: UnitSnapshot;
}

/** Пресет героя: его атака/защита и список сохранённых отрядов */
export interface HeroPreset {
  /** Runtime-id: React-ключ и адрес CRUD; в ссылку не пишется */
  id: string;
  /** Автоимя по игровому герою или первому отряду; переименовывается */
  name: string;
  heroAttack: number;
  heroDefense: number;
  /** Выбранный игровой герой с уровнем и уроном удара */
  hero: HeroPick;
  units: SavedUnit[];
}

/**
 * Текущий выбор пресетов обеих сторон из общего списка; null — не
 * выбрано. Стороны могут указывать на один и тот же пресет.
 */
export interface PresetSelection {
  attackerHeroId: string | null;
  attackerSavedUnitId: string | null;
  defenderHeroId: string | null;
  defenderSavedUnitId: string | null;
}

export const EMPTY_SELECTION: PresetSelection = {
  attackerHeroId: null,
  attackerSavedUnitId: null,
  defenderHeroId: null,
  defenderSavedUnitId: null,
};

/** Runtime-id пресета; fallback — для хостинга без secure context */
export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

/** Автоимя пресета: «Стрелок храма ×10», при ручном вводе — «Отряд ×10» */
export const defaultUnitName = (unitId: string | null, count: number, lang: Lang = 'ru'): string => {
  const unit = unitId ? UNITS_BY_ID.get(unitId) : undefined;
  return `${unit ? unitName(unit, lang) : translate(lang, 'presets.stackFallback')} ×${count}`;
};

/** Срез статов отряда без героя из полного стека */
export const snapshotOf = (stats: AttackerStats): UnitSnapshot => {
  const snapshot = {} as UnitSnapshot;
  for (const key of UNIT_SNAPSHOT_KEYS) snapshot[key] = stats[key];
  return snapshot;
};

/** Покомпонентное равенство статов отряда */
export const sameSnapshot = (a: UnitSnapshot, b: UnitSnapshot): boolean =>
  UNIT_SNAPSHOT_KEYS.every((key) => a[key] === b[key]);

/** Сохранённый отряд из текущего стека; автоимя — на языке интерфейса */
export const createSavedUnit = (
  stats: AttackerStats,
  unitId: string | null,
  lang: Lang = 'ru',
): SavedUnit => ({
  id: newId(),
  name: defaultUnitName(unitId, stats.count, lang),
  unitId,
  stats: snapshotOf(stats),
});

/** Имя пресета: имя игрового героя, без него — автоимя по отряду */
const defaultHeroPresetName = (
  hero: HeroPick,
  unitId: string | null,
  count: number,
  lang: Lang,
): string => {
  const gameHero = hero.heroId ? HEROES_BY_ID.get(hero.heroId) : undefined;
  return gameHero ? heroName(gameHero, lang) : defaultUnitName(unitId, count, lang);
};

/** Пресет героя из текущего состояния; текущий отряд становится первым */
export const createHeroPreset = (
  stats: AttackerStats,
  unitId: string | null,
  lang: Lang = 'ru',
  hero: HeroPick = EMPTY_HERO_PICK,
): HeroPreset => ({
  id: newId(),
  name: defaultHeroPresetName(hero, unitId, stats.count, lang),
  heroAttack: stats.heroAttack,
  heroDefense: stats.heroDefense,
  hero,
  units: [createSavedUnit(stats, unitId, lang)],
});

export const addHero = (list: HeroPreset[], preset: HeroPreset): HeroPreset[] => [...list, preset];

/** Правит поля пресета героя; неизвестный id — no-op */
export const patchHero = (
  list: HeroPreset[],
  heroId: string,
  patch: Partial<Omit<HeroPreset, 'id' | 'units'>>,
): HeroPreset[] => list.map((hero) => (hero.id === heroId ? { ...hero, ...patch } : hero));

export const removeHero = (list: HeroPreset[], heroId: string): HeroPreset[] =>
  list.filter((hero) => hero.id !== heroId);

/** Добавляет отряд в пресет героя; неизвестный id героя — no-op */
export const addUnit = (list: HeroPreset[], heroId: string, unit: SavedUnit): HeroPreset[] =>
  list.map((hero) => (hero.id === heroId ? { ...hero, units: [...hero.units, unit] } : hero));

/** Правит поля отряда внутри пресета героя; неизвестные id — no-op */
export const patchUnit = (
  list: HeroPreset[],
  heroId: string,
  savedUnitId: string,
  patch: Partial<Omit<SavedUnit, 'id'>>,
): HeroPreset[] =>
  list.map((hero) =>
    hero.id === heroId
      ? {
          ...hero,
          units: hero.units.map((unit) =>
            unit.id === savedUnitId ? { ...unit, ...patch } : unit,
          ),
        }
      : hero,
  );

export const removeUnit = (
  list: HeroPreset[],
  heroId: string,
  savedUnitId: string,
): HeroPreset[] =>
  list.map((hero) =>
    hero.id === heroId
      ? { ...hero, units: hero.units.filter((unit) => unit.id !== savedUnitId) }
      : hero,
  );
