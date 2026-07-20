/**
 * Тесты `validateBattle`: невозможные в игре значения формы дают
 * локализованную ошибку со стороной и полем вместо молчаливой подмены;
 * корректный вход возвращает пустой список.
 */

import { describe, expect, it } from 'vitest';
import type { SideStats } from './validation';
import { validateBattle } from './validation';

/** Корректный отряд: против него ошибок нет */
const stats = (over: Partial<SideStats> = {}): SideStats => ({
  count: 10,
  health: 10,
  topHealth: 10,
  damageMin: 10,
  damageMax: 10,
  attack: 10,
  defense: 10,
  heroAttack: 0,
  heroDefense: 0,
  ...over,
});

const validate = (
  attacker: Partial<SideStats> = {},
  defender: Partial<SideStats> = {},
  distance = 1,
) => validateBattle(stats(attacker), stats(defender), distance, 'ru');

describe('validateBattle', () => {
  it('корректный вход не даёт ошибок', () => {
    expect(validate()).toEqual([]);
  });

  /**
   * Значения ниже игрового минимума помечаются ошибкой с указанием
   * стороны, поля и порога.
   *
   * Условия: отряд атакующего из 0 существ с атакой −5.
   *
   * Ожидание: две ошибки атакующего — count (меньше 1) и attack
   * (меньше 0), сообщения содержат подпись поля и введённое значение.
   */
  it('количество и статы ниже минимума — ошибка своей стороны', () => {
    const errors = validate({ count: 0, attack: -5 });
    expect(errors.map((error) => [error.side, error.field])).toEqual([
      ['attacker', 'count'],
      ['attacker', 'attack'],
    ]);
    expect(errors[0].message).toContain('Кол-во существ');
    expect(errors[0].message).toContain('0');
    expect(errors[1].message).toContain('Атака существа');
    expect(errors[1].message).toContain('-5');
  });

  /**
   * Проверяются обе стороны; у защитника количество подписано ключом
   * «до удара».
   *
   * Условия: у защитника количество 0.
   *
   * Ожидание: одна ошибка стороны defender по полю count с подписью
   * «Кол-во существ (до удара)» и названием стороны.
   */
  it('ошибки защитника несут его подпись поля и сторону', () => {
    const errors = validate({}, { count: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0].side).toBe('defender');
    expect(errors[0].message).toContain('Кол-во существ (до удара)');
    expect(errors[0].message).toContain('Защищающийся');
  });

  /**
   * Парные правила: максимальный урон не меньше минимального, неполное
   * здоровье верхнего юнита не больше полного.
   *
   * Условия: урон 10–5 и неполное здоровье 50 при полном 10.
   *
   * Ожидание: ошибки damageMax и topHealth с обоими значениями в тексте.
   */
  it('вывернутый диапазон урона и неполное здоровье выше полного — ошибки', () => {
    const damage = validate({ damageMin: 10, damageMax: 5 });
    expect(damage.map((error) => error.field)).toEqual(['damageMax']);
    expect(damage[0].message).toContain('5');
    expect(damage[0].message).toContain('10');

    const top = validate({}, { topHealth: 50 });
    expect(top.map((error) => error.field)).toEqual(['topHealth']);
    expect(top[0].message).toContain('50');
  });

  /**
   * Здоровье и неполное здоровье не бывают меньше 1, дистанция — меньше
   * 1 гекса; дистанция — общий параметр атаки без стороны.
   *
   * Условия: здоровье 0 у атакующего и дистанция 0.
   *
   * Ожидание: ошибки health (attacker) и distance (side null).
   */
  it('здоровье ниже 1 и дистанция ниже 1 гекса — ошибки', () => {
    expect(validate({ health: 0 }).map((error) => error.field)).toEqual(['health', 'topHealth']);
    const distance = validate({}, {}, 0);
    expect(distance).toHaveLength(1);
    expect(distance[0].side).toBeNull();
    expect(distance[0].field).toBe('distance');
  });

  /**
   * NaN и бесконечность (битый URL или пресет) — ошибка «не число»;
   * парные проверки с NaN лишних ошибок не добавляют.
   *
   * Условия: атака NaN, максимальный урон Infinity.
   *
   * Ожидание: по одной ошибке на поле с текстом «не число».
   */
  it('NaN и бесконечность — ошибка «не число»', () => {
    const errors = validate({ attack: Number.NaN, damageMax: Number.POSITIVE_INFINITY });
    expect(errors.map((error) => error.field)).toEqual(['damageMax', 'attack']);
    for (const error of errors) {
      expect(error.message).toContain('не число');
    }
  });
});
