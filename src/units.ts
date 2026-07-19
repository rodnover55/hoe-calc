import { parse } from 'yaml';

export type Faction =
  | 'temple'
  | 'necropolis'
  | 'sylvan'
  | 'dungeon'
  | 'hive'
  | 'schism'
  | 'neutral';

export type AttackType = 'melee' | 'long_reach' | 'ranged';

export interface UnitStats {
  health: number;
  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  initiative: number;
  speed: number;
}

/** Способность юнита с olden-era.com */
export interface UnitAbility {
  /** Слаг способности: имя файла её иконки на olden-era.com */
  id: string;
  /** Русское название */
  name: string;
  /** Русское описание */
  description: string;
}

export interface UnitPreset {
  id: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  faction: Faction;
  tier: number;
  /** 0 — базовый юнит, 1–2 — альтернативные улучшения */
  grade: number;
  /** Для улучшений — id базового юнита */
  upgradeOf?: string;
  /** Путь к портрету относительно public/ */
  image: string;
  stats: UnitStats;
  attackType: AttackType;
  flying: boolean;
  /** Способности юнита; влияющие на расчёт перечислены в abilityEffects.ts */
  abilities?: UnitAbility[];
  growth?: number;
  cost?: number;
  source?: string;
}

export const FACTION_LABEL: Record<Faction, string> = {
  temple: 'Храм',
  necropolis: 'Некрополис',
  sylvan: 'Сильван',
  dungeon: 'Подземелье',
  hive: 'Улей',
  schism: 'Раскол',
  neutral: 'Нейтралы',
};

export const FACTION_ORDER: Faction[] = [
  'temple',
  'necropolis',
  'sylvan',
  'dungeon',
  'hive',
  'schism',
  'neutral',
];

export const ATTACK_TYPE_LABEL: Record<AttackType, string> = {
  melee: 'ближний бой',
  long_reach: 'удар через гекс',
  ranged: 'стрелок',
};

const files = import.meta.glob('./data/units/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const UNITS: UnitPreset[] = Object.values(files)
  .map((raw) => parse(raw) as UnitPreset)
  .sort(
    (a, b) =>
      FACTION_ORDER.indexOf(a.faction) - FACTION_ORDER.indexOf(b.faction) ||
      a.tier - b.tier ||
      a.grade - b.grade ||
      a.name.localeCompare(b.name, 'ru'),
  );

export const UNITS_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]));

/** Базовые юниты фракции (грейд 0), по возрастанию тира */
export const baseUnits = (faction: Faction): UnitPreset[] =>
  UNITS.filter((unit) => unit.faction === faction && unit.grade === 0);

/** Все грейды юнита: база и её улучшения, по возрастанию грейда */
export const gradesOf = (unit: UnitPreset): UnitPreset[] => {
  const baseId = unit.upgradeOf ?? unit.id;
  return UNITS.filter((u) => u.id === baseId || u.upgradeOf === baseId);
};
