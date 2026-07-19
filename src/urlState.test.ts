/**
 * Тесты кодека состояния `urlState`.
 *
 * Покрывают round-trip кодирования для ручного ввода и выбранного юнита,
 * пригодность результата для query-параметра без экранирования, отказ на
 * повреждённой или структурно неверной строке и мягкую деградацию:
 * пропавший юнит и недопустимый режим атаки.
 */

import { describe, expect, it } from 'vitest';
import type { AppUrlState } from './urlState';
import { decodeAppState, encodeAppState } from './urlState';

/** Отряд с различимыми значениями всех девяти статов */
const stats = (over: Partial<AppUrlState['attacker']> = {}): AppUrlState['attacker'] => ({
  count: 100,
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

/** Состояние ручного ввода: юниты не выбраны, режим базовый */
const manualState = (over: Partial<AppUrlState> = {}): AppUrlState => ({
  attacker: stats(),
  defender: stats({ count: 42, health: 150, topHealth: 150 }),
  attack: { distance: 7, generalModifiers: 15, typeModifiers: -25, retaliation: true },
  modeId: 'base',
  attackerUnitId: null,
  defenderUnitId: null,
  ...over,
});

/** Кодирует состояние с подменённым wire-полем: для проверок валидации */
const tamper = (patch: Record<string, unknown>): string => {
  const payload = JSON.parse(atob(encodeAppState(manualState()))) as Record<string, unknown>;
  return btoa(JSON.stringify({ ...payload, ...patch }));
};

describe('round-trip', () => {
  /**
   * Кодирование и декодирование состояния ручного ввода возвращают его
   * без изменений, включая отрицательные модификаторы и неполное
   * здоровье верхнего юнита.
   */
  it('состояние ручного ввода восстанавливается без изменений', () => {
    const state = manualState();
    expect(decodeAppState(encodeAppState(state))).toEqual(state);
  });

  /**
   * Состояние с выбранным юнитом-стрелком и статами, отличными от
   * пресета, восстанавливается целиком: id юнитов, режим и правленые
   * статы.
   */
  it('состояние с выбранным юнитом восстанавливается целиком', () => {
    const state = manualState({
      attackerUnitId: 'marksman',
      defenderUnitId: 'marksman',
      modeId: 'melee',
      attacker: stats({ health: 999 }),
    });
    expect(decodeAppState(encodeAppState(state))).toEqual(state);
  });

  /** Строка пригодна для query-параметра: только A-Za-z0-9-_ */
  it('кодирует только в URL-безопасные символы', () => {
    expect(encodeAppState(manualState())).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('повреждённая строка', () => {
  /** Любой мусор вместо параметра даёт null, а не исключение */
  it.each([
    ['null', null],
    ['пустая строка', ''],
    ['битый base64', '%%%'],
    ['base64 не-JSON', btoa('not json')],
    ['JSON не-объект', btoa('[1,2,3]')],
  ])('%s → null', (_name, raw) => {
    expect(decodeAppState(raw)).toBeNull();
  });

  /** Структурно неверный payload целиком отвергается */
  it.each([
    ['неизвестная версия', { v: 2 }],
    ['статов меньше девяти', { a: [1, 2, 3, 4, 5, 6, 7, 8] }],
    ['стат-строка', { a: [1, 2, 3, 4, 5, 6, 7, 8, '9'] }],
    ['стат-NaN', { d: [1, 2, 3, 4, 5, 6, 7, 8, Number.NaN] }],
    ['условия атаки не той длины', { x: [1, 0, 0] }],
    ['режим не строка', { m: 7 }],
  ])('%s → null', (_name, patch) => {
    expect(decodeAppState(tamper(patch))).toBeNull();
  });
});

describe('мягкая деградация', () => {
  /**
   * Юнит, пропавший из базы (переименован или удалён), заменяется ручным
   * вводом; числовые статы из ссылки при этом сохраняются.
   */
  it('неизвестный юнит сбрасывается в ручной ввод с сохранением статов', () => {
    const decoded = decodeAppState(tamper({ au: 'deleted_unit' }));
    expect(decoded?.attackerUnitId).toBeNull();
    expect(decoded?.attacker).toEqual(manualState().attacker);
  });

  /** Флаг ответного удара с недопустимым значением приводится к false */
  it('неизвестное значение флага ответного удара даёт false', () => {
    expect(decodeAppState(tamper({ x: [1, 0, 0, 2] }))?.attack.retaliation).toBe(false);
  });

  /**
   * Режим, недопустимый для юнита из ссылки, заменяется первым из его
   * списка: у стрелка это дальняя атака, при ручном вводе — базовая.
   */
  it('недопустимый режим заменяется первым режимом юнита', () => {
    expect(decodeAppState(tamper({ au: 'marksman', m: 'no_such_mode' }))?.modeId).toBe('ranged');
    expect(decodeAppState(tamper({ m: 'no_such_mode' }))?.modeId).toBe('base');
  });
});
