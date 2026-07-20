/**
 * Валидация пользовательского ввода калькулятора.
 *
 * Значения, невозможные в игре, могут прийти из формы (набранное с
 * клавиатуры отрицательное число), отредактированной ссылки или
 * localStorage-пресета. Такие значения не приводятся к допустимым
 * молча — по каждому нарушению возвращается локализованная ошибка, и
 * пока список не пуст, расчёт не выполняется. Проверяются сырые значения
 * полей до применения эффектов: штрафы заклинаний и героев — не ошибка
 * пользователя, их пороги формула показывает сама обёрткой `max(0; …)`.
 */

import type { AttackerStats } from './formula';
import type { Lang } from './i18n';
import { translate } from './i18n';

/** Ошибка значения поля */
export interface ValidationError {
  /** Сторона поля; null — общие параметры атаки (дистанция) */
  side: 'attacker' | 'defender' | null;
  /** Имя поля в состоянии формы */
  field: string;
  /** Готовая локализованная строка: подпись поля, значение, причина */
  message: string;
}

/** Проверяемые статы стороны — сырые значения полей формы */
export type SideStats = Pick<
  AttackerStats,
  | 'count'
  | 'health'
  | 'topHealth'
  | 'damageMin'
  | 'damageMax'
  | 'attack'
  | 'defense'
  | 'heroAttack'
  | 'heroDefense'
>;

/** Нижние границы значений полей стороны: меньших в игре не бывает */
const SIDE_MINIMUMS: Record<keyof SideStats, number> = {
  count: 1,
  health: 1,
  topHealth: 1,
  damageMin: 0,
  damageMax: 0,
  attack: 0,
  defense: 0,
  heroAttack: 0,
  heroDefense: 0,
};

/**
 * Проверяет значения формы обеих сторон и дистанцию; возвращает список
 * локализованных ошибок — пустой на корректном входе.
 */
export function validateBattle(
  attacker: SideStats,
  defender: SideStats,
  distance: number,
  lang: Lang,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const push = (
    side: ValidationError['side'],
    field: string,
    reason: string,
    params: Record<string, string | number>,
  ): void => {
    // Подпись количества у защитника отличается: «до удара».
    const fieldKey = side === 'defender' && field === 'count' ? 'countBefore' : field;
    errors.push({
      side,
      field,
      message: translate(lang, `validation.${reason}`, {
        field: translate(lang, `fields.${fieldKey}`),
        side: translate(lang, side === null ? 'app.attack' : `app.${side}`),
        ...params,
      }),
    });
  };
  // Не-число исключает остальные проверки поля; сравнения с NaN ложны,
  // поэтому парные проверки лишних ошибок не добавляют.
  const check = (side: ValidationError['side'], field: string, value: number, min: number): void => {
    if (!Number.isFinite(value)) push(side, field, 'notFinite', { value: String(value) });
    else if (value < min) push(side, field, 'notBelow', { value, min });
  };

  for (const side of ['attacker', 'defender'] as const) {
    const stats = side === 'attacker' ? attacker : defender;
    for (const field of Object.keys(SIDE_MINIMUMS) as (keyof SideStats)[]) {
      check(side, field, stats[field], SIDE_MINIMUMS[field]);
    }
    if (stats.damageMax < stats.damageMin) {
      push(side, 'damageMax', 'maxBelowMin', { value: stats.damageMax, min: stats.damageMin });
    }
    if (stats.topHealth > stats.health) {
      push(side, 'topHealth', 'topAboveFull', { value: stats.topHealth, health: stats.health });
    }
  }
  check(null, 'distance', distance, 1);
  return errors;
}
