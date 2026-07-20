/**
 * Тесты пресетов героев и отрядов.
 *
 * Покрывают автоимена, срез статов отряда из полного стека, создание
 * пресетов из текущего состояния и иммутабельные CRUD-операции над
 * общим списком пресетов, включая no-op на неизвестных id.
 */

import { describe, expect, it } from 'vitest';
import type { AttackerStats } from './formula';
import type { HeroPreset } from './presets';
import {
  addHero,
  addUnit,
  createHeroPreset,
  createSavedUnit,
  defaultUnitName,
  patchHero,
  patchUnit,
  removeHero,
  removeUnit,
  sameSnapshot,
  snapshotOf,
} from './presets';

/** Стек с различимыми значениями всех девяти статов */
const stack = (over: Partial<AttackerStats> = {}): AttackerStats => ({
  count: 10,
  health: 120,
  topHealth: 90,
  damageMin: 50,
  damageMax: 75,
  attack: 36,
  defense: 20,
  heroAttack: 5,
  heroDefense: 3,
  ...over,
});

/** Список из двух пресетов героя по два отряда в каждом */
const sampleList = (): HeroPreset[] => [
  createHeroPreset(stack(), 'marksman'),
  {
    ...createHeroPreset(stack({ count: 20, heroAttack: 9 }), null),
    units: [createSavedUnit(stack({ count: 20 }), null), createSavedUnit(stack({ count: 7 }), 'marksman')],
  },
];

describe('имена и снапшоты', () => {
  /** Имя строится по русскому названию юнита из базы и количеству */
  it('автоимя по юниту из базы', () => {
    expect(defaultUnitName('marksman', 10)).toBe('Стрелок храма ×10');
  });

  /** Ручной ввод и пропавший из базы юнит дают нейтральное имя */
  it.each([
    ['ручной ввод', null],
    ['неизвестный юнит', 'no_such_unit'],
  ])('%s → «Отряд ×N»', (_name, unitId) => {
    expect(defaultUnitName(unitId, 5)).toBe('Отряд ×5');
  });

  /** Снапшот содержит статы отряда и не содержит статов героя */
  it('snapshotOf отрезает статы героя', () => {
    expect(snapshotOf(stack())).toEqual({
      count: 10,
      health: 120,
      topHealth: 90,
      damageMin: 50,
      damageMax: 75,
      attack: 36,
      defense: 20,
    });
  });

  /** Сравнение снапшотов покомпонентное */
  it('sameSnapshot различает изменение любого стата', () => {
    expect(sameSnapshot(snapshotOf(stack()), snapshotOf(stack()))).toBe(true);
    expect(sameSnapshot(snapshotOf(stack()), snapshotOf(stack({ defense: 21 })))).toBe(false);
  });
});

describe('создание пресетов', () => {
  /**
   * Пресет героя забирает статы героя из стека, называется по текущему
   * отряду и сразу содержит его первым сохранённым отрядом.
   */
  it('createHeroPreset содержит текущий отряд первым', () => {
    const preset = createHeroPreset(stack(), 'marksman');
    expect(preset.name).toBe('Стрелок храма ×10');
    expect(preset.heroAttack).toBe(5);
    expect(preset.heroDefense).toBe(3);
    expect(preset.units).toHaveLength(1);
    expect(preset.units[0].unitId).toBe('marksman');
    expect(preset.units[0].stats).toEqual(snapshotOf(stack()));
  });

  /** Runtime-id уникальны: пресеты и отряды различимы как React-ключи */
  it('id создаваемых пресетов уникальны', () => {
    const a = createSavedUnit(stack(), null);
    const b = createSavedUnit(stack(), null);
    expect(a.id).not.toBe(b.id);
  });
});

describe('CRUD-операции', () => {
  /** Каждая операция возвращает новый список, не трогая исходный */
  it('операции не мутируют входной список', () => {
    const list = sampleList();
    const before = structuredClone(list);
    addHero(list, createHeroPreset(stack(), null));
    patchHero(list, list[0].id, { name: 'Другое имя' });
    removeHero(list, list[0].id);
    addUnit(list, list[0].id, createSavedUnit(stack(), null));
    patchUnit(list, list[1].id, list[1].units[0].id, { name: 'Другой отряд' });
    removeUnit(list, list[1].id, list[1].units[0].id);
    expect(list).toEqual(before);
  });

  it('addHero добавляет пресет в конец', () => {
    const list = sampleList();
    const preset = createHeroPreset(stack(), null);
    expect(addHero(list, preset)).toEqual([...list, preset]);
  });

  /** Правится только целевой пресет; units при patchHero не трогаются */
  it('patchHero правит только целевой пресет', () => {
    const list = sampleList();
    const next = patchHero(list, list[0].id, { name: 'Оррин', heroAttack: 12 });
    expect(next[0]).toEqual({ ...list[0], name: 'Оррин', heroAttack: 12 });
    expect(next[1]).toBe(list[1]);
  });

  it('removeHero удаляет только целевой пресет', () => {
    const list = sampleList();
    expect(removeHero(list, list[0].id)).toEqual([list[1]]);
  });

  it('addUnit добавляет отряд в конец списка героя', () => {
    const list = sampleList();
    const unit = createSavedUnit(stack({ count: 3 }), 'marksman');
    const next = addUnit(list, list[1].id, unit);
    expect(next[1].units).toEqual([...list[1].units, unit]);
    expect(next[0]).toBe(list[0]);
  });

  it('patchUnit правит только целевой отряд', () => {
    const list = sampleList();
    const target = list[1].units[1];
    const next = patchUnit(list, list[1].id, target.id, { unitId: null, name: 'Резерв' });
    expect(next[1].units[1]).toEqual({ ...target, unitId: null, name: 'Резерв' });
    expect(next[1].units[0]).toBe(list[1].units[0]);
  });

  it('removeUnit удаляет только целевой отряд', () => {
    const list = sampleList();
    const next = removeUnit(list, list[1].id, list[1].units[0].id);
    expect(next[1].units).toEqual([list[1].units[1]]);
  });

  /** Неизвестные id героя или отряда оставляют список без изменений */
  it.each([
    ['patchHero', (list: HeroPreset[]) => patchHero(list, 'no_such', { name: 'X' })],
    ['removeHero', (list: HeroPreset[]) => removeHero(list, 'no_such')],
    ['addUnit', (list: HeroPreset[]) => addUnit(list, 'no_such', createSavedUnit(stack(), null))],
    ['patchUnit', (list: HeroPreset[]) => patchUnit(list, 'no_such', 'no_such', { name: 'X' })],
    ['removeUnit', (list: HeroPreset[]) => removeUnit(list, 'no_such', 'no_such')],
  ])('%s с неизвестным id — no-op', (_name, op) => {
    const list = sampleList();
    expect(op(list)).toEqual(list);
  });
});
