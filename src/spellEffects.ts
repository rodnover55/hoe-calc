import type { AttackMode, Reach } from './abilityEffects';
import type { SpellLevel } from './spells';
import { SPELLS_BY_ID, clampSpellLevel } from './spells';

/**
 * Эффекты заклинаний, наложенных на отряд: карта влияющих на расчёт
 * заклинаний и перевод выбранных эффектов в аддитивные слагаемые
 * калькулятора. Величины взяты из описаний конкретных заклинаний на
 * olden-era.com (тексты уровней хранятся в src/data/spells) и заданы
 * по уровням изучения 1–4; сила магии кастера участвует только там, где
 * она есть в формуле описания.
 */

/** Наложенный на отряд эффект заклинания */
export interface SpellEffectPick {
  /** id заклинания из каталога spells.ts */
  spellId: string;
  /** Уровень изучения заклинания 1–4 */
  level: SpellLevel;
  /**
   * Сила магии героя-кастера эффекта (у дебаффа — вражеского героя);
   * используется только формулами вида «база + N × сила магии»
   */
  spellPower: number;
}

/** Величина уровня: число или формула от силы магии кастера */
export type Amount = number | { base: number; perSpellPower: number };

/** Величины по уровням изучения; индекс — уровень − 1 */
export type PerLevel = [Amount, Amount, Amount, Amount];

/** Значение величины при силе магии кастера */
export const resolveAmount = (amount: Amount, spellPower: number): number =>
  typeof amount === 'number'
    ? amount
    : amount.base + amount.perSpellPower * Math.max(0, spellPower);

/**
 * Виды эффектов; `reaches` — типы удара, при которых эффект действует,
 * по уровням изучения (нет — при любых).
 */
export type SpellEffectKind =
  /** Урон обычных атак носителя, ±%; maxDamage — носитель всегда наносит максимум */
  | { kind: 'damage_percent'; percents: PerLevel; reaches?: Reach[][]; maxDamage?: boolean }
  /** Входящий урон носителю, ±% */
  | { kind: 'incoming_percent'; percents: PerLevel; reaches?: Reach[][] }
  /** Постоянная прибавка к атаке и защите носителя */
  | { kind: 'stats'; attack: number; defense: number }
  /** Чистый урон к каждой обычной атаке носителя */
  | { kind: 'flat_pure'; amounts: PerLevel }
  /** Изменение максимального здоровья существа-носителя, ±% */
  | { kind: 'max_health_percent'; percents: PerLevel }
  /** Урон контратак носителя, ±% */
  | { kind: 'retaliation_percent'; percents: PerLevel }
  /** Носитель получает +% урона; с maxFromLevel — всегда максимальный */
  | { kind: 'vulnerability'; percents: PerLevel; maxFromLevel: SpellLevel };

const MELEE: Reach[][] = [['melee'], ['melee'], ['melee'], ['melee']];
const RANGED: Reach[][] = [['ranged', 'long'], ['ranged', 'long'], ['ranged', 'long'], ['ranged', 'long']];

/**
 * Влияющие на расчёт заклинания по слагам каталога. Величины сверены с
 * русскими текстами уровней; заклинания без записи здесь (нюки, DoT,
 * контроль) выбираются в списке эффектов, но дают только справочную
 * заметку. Рост величины «Удлинить/Укоротить тень» по раундам боя не
 * моделируется — берётся базовое значение.
 */
export const SPELL_KINDS: Record<string, SpellEffectKind> = {
  blessing: { kind: 'damage_percent', percents: [15, 20, 20, 30] },
  blessing_m: { kind: 'damage_percent', percents: [15, 20, 20, 30], maxDamage: true },
  berserk: { kind: 'damage_percent', percents: [0, 10, 20, 30] },
  berserk_m: { kind: 'damage_percent', percents: [0, 10, 20, 30] },
  shade_cloak: { kind: 'damage_percent', percents: [0, 25, 25, 50] },
  favorable_wind: { kind: 'damage_percent', percents: [20, 30, 40, 40], reaches: RANGED },
  twilight: { kind: 'damage_percent', percents: [0, 0, -15, -15], reaches: MELEE },
  unnatural_calm: { kind: 'damage_percent', percents: [-15, -20, -20, -30] },
  unnatural_calm_m: { kind: 'damage_percent', percents: [-15, -20, -20, -30] },
  thick_hide: { kind: 'incoming_percent', percents: [-15, -20, -20, -30], reaches: MELEE },
  optical_illusion: {
    kind: 'incoming_percent',
    percents: [-30, -60, -60, -60],
    reaches: [['ranged'], ['ranged'], ['ranged', 'long'], ['ranged', 'long']],
  },
  radiant_armour: { kind: 'incoming_percent', percents: [-15, -25, -25, -35] },
  enlarge_shadow: { kind: 'stats', attack: 3, defense: 3 },
  shorten_shadow: { kind: 'stats', attack: -3, defense: -3 },
  heavenly_blades: { kind: 'flat_pure', amounts: [35, 75, 75, 75] },
  fatal_decay: { kind: 'max_health_percent', percents: [0, -20, -20, -30] },
  riposte: { kind: 'retaliation_percent', percents: [0, 20, 20, 20] },
  vulnerability: { kind: 'vulnerability', percents: [20, 30, 30, 30], maxFromLevel: 3 },
  vulnerability_m: { kind: 'vulnerability', percents: [20, 30, 30, 30], maxFromLevel: 3 },
};

/**
 * Использует ли формула эффекта силу магии кастера — тогда у эффекта
 * в списке показывается поле силы магии
 */
export const usesSpellPower = (spellId: string): boolean => {
  const kind = SPELL_KINDS[spellId];
  if (!kind || kind.kind === 'stats') return false;
  const amounts = kind.kind === 'flat_pure' ? kind.amounts : kind.percents;
  return amounts.some((amount) => typeof amount !== 'number');
};

/** Вклад одного заклинания в модификатор */
export interface SpellContribution {
  /** id заклинания-источника — для подписи числа в формуле */
  spellId: string;
  /** Величина вклада */
  value: number;
}

/** Слагаемые эффектов отряда-носителя; списки — по заклинаниям */
export interface SpellBonuses {
  /** Прибавка к атаке юнита-носителя */
  attack: number;
  /** Прибавка к защите юнита-носителя */
  defense: number;
  /** Вклады в типовые модификаторы основного удара, % */
  typeModifiers: SpellContribution[];
  /** Чистый урон к каждому удару носителя-атакующего */
  flatDamage: SpellContribution[];
  /** Дельта здоровья существа-носителя */
  health: number;
  /** Модификаторы урона контратаки носителя-защитника, % */
  retaliationPercent: SpellContribution[];
  /** Основной удар всегда наносит максимальный урон */
  maxDamage: boolean;
}

export const EMPTY_SPELL_BONUSES: SpellBonuses = {
  attack: 0,
  defense: 0,
  typeModifiers: [],
  flatDamage: [],
  health: 0,
  retaliationPercent: [],
  maxDamage: false,
};

/** Вход spellBonuses: эффекты отряда стороны и контекст расчёта */
export interface SpellBonusInput {
  /** Наложенные на отряд стороны эффекты */
  effects: SpellEffectPick[];
  /** Здоровье существа из формы — база процентов максимального здоровья */
  health: number;
  /** Режим атаки текущего расчёта */
  mode: AttackMode;
  /** Сторона отряда-носителя эффектов */
  side: 'attacker' | 'defender';
}

/**
 * Слагаемые эффектов заклинаний, наложенных на отряд стороны.
 *
 * Эффект описывает, что происходит с отрядом-носителем: бафф урона
 * действует, когда носитель атакует, снижение входящего урона — когда
 * защищается. Статовые эффекты и здоровье действуют всегда; процентные
 * и чистый урон — только на обычные атаки (не на способности с
 * собственным уроном), как и у бонусов героя. Вклад эффектов виден в
 * формуле: проценты — отдельным слагаемым типового бакета, чистый урон
 * и модификатор ответа — своими бакетами.
 *
 * @param input эффекты отряда, здоровье существа, режим атаки и сторона.
 * @returns аддитивные слагаемые к статам и модификаторам.
 */
export function spellBonuses(input: SpellBonusInput): SpellBonuses {
  const { mode, side } = input;
  const result: SpellBonuses = {
    ...EMPTY_SPELL_BONUSES,
    typeModifiers: [],
    flatDamage: [],
    retaliationPercent: [],
  };
  const regular = !mode.special;

  for (const pick of input.effects) {
    const kind = SPELLS_BY_ID.has(pick.spellId) ? SPELL_KINDS[pick.spellId] : undefined;
    const index = clampSpellLevel(pick.level) - 1;
    const reachAllowed = (reaches?: Reach[][]): boolean =>
      !reaches || reaches[index].includes(mode.reach);
    const contribute = (list: SpellContribution[], value: number) => {
      if (value !== 0) list.push({ spellId: pick.spellId, value });
    };

    switch (kind?.kind) {
      case 'damage_percent': {
        if (side !== 'attacker' || !regular || !reachAllowed(kind.reaches)) break;
        contribute(result.typeModifiers, resolveAmount(kind.percents[index], pick.spellPower));
        if (kind.maxDamage) result.maxDamage = true;
        break;
      }
      case 'incoming_percent': {
        if (side !== 'defender' || !regular || !reachAllowed(kind.reaches)) break;
        contribute(result.typeModifiers, resolveAmount(kind.percents[index], pick.spellPower));
        break;
      }
      case 'vulnerability': {
        if (side !== 'defender' || !regular) break;
        contribute(result.typeModifiers, resolveAmount(kind.percents[index], pick.spellPower));
        if (pick.level >= kind.maxFromLevel) result.maxDamage = true;
        break;
      }
      case 'stats': {
        result.attack += kind.attack;
        result.defense += kind.defense;
        break;
      }
      case 'flat_pure': {
        if (side !== 'attacker' || !regular) break;
        contribute(
          result.flatDamage,
          Math.max(0, resolveAmount(kind.amounts[index], pick.spellPower)),
        );
        break;
      }
      case 'max_health_percent': {
        // Дробная часть процента отбрасывается по величине, как у долей
        // статов героя в heroEffects.
        const percent = resolveAmount(kind.percents[index], pick.spellPower);
        result.health += Math.trunc((Math.max(0, input.health) * percent) / 100);
        break;
      }
      case 'retaliation_percent': {
        if (side !== 'defender' || !regular) break;
        contribute(result.retaliationPercent, resolveAmount(kind.percents[index], pick.spellPower));
        break;
      }
    }
  }
  return result;
}
