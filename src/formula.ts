/**
 * Расчёт урона боя Heroes of Might and Magic: Olden Era.
 *
 * Экспортирует чистую функцию `calculateDamage`: полное описание боя —
 * оба отряда с характеристиками героев и учитываемые абилки атаки —
 * приходит одним входным объектом, результат — три однотипных блока
 * урона: удар атакующего, ответный удар выживших и второй удар после
 * ответа. Каждый блок считается одной и той же формулой со строками
 * удачи и формулой расчёта с подставленными значениями — блоки
 * отличаются только входными данными. Названия параметров формулы
 * берутся из локали по языку, переданному вторым аргументом.
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

/**
 * Именованное слагаемое от эффекта заклинания: в числовой строке формулы
 * подпись числа — название заклинания-источника
 */
export interface EffectContribution {
  /** Название заклинания для подсказки у числа */
  label: string;
  /** Величина слагаемого */
  value: number;
}

/** Сумма именованных слагаемых */
const contributionSum = (list: EffectContribution[]): number =>
  list.reduce((total, item) => total + item.value, 0);

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
  /**
   * Слагаемые типовых модификаторов от эффектов заклинаний, %; в бакете
   * формулы каждое показывается своим числом с названием заклинания, а
   * порог в 10% действует на общую сумму
   */
  effectModifiers: EffectContribution[];
  /** Будет ли ответный удар */
  retaliation: boolean;
  /** Второй удар после ответа: двойной удар или двойной выстрел */
  doubleStrike: boolean;
  /** Защитник всегда получает максимальный урон («Уязвимость» 3-го уровня) */
  maxDamage: boolean;
  /**
   * Чистый урон, прибавляемый к каждому удару атакующего («Небесные
   * клинки»); не масштабируется модификаторами и удачей, к ответному
   * удару не применяется
   */
  flatDamage: EffectContribution[];
  /** Модификаторы урона ответного удара, % («Парирование» 2-го уровня) */
  retaliationModifiers: EffectContribution[];
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

export interface LuckDamage {
  luck: Luck;
  min: number;
  max: number;
  average: number;
  /** Погибшие существа отряда-цели; не ограничено размером отряда */
  killsMin: number;
  killsMax: number;
  /**
   * Ударов с максимальным уроном строки до гибели всего отряда цели;
   * null — удар не наносит урона, отряд им не убить
   */
  strikesMin: number | null;
  /** Ударов с минимальным уроном; null — как выше */
  strikesMax: number | null;
}

/**
 * Результат одного блока урона — атаки, ответного или второго удара.
 * Все блоки считаются одной формулой «бьющие × урон × АТК/ЗЩТ ×
 * модификаторы × удача» и отличаются только входными данными.
 */
export interface StrikeResult {
  /**
   * Бьющие существа: у атаки — весь отряд, у ответного удара — выжившие
   * защитники по всем вариантам удачи атаки, у второго удара — выжившие
   * атакующие по всем вариантам удачи ответа. При нуле бить некому, и
   * строки удачи дают 0 урона.
   */
  strikers: { min: number; max: number };
  /** Диапазоны урона по вариантам удачи: неудача, обычный, удача */
  byLuck: LuckDamage[];
  /** Формула блока по бакетам с подставленными значениями */
  steps: DamageStep[];
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
  /** Удар атакующего отряда */
  attack: StrikeResult;
  /** Ответный удар выживших защитников; null, если ответа не будет */
  retaliation: StrikeResult | null;
  /** Второй удар выживших атакующих после ответа; null, если двойного удара нет */
  secondStrike: StrikeResult | null;
  /** Множитель (20 + ATK) / (20 + DEF) */
  attackDefenseModifier: number;
  /** Множитель ответного удара: (20 + ATK защитника) / (20 + DEF атакующего) */
  retaliationModifier: number;
  /** Сработало ли ограничение типовых модификаторов в 10% */
  typeCapped: boolean;
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
 * Считает три однотипных блока урона по полному описанию боя: удар
 * атакующего, ответный удар выживших защитников и второй удар после
 * ответа.
 *
 * Все блоки считаются одной формулой «бьющие × урон × АТК/ЗЩТ ×
 * модификаторы × удача» и отличаются только входными данными: у ответа
 * бьют выжившие защитники своим уроном с модификаторами ответа, у
 * второго удара — выжившие после ответа атакующие с входными данными
 * первого удара. Число выживших берётся диапазоном по всем вариантам
 * удачи предыдущего удара, а погибшие и удары до полной гибели каждого
 * блока считаются по его отряду-цели.
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
 * @returns блоки урона со строками удачи и формулой каждого,
 *   модификаторы АТК/ЗЩТ обеих сторон и признак ограничения типовых
 *   модификаторов.
 */
export function calculateDamage(input: DamageInput, lang: Lang = 'ru'): DamageResult {
  const { attacker, abilities, defender } = input;
  const P: ParamName = (key) => translate(lang, `formula.params.${key}`);
  const B: ParamName = (key) => translate(lang, `formula.labels.${key}`);

  const count = Math.max(1, attacker.count);
  const health = Math.max(1, attacker.health);
  const topHealth = Math.min(health, Math.max(1, attacker.topHealth));
  const damageMinInput = Math.max(0, attacker.damageMin);
  const damageMax = Math.max(damageMinInput, attacker.damageMax);
  // «Всегда максимальный урон» схлопывает диапазон урона атакующего.
  const damageMin = abilities.maxDamage ? damageMax : damageMinInput;
  const flatContributions = abilities.flatDamage.filter((item) => item.value > 0);
  const flatDamage = contributionSum(flatContributions);
  const effectContributions = abilities.effectModifiers.filter((item) => item.value !== 0);
  const retContributions = abilities.retaliationModifiers.filter((item) => item.value !== 0);
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
  // Модификаторы ответного удара, как и общие, ниже нуля не опускают урон.
  const retaliationRaw = 1 + contributionSum(retContributions) / 100;
  const retaliationFactor = Math.max(0, retaliationRaw);
  // Общие модификаторы, в отличие от типовых, нижнего порога не имеют:
  // от ухода множителя в минус спасает только минимум в 1 урона.
  const general = 1 + abilities.generalModifiers / 100;
  const typeRaw = 1 + (abilities.typeModifiers + contributionSum(effectContributions)) / 100;
  const type = Math.max(0.1, typeRaw);
  const typeCapped = typeRaw < 0.1;
  const distance = Math.max(1, abilities.distance);
  const range = abilities.rangePenalty ? rangeFactor(distance) : 1;
  const mode = Math.max(0, abilities.modeMultiplier);

  const defTotalHealth = (defCount - 1) * defHealth + defTopHealth;
  const attTotalHealth = (count - 1) * health + topHealth;

  /** Сколько существ отряда переживёт указанный урон */
  const aliveAfter = (totalHealth: number, unitHealth: number, damage: number): number =>
    Math.max(0, Math.ceil((totalHealth - damage) / unitHealth));

  const base = attackDefenseModifier * general * type * range * mode;

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

  /**
   * Последовательность слагаемых с подписями: первое со своим знаком,
   * остальные — через « + » и « − »; каждое число несёт название своего
   * источника в подсказке.
   */
  const contributionTokens = (list: EffectContribution[]): (string | FormulaToken)[] =>
    list.flatMap((item, index) =>
      index === 0
        ? item.value < 0
          ? ['−', num(-item.value, item.label)]
          : [num(item.value, item.label)]
        : [item.value >= 0 ? ' + ' : ' − ', num(Math.abs(item.value), item.label)],
    );

  /**
   * Бакет типовых модификаторов: сумма процента поля и слагаемых эффектов
   * под общим порогом, где каждое число подписано названием источника —
   * поля или заклинания. Легенда при этом остаётся короткой. Нулевые
   * слагаемые не показываются, а при множителе 1 (сумма слагаемых равна
   * нулю) бакет не выводится вовсе — он не влияет на урон.
   */
  const typeStep = (): DamageStep | null => {
    if (typeRaw === 1) return null;
    const terms = [
      { label: P('type'), value: abilities.typeModifiers },
      ...effectContributions,
    ].filter((item) => item.value !== 0);
    const open = typeCapped ? 'max(0.1; ' : '';
    const close = typeCapped ? ')' : '';
    const single = terms.length === 1;
    return {
      label: B('type'),
      formula: `${open}1 + ${P('type')}/100${close}`,
      tokens: tokens(
        `${open}1 ${single && terms[0].value < 0 ? '−' : '+'} ${single ? '' : '('}`,
        ...(single
          ? [num(Math.abs(terms[0].value), terms[0].label)]
          : contributionTokens(terms)),
        `${single ? '' : ')'}/100${close}`,
      ),
    };
  };

  const modifierSteps: DamageStep[] = [
    atkDefStep(P, B('atkDef'), { unit: unitAtk, hero: heroAtk }, { unit: unitDef, hero: heroDef }),
  ];
  // Единичный множитель не влияет на урон, и его бакет в формулу не попадает.
  if (abilities.generalModifiers !== 0) {
    modifierSteps.push(pctStep(abilities.generalModifiers, B('general'), P('general'), null));
  }
  const typeBucket = typeStep();
  if (typeBucket !== null) {
    modifierSteps.push(typeBucket);
  }
  // Дальность попадает в формулу, только когда штраф действует.
  if (abilities.rangePenalty && distance > 3) {
    const capped = 1 - 0.1 * (distance - 3) < 0.5;
    const open = capped ? 'max(0.5; ' : '';
    const close = capped ? ')' : '';
    modifierSteps.push({
      label: B('range'),
      formula: `${open}1 − 0.1×(${P('distance')} − 3)${close}`,
      tokens: tokens(`${open}1 − 0.1×(`, num(distance, P('distance')), `−3)${close}`),
    });
  }
  if (mode !== 1) {
    modifierSteps.push({ label: B('mode'), formula: P('mode'), tokens: tokens(num(mode, P('mode'))) });
  }
  const luckStep: DamageStep = {
    label: B('luck'),
    formula: `${P('unlucky')} / ${P('normalLuck')} / ${P('lucky')}`,
    tokens: tokens(`(${LUCK_FACTOR.unlucky} / ${LUCK_FACTOR.normal} / ${LUCK_FACTOR.lucky})`),
  };
  const flatStep: DamageStep | null =
    flatDamage > 0
      ? {
          op: '+',
          label: B('flatDamage'),
          formula: P('flatDamage'),
          tokens: tokens(
            ...(flatContributions.length === 1
              ? contributionTokens(flatContributions)
              : ['(', ...contributionTokens(flatContributions), ')']),
          ),
        }
      : null;

  /**
   * Единый расчёт блока урона: атака, ответный и второй удар считаются
   * одной формулой «бьющие × урон × модификаторы × удача (+ чистый
   * урон)» и отличаются только входными данными. Пока есть хотя бы один
   * бьющий, удар наносит минимум 1 урона; при нуле бьющих урон равен 0.
   */
  const strike = (spec: {
    /** Подпись бакета «отряд × урон» */
    label: string;
    /** Бьющие существа; диапазон — выжившие после предыдущего удара */
    strikers: { min: number; max: number };
    damageMin: number;
    damageMax: number;
    /** Произведение множителей блока без удачи */
    modifier: number;
    /** Чистый урон, прибавляемый после удачи и минимума в 1 */
    flat: number;
    /** Бакеты множителей между отрядом и удачей */
    modifierSteps: DamageStep[];
    /** Слагаемое чистого урона в конце формулы; null — не показывается */
    flatStep: DamageStep | null;
    /** Отряд-цель: здоровье для погибших и ударов до полной гибели */
    target: { health: number; topHealth: number; totalHealth: number };
  }): StrikeResult => {
    const bound = (strikers: number, damage: number, luckFactor: number): number =>
      strikers > 0
        ? Math.max(1, round(strikers * damage * spec.modifier * luckFactor)) + spec.flat
        : 0;
    return {
      strikers: spec.strikers,
      byLuck: LUCK_ORDER.map((luck) => {
        const min = bound(spec.strikers.min, spec.damageMin, LUCK_FACTOR[luck]);
        const max = bound(spec.strikers.max, spec.damageMax, LUCK_FACTOR[luck]);
        return {
          luck,
          min,
          max,
          average: Math.round((min + max) / 2),
          killsMin: killsFrom(min, spec.target.topHealth, spec.target.health),
          killsMax: killsFrom(max, spec.target.topHealth, spec.target.health),
          strikesMin: max > 0 ? Math.ceil(spec.target.totalHealth / max) : null,
          strikesMax: min > 0 ? Math.ceil(spec.target.totalHealth / min) : null,
        };
      }),
      steps: [
        stackStep(P, spec.label, spec.strikers, spec.damageMin, spec.damageMax),
        ...spec.modifierSteps,
        luckStep,
        ...(spec.flatStep ? [spec.flatStep] : []),
      ],
    };
  };

  const defenderTarget = { health: defHealth, topHealth: defTopHealth, totalHealth: defTotalHealth };
  const attackerTarget = { health, topHealth, totalHealth: attTotalHealth };

  const attack = strike({
    label: B('stackDamage'),
    strikers: { min: count, max: count },
    damageMin,
    damageMax,
    modifier: base,
    flat: flatDamage,
    modifierSteps,
    flatStep,
    target: defenderTarget,
  });

  // Выжившие защитники — диапазон по всем вариантам удачи атаки: меньше
  // всего их остаётся после удачного максимального удара, больше всего —
  // после неудачного минимального.
  const survivors = {
    min: aliveAfter(defTotalHealth, defHealth, Math.max(...attack.byLuck.map((row) => row.max))),
    max: aliveAfter(defTotalHealth, defHealth, Math.min(...attack.byLuck.map((row) => row.min))),
  };

  const retaliationModifierSteps: DamageStep[] = [
    atkDefStep(P, B('atkDef'), { unit: defUnitAtk, hero: defHeroAtk }, { unit: attUnitDef, hero: attHeroDef }),
  ];
  if (retContributions.length > 0) {
    const open = retaliationRaw < 0 ? 'max(0; ' : '';
    const close = retaliationRaw < 0 ? ')' : '';
    const single = retContributions.length === 1;
    retaliationModifierSteps.push({
      label: B('retaliationBonus'),
      formula: `${open}1 + ${P('retaliationModifiers')}/100${close}`,
      tokens: tokens(
        `${open}1 ${retContributions[0].value >= 0 || !single ? '+' : '−'} `,
        ...(single
          ? [num(Math.abs(retContributions[0].value), retContributions[0].label)]
          : ['(', ...contributionTokens(retContributions), ')']),
        `/100${close}`,
      ),
    });
  }

  const retaliation = abilities.retaliation
    ? strike({
        label: B('survivorsDamage'),
        strikers: survivors,
        damageMin: defDamageMin,
        damageMax: defDamageMax,
        modifier: retaliationModifier * retaliationFactor,
        flat: 0,
        modifierSteps: retaliationModifierSteps,
        flatStep: null,
        target: attackerTarget,
      })
    : null;

  // Выжившие атакующие для второго удара — диапазон по вариантам удачи
  // ответа; без ответа бьёт весь отряд.
  const attackers = retaliation
    ? {
        min: aliveAfter(attTotalHealth, health, Math.max(...retaliation.byLuck.map((row) => row.max))),
        max: aliveAfter(attTotalHealth, health, Math.min(...retaliation.byLuck.map((row) => row.min))),
      }
    : { min: count, max: count };

  // Второй удар считается по формуле и входным данным первого — меняется
  // только число бьющих.
  const secondStrike = abilities.doubleStrike
    ? strike({
        label: B('survivorsDamage'),
        strikers: attackers,
        damageMin,
        damageMax,
        modifier: base,
        flat: flatDamage,
        modifierSteps,
        flatStep,
        target: defenderTarget,
      })
    : null;

  return {
    attack,
    retaliation,
    secondStrike,
    attackDefenseModifier,
    retaliationModifier,
    typeCapped,
  };
}
