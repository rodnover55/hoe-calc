export type Luck = 'normal' | 'lucky' | 'unlucky';

export interface AttackerStats {
  /** Количество существ в отряде */
  count: number;
  /** Минимальный урон одного существа */
  damageMin: number;
  /** Максимальный урон одного существа */
  damageMax: number;
  /** Атака: существо + герой */
  attack: number;
}

export interface DefenderStats {
  /** Защита: существо + герой */
  defense: number;
}

export interface AttackParams {
  luck: Luck;
  /** Гексы до цели (для дальнобойной атаки) */
  distance: number;
  /** Половинный урон: стрелок вплотную или через препятствие */
  halfDamage: boolean;
  /** Сумма общих модификаторов, % */
  generalModifiers: number;
  /** Сумма типовых модификаторов, % */
  typeModifiers: number;
}

export interface DamageStep {
  label: string;
  text: string;
}

export interface DamageResult {
  min: number;
  max: number;
  average: number;
  /** Множитель (20 + ATK) / (20 + DEF) */
  attackDefenseModifier: number;
  /** Сработало ли ограничение типовых модификаторов в 10% */
  typeCapped: boolean;
  steps: DamageStep[];
}

export const LUCK_FACTOR: Record<Luck, number> = {
  normal: 1,
  lucky: 1.5,
  unlucky: 0.5,
};

/** Дальнобойная атака теряет 10% за каждый гекс сверх трёх, максимум −50% */
export function rangeFactor(distance: number, halfDamage: boolean): number {
  let factor = 1;
  if (distance > 3) factor *= Math.max(0.5, 1 - 0.1 * (distance - 3));
  if (halfDamage) factor *= 0.5;
  return factor;
}

/** Округление до ближайшего целого, 0.5 — вверх */
const round = (x: number): number => (x % 1 >= 0.5 ? Math.ceil(x) : Math.floor(x));

export function calculateDamage(
  attacker: AttackerStats,
  attack: AttackParams,
  defender: DefenderStats,
): DamageResult {
  const count = Math.max(1, attacker.count);
  const damageMin = Math.max(0, attacker.damageMin);
  const damageMax = Math.max(damageMin, attacker.damageMax);
  const atk = Math.max(0, attacker.attack);
  const def = Math.max(0, defender.defense);

  const attackDefenseModifier = (20 + atk) / (20 + def);
  const general = Math.max(0, 1 + attack.generalModifiers / 100);
  const typeRaw = 1 + attack.typeModifiers / 100;
  const type = Math.max(0.1, typeRaw);
  const typeCapped = typeRaw < 0.1;
  const luck = LUCK_FACTOR[attack.luck];
  const range = rangeFactor(Math.max(1, attack.distance), attack.halfDamage);

  const total = attackDefenseModifier * general * type * luck * range;
  const min = Math.max(1, round(count * damageMin * total));
  const max = Math.max(1, round(count * damageMax * total));

  const steps: DamageStep[] = [
    { label: 'отряд', text: `${count} × (${damageMin}–${damageMax})` },
    { label: 'АТК/ЗЩТ', text: `×${attackDefenseModifier.toFixed(2)}` },
  ];
  if (general !== 1) steps.push({ label: 'общие', text: `×${general.toFixed(2)}` });
  if (type !== 1) {
    steps.push({
      label: typeCapped ? 'типовые, ограничено 10%' : 'типовые',
      text: `×${type.toFixed(2)}`,
    });
  }
  if (range !== 1) steps.push({ label: 'дальность/половина', text: `×${range.toFixed(2)}` });
  if (luck !== 1) steps.push({ label: 'удача', text: `×${luck.toFixed(1)}` });

  return {
    min,
    max,
    average: Math.round((min + max) / 2),
    attackDefenseModifier,
    typeCapped,
    steps,
  };
}
