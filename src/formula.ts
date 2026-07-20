/**
 * Расчёт урона боя Heroes of Might and Magic: Olden Era.
 *
 * Экспортирует чистую функцию `calculateDamage`: полное описание боя —
 * оба отряда с характеристиками героев и учитываемые абилки атаки —
 * приходит одним входным объектом, результат — диапазоны урона и потерь
 * по вариантам удачи, ответный удар выживших, второй удар после ответа
 * и формула расчёта с подставленными значениями. Названия параметров
 * формулы берутся из локали по языку, переданному вторым аргументом.
 */

import type { Lang } from './i18n';
import { translate } from './i18n';

export type Luck = 'normal' | 'lucky' | 'unlucky';

export interface AttackerStats {
  /** Количество существ в отряде */
  count: number;
  /** Здоровье одного существа */
  health: number;
  /** Текущее здоровье верхнего (неполного) юнита */
  topHealth: number;
  /** Минимальный урон одного существа */
  damageMin: number;
  /** Максимальный урон одного существа */
  damageMax: number;
  /** Атака существа */
  attack: number;
  /** Защита существа (для расчёта ответного удара) */
  defense: number;
  /** Атака героя; прибавляется к атаке существа */
  heroAttack: number;
  /** Защита героя; прибавляется к защите существа */
  heroDefense: number;
}

export interface DefenderStats {
  /** Количество существ до удара */
  count: number;
  /** Здоровье одного существа */
  health: number;
  /** Текущее здоровье верхнего (неполного) юнита */
  topHealth: number;
  /** Минимальный урон одного существа */
  damageMin: number;
  /** Максимальный урон одного существа */
  damageMax: number;
  /** Атака существа (для расчёта ответного удара) */
  attack: number;
  /** Защита существа */
  defense: number;
  /** Атака героя; прибавляется к атаке существа */
  heroAttack: number;
  /** Защита героя; прибавляется к защите существа */
  heroDefense: number;
}

/** Учитываемые абилки и условия атаки */
export interface AttackAbilities {
  /** Гексы до цели (для дальнобойной атаки) */
  distance: number;
  /** Действует ли штраф дальности: дальняя атака без «Снайпера» */
  rangePenalty: boolean;
  /** Множитель режима атаки: 0.5 для боевых стоек и стрелка вплотную */
  modeMultiplier: number;
  /** Сумма общих модификаторов, % */
  generalModifiers: number;
  /** Сумма типовых модификаторов, % */
  typeModifiers: number;
  /** Будет ли ответный удар */
  retaliation: boolean;
  /** Второй удар после ответа: двойной удар или двойной выстрел */
  doubleStrike: boolean;
}

/** Полное описание боя: обе стороны с героями и абилки атаки */
export interface DamageInput {
  /** Атакующий отряд вместе с характеристиками героя */
  attacker: AttackerStats;
  /** Учитываемые абилки и условия атаки */
  abilities: AttackAbilities;
  /** Защищающийся отряд вместе с характеристиками героя */
  defender: DefenderStats;
}

export interface RetaliationDamage {
  /** Выжившие после максимального урона атаки (худший для защитника случай) */
  survivorsMin: number;
  /** Выжившие после минимального урона атаки */
  survivorsMax: number;
  min: number;
  max: number;
  average: number;
  /** Погибшие существа атакующего; не ограничено размером отряда */
  killsMin: number;
  killsMax: number;
  /**
   * Ответов с максимальным уроном до гибели всего отряда атакующего;
   * null — ответ не наносит урона, отряд им не убить
   */
  strikesMin: number | null;
  /** Ответов с минимальным уроном; null — как выше */
  strikesMax: number | null;
}

/** Второй удар атакующего после ответа защитника */
export interface SecondStrikeDamage {
  /** Атакующие во втором ударе после максимального ответа (худший случай) */
  attackersMin: number;
  /** Атакующие во втором ударе после минимального ответа */
  attackersMax: number;
  min: number;
  max: number;
  average: number;
  /** Погибшие существа защитника от второго удара, по остатку его отряда */
  killsMin: number;
  killsMax: number;
}

export interface LuckDamage {
  luck: Luck;
  min: number;
  max: number;
  average: number;
  /** Погибшие существа защитника; не ограничено размером отряда */
  killsMin: number;
  killsMax: number;
  /** Ударов с максимальным уроном строки до гибели всего отряда защитника */
  strikesMin: number;
  /** Ударов с минимальным уроном строки до гибели всего отряда защитника */
  strikesMax: number;
  /** Ответный удар выживших; null, если ответа не будет */
  retaliation: RetaliationDamage | null;
  /** Второй удар после ответа; null, если двойного удара нет */
  secondStrike: SecondStrikeDamage | null;
}

/** Фрагмент числовой формулы бакета */
export interface FormulaToken {
  /** Отображаемый текст: число либо знаки и скобки между числами */
  text: string;
  /** Название параметра-источника числа — подсказка при наведении */
  param?: string;
}

/**
 * Бакет формулы — множитель или слагаемое расчёта. Числовая форма
 * (tokens) и строка легенды (formula) повторяют одно выражение: на месте
 * каждого числа-параметра из tokens в легенде стоит его название, а
 * константы формулы записаны числами и там и там.
 */
export interface DamageStep {
  /** Короткая подпись бакета: за что он отвечает в расчёте */
  label: string;
  /** Строка легенды: формула бакета из названий параметров */
  formula: string;
  /** Формула бакета с подставленными числами */
  tokens: FormulaToken[];
  /** Знак перед бакетом; по умолчанию «×» (слагаемое удара героя — «+») */
  op?: '×' | '+';
}

/** Числовой токен формулы: значение с названием параметра-источника */
export const num = (value: number, param: string): FormulaToken => ({
  text: `${value}`,
  param,
});

/** Сборка бакета из токенов: строки — знаки и скобки без параметра */
export const tokens = (...parts: (string | FormulaToken)[]): FormulaToken[] =>
  parts.map((part) => (typeof part === 'string' ? { text: part } : part));

/** Перевод названия параметра формулы по ключу */
type ParamName = (key: string) => string;

/**
 * Бакет «отряд × урон»: количество существ и диапазон урона одного.
 *
 * Количество задаётся числом либо диапазоном — у ответного и второго удара
 * бьёт не весь отряд, а выжившие, и их число зависит от урона предыдущего
 * удара. В легенде и то и другое — одно название параметра; границы
 * диапазона различают минимум и максимум только в подсказках у чисел.
 * Выродившийся диапазон (минимум равен максимуму) сворачивается в одно
 * число — и у количества, и у урона.
 */
const stackStep = (
  P: ParamName,
  label: string,
  count: number | { min: number; max: number },
  damageMin: number,
  damageMax: number,
): DamageStep => {
  const ranged = typeof count !== 'number' && count.min !== count.max;
  return {
    label,
    formula: `${P('count')} × ${P('damage')}`,
    tokens: tokens(
      ...(typeof count === 'number'
        ? [num(count, P('count'))]
        : ranged
          ? ['(', num(count.min, P('countMin')), '..', num(count.max, P('countMax')), ')']
          : [num(count.min, P('count'))]),
      ...(damageMin === damageMax
        ? [' × ', num(damageMin, P('damage'))]
        : [' × (', num(damageMin, P('damageMin')), '..', num(damageMax, P('damageMax')), ')']),
    ),
  };
};

/** Бакет АТК/ЗЩТ: (20 + атака юнита и героя) / (20 + защита юнита и героя) */
const atkDefStep = (
  P: ParamName,
  label: string,
  attack: { unit: number; hero: number },
  defense: { unit: number; hero: number },
): DamageStep => ({
  label,
  formula: `(20 + ${P('unitAttack')} + ${P('heroAttack')}) / (20 + ${P('unitDefense')} + ${P('heroDefense')})`,
  tokens: tokens(
    '(20 + ',
    num(attack.unit, P('unitAttack')),
    ' + ',
    num(attack.hero, P('heroAttack')),
    ') / (20 + ',
    num(defense.unit, P('unitDefense')),
    ' + ',
    num(defense.hero, P('heroDefense')),
    ')',
  ),
});

export interface DamageResult {
  /** Диапазоны урона по вариантам удачи: неудача, обычный, удача */
  byLuck: LuckDamage[];
  /** Множитель (20 + ATK) / (20 + DEF) */
  attackDefenseModifier: number;
  /** Множитель ответного удара: (20 + ATK защитника) / (20 + DEF атакующего) */
  retaliationModifier: number;
  /** Сработало ли ограничение типовых модификаторов в 10% */
  typeCapped: boolean;
  /** Полная формула урона по бакетам с подставленными значениями */
  steps: DamageStep[];
  /** Формула ответного удара по бакетам */
  retaliationSteps: DamageStep[];
  /** Формула второго удара по бакетам */
  secondStrikeSteps: DamageStep[];
}

export const LUCK_FACTOR: Record<Luck, number> = {
  normal: 1,
  lucky: 1.5,
  unlucky: 0.5,
};

export const LUCK_ORDER: Luck[] = ['unlucky', 'normal', 'lucky'];

/** Дальнобойная атака теряет 10% за каждый гекс сверх трёх, максимум −50% */
export function rangeFactor(distance: number): number {
  return distance > 3 ? Math.max(0.5, 1 - 0.1 * (distance - 3)) : 1;
}

/**
 * Вход атакующей способности с собственным расчётом урона.
 *
 * Урон задаётся либо долей урона обычной атаки (`factor`), либо
 * фиксированной формулой `base + perUnit × количество`. АТК/ЗЩТ, общие и
 * типовые модификаторы, дальность и удача не участвуют.
 */
export interface AbilityAttackInput {
  /** Количество существ в отряде атакующего */
  count: number;
  /** Минимальный урон одного существа */
  damageMin: number;
  /** Максимальный урон одного существа */
  damageMax: number;
  /** Доля урона обычной атаки; если не задана, действует base/perUnit */
  factor?: number;
  /**
   * Атака юнита и героя — для способностей, игнорирующих защиту: даёт
   * множитель (20 + АТК) / 20; если не задана, множителя нет
   */
  attack?: { unit: number; hero: number };
  /** Слагаемое фиксированной формулы */
  base?: number;
  /** Множитель количества в фиксированной формуле */
  perUnit?: number;
  /** Снижение урона защитой цели, % (отрицательное значение) */
  reduction?: number;
  /** Отряд защитника для подсчёта погибших и ударов до его гибели */
  defender: {
    count: number;
    health: number;
    topHealth: number;
  };
}

export interface AbilityDamageResult {
  min: number;
  max: number;
  average: number;
  killsMin: number;
  killsMax: number;
  /** Ударов с максимальным уроном до гибели всего отряда; null при нулевом уроне */
  strikesMin: number | null;
  /** Ударов с минимальным уроном до гибели всего отряда; null при нулевом уроне */
  strikesMax: number | null;
  /** Формула урона способности с подставленными значениями */
  steps: DamageStep[];
}

/**
 * Считает урон атакующей способности по её собственной формуле.
 *
 * Чистая функция; некорректный вход приводится к допустимому так же, как
 * в `calculateDamage`. Урон способности может быть нулевым — минимум в
 * 1 урона на него не распространяется.
 */
export function calculateAbilityDamage(
  input: AbilityAttackInput,
  lang: Lang = 'ru',
): AbilityDamageResult {
  const P: ParamName = (key) => translate(lang, `formula.params.${key}`);
  const B: ParamName = (key) => translate(lang, `formula.labels.${key}`);
  const count = Math.max(1, input.count);
  const damageMin = Math.max(0, input.damageMin);
  const damageMax = Math.max(damageMin, input.damageMax);
  const defCount = Math.max(1, input.defender.count);
  const defHealth = Math.max(1, input.defender.health);
  const defTopHealth = Math.min(defHealth, Math.max(1, input.defender.topHealth));
  const defTotalHealth = (defCount - 1) * defHealth + defTopHealth;
  const reduction = Math.min(0, input.reduction ?? 0);
  const reductionFactor = Math.max(0, 1 + reduction / 100);

  let min: number;
  let max: number;
  const steps: DamageStep[] = [];
  if (input.factor !== undefined) {
    const factor = Math.max(0, input.factor);
    const unitAtk = Math.max(0, input.attack?.unit ?? 0);
    const heroAtk = Math.max(0, input.attack?.hero ?? 0);
    const attackModifier = input.attack ? (20 + unitAtk + heroAtk) / 20 : 1;
    min = round(count * damageMin * factor * attackModifier * reductionFactor);
    max = round(count * damageMax * factor * attackModifier * reductionFactor);
    steps.push(stackStep(P, B('stackDamage'), count, damageMin, damageMax));
    if (factor !== 1) {
      steps.push({ label: B('factor'), formula: P('factor'), tokens: tokens(num(factor, P('factor'))) });
    }
    if (input.attack) {
      steps.push({
        label: B('attack'),
        formula: `(20 + ${P('unitAttack')} + ${P('heroAttack')}) / 20`,
        tokens: tokens(
          '(20 + ',
          num(unitAtk, P('unitAttack')),
          ' + ',
          num(heroAtk, P('heroAttack')),
          ') / 20',
        ),
      });
    }
  } else {
    const base = Math.max(0, input.base ?? 0);
    const perUnit = Math.max(0, input.perUnit ?? 0);
    min = round((base + perUnit * count) * reductionFactor);
    max = min;
    steps.push(
      perUnit > 0
        ? {
            label: B('fixed'),
            formula: `${base > 0 ? `${P('abilityBase')} + ` : ''}${P('perUnit')} × ${P('count')}`,
            tokens: tokens(
              ...(base > 0 ? [num(base, P('abilityBase')), ' + '] : []),
              num(perUnit, P('perUnit')),
              ' × ',
              num(count, P('count')),
            ),
          }
        : { label: B('fixed'), formula: P('abilityBase'), tokens: tokens(num(base, P('abilityBase'))) },
    );
  }
  if (reduction < 0) {
    steps.push({
      label: B('targetDefense'),
      formula: `1 − ${P('reduction')}/100`,
      tokens: tokens('1 − ', num(-reduction, P('reduction')), '/100'),
    });
  }

  return {
    min,
    max,
    average: Math.round((min + max) / 2),
    killsMin: killsFrom(min, defTopHealth, defHealth),
    killsMax: killsFrom(max, defTopHealth, defHealth),
    strikesMin: max > 0 ? Math.ceil(defTotalHealth / max) : null,
    strikesMax: min > 0 ? Math.ceil(defTotalHealth / min) : null,
    steps,
  };
}

/** Округление до ближайшего целого, 0.5 — вверх */
const round = (x: number): number => (x % 1 >= 0.5 ? Math.ceil(x) : Math.floor(x));

/**
 * Сколько существ умрёт от урона: первым гибнет верхний юнит с неполным
 * здоровьем, дальше — существа с полным. Не ограничено размером отряда.
 */
const killsFrom = (damage: number, topHealth: number, health: number): number =>
  damage < topHealth ? 0 : 1 + Math.floor((damage - topHealth) / health);

/**
 * Считает урон удара и ответного удара по полному описанию боя.
 *
 * Чистая функция: результат определяется только входным объектом.
 * Некорректный вход приводится к допустимому вместо ошибки: количество
 * существ и здоровье — минимум 1, урон и характеристики — минимум 0,
 * максимальный урон — не меньше минимального, неполное здоровье верхнего
 * юнита — не больше полного, дистанция — минимум 1 гекс.
 *
 * @param input полное описание боя: атакующий и защищающийся отряды с
 *   характеристиками героев и учитываемые абилки атаки.
 * @param lang язык подписей шагов формулы.
 * @returns диапазоны урона и погибших по вариантам удачи с ответным
 *   ударом выживших и вторым ударом после ответа, модификаторы АТК/ЗЩТ
 *   обеих сторон, признак ограничения типовых модификаторов и формула
 *   расчёта с подставленными значениями.
 */
export function calculateDamage(input: DamageInput, lang: Lang = 'ru'): DamageResult {
  const { attacker, abilities, defender } = input;
  const P: ParamName = (key) => translate(lang, `formula.params.${key}`);
  const B: ParamName = (key) => translate(lang, `formula.labels.${key}`);

  const count = Math.max(1, attacker.count);
  const health = Math.max(1, attacker.health);
  const topHealth = Math.min(health, Math.max(1, attacker.topHealth));
  const damageMin = Math.max(0, attacker.damageMin);
  const damageMax = Math.max(damageMin, attacker.damageMax);
  const unitAtk = Math.max(0, attacker.attack);
  const heroAtk = Math.max(0, attacker.heroAttack);
  const unitDef = Math.max(0, defender.defense);
  const heroDef = Math.max(0, defender.heroDefense);

  const defCount = Math.max(1, defender.count);
  const defHealth = Math.max(1, defender.health);
  const defTopHealth = Math.min(defHealth, Math.max(1, defender.topHealth));
  const defDamageMin = Math.max(0, defender.damageMin);
  const defDamageMax = Math.max(defDamageMin, defender.damageMax);
  const defUnitAtk = Math.max(0, defender.attack);
  const defHeroAtk = Math.max(0, defender.heroAttack);
  const attUnitDef = Math.max(0, attacker.defense);
  const attHeroDef = Math.max(0, attacker.heroDefense);

  const attackDefenseModifier = (20 + unitAtk + heroAtk) / (20 + unitDef + heroDef);
  const retaliationModifier = (20 + defUnitAtk + defHeroAtk) / (20 + attUnitDef + attHeroDef);
  // Общие модификаторы, в отличие от типовых, нижнего порога не имеют:
  // от ухода множителя в минус спасает только минимум в 1 урона.
  const general = 1 + abilities.generalModifiers / 100;
  const typeRaw = 1 + abilities.typeModifiers / 100;
  const type = Math.max(0.1, typeRaw);
  const typeCapped = typeRaw < 0.1;
  const distance = Math.max(1, abilities.distance);
  const range = abilities.rangePenalty ? rangeFactor(distance) : 1;
  const mode = Math.max(0, abilities.modeMultiplier);

  /** Сколько существ защитника переживёт указанный урон */
  const defTotalHealth = (defCount - 1) * defHealth + defTopHealth;
  const survivorsAfter = (damage: number): number =>
    Math.max(0, Math.ceil((defTotalHealth - damage) / defHealth));

  /** Остаток отряда после урона: живые существа и здоровье верхнего */
  const remainingAfter = (totalHealth: number, unitHealth: number, damage: number) => {
    const left = Math.max(0, totalHealth - damage);
    const alive = Math.ceil(left / unitHealth);
    return { alive, topHealth: alive > 0 ? left - (alive - 1) * unitHealth : 0 };
  };
  const attTotalHealth = (count - 1) * health + topHealth;

  const retaliationAfter = (attackMin: number, attackMax: number): RetaliationDamage => {
    const survivorsMin = survivorsAfter(attackMax);
    const survivorsMax = survivorsAfter(attackMin);
    const min =
      survivorsMin > 0
        ? Math.max(1, round(survivorsMin * defDamageMin * retaliationModifier))
        : 0;
    const max =
      survivorsMax > 0
        ? Math.max(1, round(survivorsMax * defDamageMax * retaliationModifier))
        : 0;
    return {
      survivorsMin,
      survivorsMax,
      min,
      max,
      average: Math.round((min + max) / 2),
      killsMin: killsFrom(min, topHealth, health),
      killsMax: killsFrom(max, topHealth, health),
      strikesMin: max > 0 ? Math.ceil(attTotalHealth / max) : null,
      strikesMax: min > 0 ? Math.ceil(attTotalHealth / min) : null,
    };
  };

  const base = attackDefenseModifier * general * type * range * mode;
  const byLuck = LUCK_ORDER.map((luck) => {
    const total = base * LUCK_FACTOR[luck];
    const min = Math.max(1, round(count * damageMin * total));
    const max = Math.max(1, round(count * damageMax * total));
    const retaliation = abilities.retaliation ? retaliationAfter(min, max) : null;

    // Второй удар идёт после ответа: худшая цепочка — минимальный урон и
    // максимальный ответ, лучшая — максимальный урон и минимальный ответ.
    let secondStrike: SecondStrikeDamage | null = null;
    if (abilities.doubleStrike) {
      const full = { alive: count, topHealth };
      const worst = retaliation ? remainingAfter(attTotalHealth, health, retaliation.max) : full;
      const best = retaliation ? remainingAfter(attTotalHealth, health, retaliation.min) : full;
      const minSecond = worst.alive > 0 ? Math.max(1, round(worst.alive * damageMin * total)) : 0;
      const maxSecond = best.alive > 0 ? Math.max(1, round(best.alive * damageMax * total)) : 0;
      const defAfterMin = remainingAfter(defTotalHealth, defHealth, min);
      const defAfterMax = remainingAfter(defTotalHealth, defHealth, max);
      secondStrike = {
        attackersMin: worst.alive,
        attackersMax: best.alive,
        min: minSecond,
        max: maxSecond,
        average: Math.round((minSecond + maxSecond) / 2),
        killsMin: defAfterMin.alive > 0 ? killsFrom(minSecond, defAfterMin.topHealth, defHealth) : 0,
        killsMax: defAfterMax.alive > 0 ? killsFrom(maxSecond, defAfterMax.topHealth, defHealth) : 0,
      };
    }

    return {
      luck,
      min,
      max,
      average: Math.round((min + max) / 2),
      killsMin: killsFrom(min, defTopHealth, defHealth),
      killsMax: killsFrom(max, defTopHealth, defHealth),
      strikesMin: Math.ceil(defTotalHealth / max),
      strikesMax: Math.ceil(defTotalHealth / min),
      retaliation,
      secondStrike,
    };
  });

  /** Бакет процентного модификатора: «1 + 25/100», при поле — max(порог; …) */
  const pctStep = (percent: number, label: string, param: string, floor: number | null): DamageStep => {
    const open = floor === null ? '' : `max(${floor}; `;
    const close = floor === null ? '' : ')';
    return {
      label,
      formula: `${open}1 + ${param}/100${close}`,
      tokens: tokens(`${open}1 ${percent >= 0 ? '+' : '−'} `, num(Math.abs(percent), param), `/100${close}`),
    };
  };

  const steps: DamageStep[] = [
    stackStep(P, B('stackDamage'), count, damageMin, damageMax),
    atkDefStep(P, B('atkDef'), { unit: unitAtk, hero: heroAtk }, { unit: unitDef, hero: heroDef }),
    pctStep(abilities.generalModifiers, B('general'), P('general'), null),
    pctStep(abilities.typeModifiers, B('type'), P('type'), typeCapped ? 0.1 : null),
  ];
  // Дальность попадает в формулу, только когда штраф действует.
  if (abilities.rangePenalty && distance > 3) {
    const capped = 1 - 0.1 * (distance - 3) < 0.5;
    const open = capped ? 'max(0.5; ' : '';
    const close = capped ? ')' : '';
    steps.push({
      label: B('range'),
      formula: `${open}1 − 0.1×(${P('distance')} − 3)${close}`,
      tokens: tokens(`${open}1 − 0.1×(`, num(distance, P('distance')), `−3)${close}`),
    });
  }
  if (mode !== 1) {
    steps.push({ label: B('mode'), formula: P('mode'), tokens: tokens(num(mode, P('mode'))) });
  }
  steps.push({
    label: B('luck'),
    formula: `${P('unlucky')} / ${P('normalLuck')} / ${P('lucky')}`,
    tokens: tokens(`(${LUCK_FACTOR.unlucky} / ${LUCK_FACTOR.normal} / ${LUCK_FACTOR.lucky})`),
  });

  // Формула у карточки одна на все варианты удачи, поэтому выжившие в ней
  // берутся диапазоном по всем строкам: меньше всего защитников остаётся
  // после удачного максимального удара, больше всего — после неудачного
  // минимального. Границы совпадают с survivorsMin/survivorsMax строк.
  const survivorsMin = survivorsAfter(Math.max(...byLuck.map((row) => row.max)));
  const survivorsMax = survivorsAfter(Math.min(...byLuck.map((row) => row.min)));

  const retaliationSteps: DamageStep[] = [
    stackStep(
      P,
      B('survivorsDamage'),
      { min: survivorsMin, max: survivorsMax },
      defDamageMin,
      defDamageMax,
    ),
    atkDefStep(P, B('atkDef'), { unit: defUnitAtk, hero: defHeroAtk }, { unit: attUnitDef, hero: attHeroDef }),
  ];

  // Второй удар считается по формуле первого, но от выживших атакующих:
  // их тем меньше, чем сильнее ответный удар защитника.
  const retaliations = byLuck.map((row) => row.retaliation).filter((r) => r !== null);
  const attackersAfter = (retaliation: number): number =>
    remainingAfter(attTotalHealth, health, retaliation).alive;
  const attackersMin = retaliations.length
    ? attackersAfter(Math.max(...retaliations.map((r) => r.max)))
    : count;
  const attackersMax = retaliations.length
    ? attackersAfter(Math.min(...retaliations.map((r) => r.min)))
    : count;

  const secondStrikeSteps: DamageStep[] = [
    stackStep(
      P,
      B('survivorsDamage'),
      { min: attackersMin, max: attackersMax },
      damageMin,
      damageMax,
    ),
    ...steps.slice(1),
  ];

  return {
    byLuck,
    attackDefenseModifier,
    retaliationModifier,
    typeCapped,
    steps,
    retaliationSteps,
    secondStrikeSteps,
  };
}
