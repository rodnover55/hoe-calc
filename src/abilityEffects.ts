/**
 * Курируемая карта способностей, влияющих на расчёт урона.
 *
 * Слаги способностей с olden-era.com переводятся в поведение калькулятора:
 * список режимов атаки юнита (базовые атаки, боевые стойки, активные
 * способности с собственным уроном), множители и штрафы, их отмена
 * («Снайпер», «Дуэлянт»), ответный удар по умолчанию, двойной удар и
 * снижение входящего урона защитником. Способности, не перечисленные
 * здесь, на расчёт не влияют и только отображаются в карточке юнита.
 */

import type { Lang } from './i18n';
import { translate } from './i18n';
import type { AttackType, UnitAbility, UnitPreset } from './units';
import { abilityName } from './units';

/** Тип удара режима: ближний, через гекс или выстрел */
export type Reach = 'melee' | 'long' | 'ranged';

/** Собственный расчёт урона способности, минуя обычную формулу */
export interface SpecialAttack {
  /** Чистый урон не снижается ничем, магический — защитой от магии */
  kind: 'pure' | 'magic';
  /** Доля урона обычной атаки; если нет — действует base/perUnit */
  factor?: number;
  /** Слагаемое фиксированной формулы урона */
  base?: number;
  /** Множитель количества в фиксированной формуле урона */
  perUnit?: number;
  /** Игнорирует защиту цели: урон растёт от атаки без вычета защиты */
  ignoreDefense?: boolean;
}

/** Режим атаки: вариант удара, который выбирает игрок */
export interface AttackMode {
  /** 'base' | 'ranged' | 'melee' | 'half' | слаг способности */
  id: string;
  /** Подпись кнопки на языке, переданном в attackModesFor */
  label: string;
  /** Множитель урона режима */
  multiplier: number;
  /** Действует ли штраф дальности */
  rangePenalty: boolean;
  /** Тип удара: от него зависят ответ, «Двойной выстрел» и защита цели */
  reach: Reach;
  /** Провоцирует ли атака ответный удар (без учёта «Стремительного удара») */
  provokesRetaliation: boolean;
  /** Способность с собственным расчётом урона */
  special?: SpecialAttack;
}

type AbilityEffect =
  /** Альтернативная атака по обычной формуле: боевая стойка */
  | { kind: 'style'; multiplier: number; reach: Reach }
  /** Активная способность с собственным уроном; формула — из описания */
  | { kind: 'cast'; damage: 'pure' | 'magic'; ignoreDefense?: boolean }
  /** Множитель урона базовой ближней атаки («Драконий клинок») */
  | { kind: 'melee_multiplier'; multiplier: number }
  /** Нет штрафа дальности */
  | { kind: 'sharpshooter' }
  /** Нет штрафа стрелку вплотную */
  | { kind: 'duelist' }
  /** Враги не отвечают на атаку */
  | { kind: 'swift_strike' }
  /** Бьёт дважды при любой атаке */
  | { kind: 'double_strike' }
  /** Бьёт дважды при дальней атаке */
  | { kind: 'double_shot' };

const EFFECTS: Record<string, AbilityEffect> = {
  sharpshooter: { kind: 'sharpshooter' },
  duelist: { kind: 'duelist' },
  swift_strike: { kind: 'swift_strike' },
  double_strike: { kind: 'double_strike' },
  double_shot: { kind: 'double_shot' },
  draconic_blade: { kind: 'melee_multiplier', multiplier: 2 },
  piercing_shot: { kind: 'style', multiplier: 0.5, reach: 'ranged' },
  fighting_style_whirlwind_strike: { kind: 'style', multiplier: 0.5, reach: 'melee' },
  fighting_style_grand_slam: { kind: 'style', multiplier: 0.5, reach: 'melee' },
  fighting_style_bouncing_glaives: { kind: 'style', multiplier: 0.5, reach: 'melee' },
  fighting_style_arrow_barrage: { kind: 'style', multiplier: 0.5, reach: 'ranged' },
  fighting_style_hit_and_run: { kind: 'style', multiplier: 0.5, reach: 'melee' },
  // Плевок — атака через гекс: как и long_reach, не провоцирует контратаку.
  fighting_style_viscous_spit: { kind: 'style', multiplier: 0.5, reach: 'long' },
  fighting_style_sulphurous_assault: { kind: 'style', multiplier: 0.5, reach: 'melee' },
  abyssal_tendril: { kind: 'cast', damage: 'pure' },
  ball_lightning: { kind: 'cast', damage: 'magic' },
  big_rock_rrr: { kind: 'cast', damage: 'magic' },
  black_ice_shard: { kind: 'cast', damage: 'pure' },
  blood_transfusion: { kind: 'cast', damage: 'magic' },
  bone_armageddon: { kind: 'cast', damage: 'pure' },
  doreaths_way: { kind: 'cast', damage: 'pure' },
  gaze_of_the_abyss_slow: { kind: 'cast', damage: 'pure' },
  gaze_of_the_abyss_sluggishness: { kind: 'cast', damage: 'pure' },
  glance_of_the_abyss: { kind: 'cast', damage: 'pure' },
  icy_breath: { kind: 'cast', damage: 'pure' },
  icy_spikes: { kind: 'cast', damage: 'pure' },
  promise_of_love: { kind: 'cast', damage: 'magic' },
  rrr_jump: { kind: 'cast', damage: 'pure' },
  shadow_strike: { kind: 'cast', damage: 'pure', ignoreDefense: true },
  starfall: { kind: 'cast', damage: 'magic' },
  swarm_of_bees: { kind: 'cast', damage: 'pure' },
  swift_penance: { kind: 'cast', damage: 'magic' },
};

/** Постоянное снижение входящего урона по типу удара, % */
const DAMAGE_REDUCTION: Record<string, Partial<Record<Reach, number>>> = {
  ranged_defence_1: { ranged: -30 },
  ranged_defence_3: { ranged: -60 },
  melee_defence_3: { melee: -60 },
  disdain: { melee: -25, long: -50, ranged: -75 },
};

/** Постоянное снижение входящего магического урона, % */
const MAGIC_REDUCTION: Record<string, number> = {
  magic_defence_3: -60,
  magic_defence_4: -90,
};

const hasAbility = (unit: UnitPreset | null, slug: string): boolean =>
  unit?.abilities?.some((ability) => ability.id === slug) ?? false;

/**
 * Тип атаки юнита. Источник истины — список способностей; для юнитов
 * без него используется поле attackType.
 */
const attackKindOf = (unit: UnitPreset): AttackType => {
  if (unit.abilities?.length) {
    if (hasAbility(unit, 'ranged_attack')) return 'ranged';
    if (hasAbility(unit, 'long_reach')) return 'long_reach';
    return 'melee';
  }
  return unit.attackType;
};

/**
 * Формула урона активной способности из её русского описания: либо доля
 * урона обычной атаки («в размере 50% от обычной атаки»), либо
 * фиксированная формула («[ 15 + 3 × численность отряда ]»).
 * Возвращает null, если описание не распознано. Русский текст здесь —
 * формат данных, а не UI: разбор не зависит от языка интерфейса.
 */
const parseSpecial = (ability: UnitAbility, effect: { damage: 'pure' | 'magic'; ignoreDefense?: boolean }): SpecialAttack | null => {
  const d = ability.description;
  const factor = d.match(/в размере (\d+)% от обычной атаки/);
  if (factor) {
    return { kind: effect.damage, factor: Number(factor[1]) / 100, ignoreDefense: effect.ignoreDefense };
  }
  if (/урон(?:а)? от обычной атаки/.test(d)) {
    return { kind: effect.damage, factor: 1, ignoreDefense: effect.ignoreDefense };
  }
  const fixed = d.match(/\[\s*(?:(\d+)\s*\+\s*)?(\d+)\s*×\s*численность отряда\s*\]/);
  if (fixed) {
    return {
      kind: effect.damage,
      base: fixed[1] ? Number(fixed[1]) : 0,
      perUnit: Number(fixed[2]),
      ignoreDefense: effect.ignoreDefense,
    };
  }
  return null;
};

/**
 * Список режимов атаки юнита: базовые режимы по типу атаки, боевые стойки
 * и активные способности с собственным уроном из его способностей.
 *
 * Стрелок получает дальний режим (штраф дальности отменяет «Снайпер») и
 * ближний ×0.5 (штраф отменяет «Дуэлянт»); остальные — базовую атаку без
 * штрафов. «Драконий клинок» удваивает базовый ближний урон. Без юнита
 * возвращаются режимы ручного ввода, повторяющие прежнее поведение
 * калькулятора.
 *
 * @param unit выбранный юнит или null при ручном вводе характеристик.
 * @param lang язык подписей режимов.
 * @returns непустой список режимов; первый — режим по умолчанию.
 */
export function attackModesFor(unit: UnitPreset | null, lang: Lang = 'ru'): AttackMode[] {
  if (!unit) {
    return [
      {
        id: 'base',
        label: translate(lang, 'modes.base'),
        multiplier: 1,
        rangePenalty: true,
        reach: 'melee',
        provokesRetaliation: true,
      },
      {
        id: 'half',
        label: translate(lang, 'modes.half'),
        multiplier: 0.5,
        rangePenalty: true,
        reach: 'melee',
        provokesRetaliation: true,
      },
    ];
  }

  const sharp = hasAbility(unit, 'sharpshooter');
  const meleeMultiplier = (unit.abilities ?? []).reduce((mult, ability) => {
    const effect = EFFECTS[ability.id];
    return effect?.kind === 'melee_multiplier' ? mult * effect.multiplier : mult;
  }, 1);
  const meleeSuffix = meleeMultiplier !== 1 ? ` (×${meleeMultiplier})` : '';
  const kind = attackKindOf(unit);
  const modes: AttackMode[] = [];

  if (kind === 'ranged') {
    const duel = hasAbility(unit, 'duelist');
    modes.push({
      id: 'ranged',
      label: translate(lang, 'modes.ranged'),
      multiplier: 1,
      rangePenalty: !sharp,
      reach: 'ranged',
      provokesRetaliation: false,
    });
    const meleeBase = duel ? 1 : 0.5;
    modes.push({
      id: 'melee',
      label: `${translate(lang, 'modes.melee')}${meleeBase * meleeMultiplier !== 1 ? ` (×${meleeBase * meleeMultiplier})` : ''}`,
      multiplier: meleeBase * meleeMultiplier,
      rangePenalty: false,
      reach: 'melee',
      provokesRetaliation: true,
    });
  } else {
    // Атака через гекс не провоцирует контратаку (описание long_reach).
    const reach: Reach = kind === 'long_reach' ? 'long' : 'melee';
    modes.push({
      id: 'base',
      label: `${translate(lang, 'modes.base')}${reach === 'melee' ? meleeSuffix : ''}`,
      multiplier: reach === 'melee' ? meleeMultiplier : 1,
      rangePenalty: false,
      reach,
      provokesRetaliation: reach === 'melee',
    });
  }

  for (const ability of unit.abilities ?? []) {
    const effect = EFFECTS[ability.id];
    if (effect?.kind === 'style') {
      modes.push({
        id: ability.id,
        label: `${abilityName(ability, lang)} (×${effect.multiplier})`,
        multiplier: effect.multiplier,
        rangePenalty: effect.reach === 'ranged' && !sharp,
        reach: effect.reach,
        provokesRetaliation: effect.reach === 'melee',
      });
    } else if (effect?.kind === 'cast') {
      const special = parseSpecial(ability, effect);
      if (!special) continue;
      modes.push({
        id: ability.id,
        label: abilityName(ability, lang),
        multiplier: 1,
        rangePenalty: false,
        reach: 'ranged',
        provokesRetaliation: false,
        special,
      });
    }
  }

  return modes;
}

/**
 * Будет ли ответный удар по умолчанию: не провоцирующие ответ режимы
 * (дальняя атака, атака через гекс, способности) и «Стремительный удар»
 * снимают его.
 */
export function defaultRetaliation(unit: UnitPreset | null, mode: AttackMode): boolean {
  return mode.provokesRetaliation && !hasAbility(unit, 'swift_strike');
}

/**
 * Бьёт ли юнит дважды в выбранном режиме: «Двойной удар» действует при
 * обычных атаках, «Двойной выстрел» — только при дальней. На способности
 * с собственным уроном двойной удар не распространяется.
 */
export function doubleStrikeFor(unit: UnitPreset | null, mode: AttackMode): boolean {
  if (mode.special) return false;
  return hasAbility(unit, 'double_strike') || (hasAbility(unit, 'double_shot') && mode.reach === 'ranged');
}

/**
 * Постоянное снижение входящего урона защитником для выбранного режима.
 *
 * Для обычных атак действуют «Защита от выстрелов», «Защита в ближнем
 * бою» и «Презрение» по типу удара; для магических способностей —
 * «Защита от магии». Чистый урон не снижается ничем.
 *
 * @returns процент (отрицательный) и название способности, либо null.
 */
export function damageReduction(
  defender: UnitPreset | null,
  mode: AttackMode,
  lang: Lang = 'ru',
): { percent: number; source: string } | null {
  if (!defender?.abilities) return null;
  if (mode.special) {
    if (mode.special.kind !== 'magic') return null;
    for (const ability of defender.abilities) {
      const percent = MAGIC_REDUCTION[ability.id];
      if (percent !== undefined) return { percent, source: abilityName(ability, lang) };
    }
    return null;
  }
  for (const ability of defender.abilities) {
    const percent = DAMAGE_REDUCTION[ability.id]?.[mode.reach];
    if (percent !== undefined) return { percent, source: abilityName(ability, lang) };
  }
  return null;
}
