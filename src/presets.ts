/**
 * Пресеты героев и их отрядов.
 *
 * Пресет героя запоминает атаку и защиту героя и владеет списком
 * сохранённых отрядов; отряд запоминает тип юнита (или ручной ввод)
 * и полные статы стека. Списки пресетов раздельны для атакующего и
 * защитника и хранятся вместе с остальным состоянием калькулятора в
 * ссылке (см. urlState.ts). Все операции иммутабельны и возвращают
 * новые массивы: результат кладётся в React-стейт как есть.
 */

import type { AttackerStats } from './formula';
import { UNITS_BY_ID } from './units';

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
  /** Автоимя по первому отряду; пользователь может переименовать */
  name: string;
  heroAttack: number;
  heroDefense: number;
  units: SavedUnit[];
}

/** Все пресеты: у каждой стороны свой независимый список */
export interface PresetStore {
  attacker: HeroPreset[];
  defender: HeroPreset[];
}

/** Текущий выбор пресетов обеих сторон; null — не выбрано */
export interface PresetSelection {
  attackerHeroId: string | null;
  attackerSavedUnitId: string | null;
  defenderHeroId: string | null;
  defenderSavedUnitId: string | null;
}

export const EMPTY_STORE: PresetStore = { attacker: [], defender: [] };

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
export const defaultUnitName = (unitId: string | null, count: number): string =>
  `${(unitId ? UNITS_BY_ID.get(unitId)?.name : undefined) ?? 'Отряд'} ×${count}`;

/** Срез статов отряда без героя из полного стека */
export const snapshotOf = (stats: AttackerStats): UnitSnapshot => {
  const snapshot = {} as UnitSnapshot;
  for (const key of UNIT_SNAPSHOT_KEYS) snapshot[key] = stats[key];
  return snapshot;
};

/** Покомпонентное равенство статов отряда */
export const sameSnapshot = (a: UnitSnapshot, b: UnitSnapshot): boolean =>
  UNIT_SNAPSHOT_KEYS.every((key) => a[key] === b[key]);

/** Сохранённый отряд из текущего стека */
export const createSavedUnit = (stats: AttackerStats, unitId: string | null): SavedUnit => ({
  id: newId(),
  name: defaultUnitName(unitId, stats.count),
  unitId,
  stats: snapshotOf(stats),
});

/** Пресет героя из текущего состояния; текущий отряд становится первым */
export const createHeroPreset = (stats: AttackerStats, unitId: string | null): HeroPreset => ({
  id: newId(),
  name: defaultUnitName(unitId, stats.count),
  heroAttack: stats.heroAttack,
  heroDefense: stats.heroDefense,
  units: [createSavedUnit(stats, unitId)],
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
