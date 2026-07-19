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

export interface AttackParams {
  /** Гексы до цели (для дальнобойной атаки) */
  distance: number;
  /** Половинный урон: стрелок вплотную или через препятствие */
  halfDamage: boolean;
  /** Сумма общих модификаторов, % */
  generalModifiers: number;
  /** Сумма типовых модификаторов, % */
  typeModifiers: number;
  /** Будет ли ответный удар */
  retaliation: boolean;
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
}

export interface LuckDamage {
  luck: Luck;
  min: number;
  max: number;
  average: number;
  /** Погибшие существа защитника; не ограничено размером отряда */
  killsMin: number;
  killsMax: number;
  /** Ответный удар выживших; null, если ответа не будет */
  retaliation: RetaliationDamage | null;
}

export interface DamageStep {
  /** Подпись под множителем; для вычисляемых множителей включает значение */
  label: string;
  /** Множитель с подставленными значениями */
  text: string;
}

export interface DamageResult {
  /** Диапазоны урона по вариантам удачи: неудача, обычный, удача */
  byLuck: LuckDamage[];
  /** Множитель (20 + ATK) / (20 + DEF) */
  attackDefenseModifier: number;
  /** Множитель ответного удара: (20 + ATK защитника) / (20 + DEF атакующего) */
  retaliationModifier: number;
  /** Сработало ли ограничение типовых модификаторов в 10% */
  typeCapped: boolean;
  /** Полная формула урона с подставленными значениями, по множителям */
  steps: DamageStep[];
  /** Формула ответного удара с подставленными значениями */
  retaliationSteps: DamageStep[];
}

export const LUCK_FACTOR: Record<Luck, number> = {
  normal: 1,
  lucky: 1.5,
  unlucky: 0.5,
};

export const LUCK_ORDER: Luck[] = ['unlucky', 'normal', 'lucky'];

/** Дальнобойная атака теряет 10% за каждый гекс сверх трёх, максимум −50% */
export function rangeFactor(distance: number, halfDamage: boolean): number {
  let factor = 1;
  if (distance > 3) factor *= Math.max(0.5, 1 - 0.1 * (distance - 3));
  if (halfDamage) factor *= 0.5;
  return factor;
}

/** Округление до ближайшего целого, 0.5 — вверх */
const round = (x: number): number => (x % 1 >= 0.5 ? Math.ceil(x) : Math.floor(x));

/**
 * Сколько существ умрёт от урона: первым гибнет верхний юнит с неполным
 * здоровьем, дальше — существа с полным. Не ограничено размером отряда.
 */
const killsFrom = (damage: number, topHealth: number, health: number): number =>
  damage < topHealth ? 0 : 1 + Math.floor((damage - topHealth) / health);

export function calculateDamage(
  attacker: AttackerStats,
  attack: AttackParams,
  defender: DefenderStats,
): DamageResult {
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
  const generalRaw = 1 + attack.generalModifiers / 100;
  const general = Math.max(0, generalRaw);
  const typeRaw = 1 + attack.typeModifiers / 100;
  const type = Math.max(0.1, typeRaw);
  const typeCapped = typeRaw < 0.1;
  const distance = Math.max(1, attack.distance);
  const range = rangeFactor(distance, attack.halfDamage);

  /** Сколько существ защитника переживёт указанный урон */
  const defTotalHealth = (defCount - 1) * defHealth + defTopHealth;
  const survivorsAfter = (damage: number): number =>
    Math.max(0, Math.ceil((defTotalHealth - damage) / defHealth));

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
    };
  };

  const base = attackDefenseModifier * general * type * range;
  const byLuck = LUCK_ORDER.map((luck) => {
    const total = base * LUCK_FACTOR[luck];
    const min = Math.max(1, round(count * damageMin * total));
    const max = Math.max(1, round(count * damageMax * total));
    return {
      luck,
      min,
      max,
      average: Math.round((min + max) / 2),
      killsMin: killsFrom(min, defTopHealth, defHealth),
      killsMax: killsFrom(max, defTopHealth, defHealth),
      retaliation: attack.retaliation ? retaliationAfter(min, max) : null,
    };
  });

  /** Подставленная форма процентного модификатора: «1 + 25/100» */
  const pctText = (percent: number) => `1 ${percent >= 0 ? '+' : '−'} ${Math.abs(percent)}/100`;

  const rangeParts: string[] = [];
  if (distance > 3) {
    const rangeRaw = 1 - 0.1 * (distance - 3);
    const penalty = `1 − 0.1×(${distance}−3)`;
    rangeParts.push(
      rangeRaw < 0.5
        ? `max(0.5; ${penalty})`
        : attack.halfDamage
          ? `(${penalty})`
          : penalty,
    );
  }
  if (attack.halfDamage) rangeParts.push('0.5');

  const steps: DamageStep[] = [
    { label: 'отряд × урон', text: `${count} × (${damageMin}–${damageMax})` },
    {
      label: `АТК/ЗЩТ = ${attackDefenseModifier.toFixed(2)}`,
      text: `(20 + ${unitAtk} + ${heroAtk}) / (20 + ${unitDef} + ${heroDef})`,
    },
    {
      label: `общие = ${general.toFixed(2)}`,
      text:
        generalRaw < 0
          ? `max(0; ${pctText(attack.generalModifiers)})`
          : pctText(attack.generalModifiers),
    },
    {
      label: `типовые = ${type.toFixed(2)}${typeCapped ? ' (мин 10%)' : ''}`,
      text: typeCapped ? `max(0.1; ${pctText(attack.typeModifiers)})` : pctText(attack.typeModifiers),
    },
    {
      label: `дальность = ${range.toFixed(2)}`,
      text: rangeParts.length > 0 ? rangeParts.join(' × ') : '1',
    },
    { label: 'удача', text: '(0.5 / 1 / 1.5)' },
  ];

  const retaliationSteps: DamageStep[] = [
    { label: 'выжившие × урон', text: `выжившие × (${defDamageMin}–${defDamageMax})` },
    {
      label: `АТК/ЗЩТ = ${retaliationModifier.toFixed(2)}`,
      text: `(20 + ${defUnitAtk} + ${defHeroAtk}) / (20 + ${attUnitDef} + ${attHeroDef})`,
    },
  ];

  return {
    byLuck,
    attackDefenseModifier,
    retaliationModifier,
    typeCapped,
    steps,
    retaliationSteps,
  };
}
