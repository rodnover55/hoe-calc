/**
 * Кодек состояния калькулятора для шаринга ссылкой.
 *
 * Все задаваемые пользователем параметры — статы обоих отрядов, условия
 * атаки, режим, выбранные юниты и пресеты героев с их отрядами —
 * упаковываются в компактный JSON и кодируются в base64url для
 * query-параметра `s`. Декодер никогда не роняет приложение: битая
 * строка даёт null (вызывающий берёт дефолты), неизвестный юнит
 * сбрасывается в ручной ввод с сохранением статов, недопустимый режим
 * заменяется первым доступным, невалидный пресет отбрасывается поштучно.
 * Ссылка растёт с числом пресетов (порядка сотни байт на отряд), что
 * укладывается в практические лимиты браузеров.
 */

import type { AttackAbilities, AttackerStats, DefenderStats } from './formula';
import { attackModesFor } from './abilityEffects';
import type { HeroPick, SkillPick } from './heroEffects';
import {
  EMPTY_HERO_PICK,
  HERO_STRIKE_MODE_ID,
  clampLevel,
  defaultSkillPicks,
} from './heroEffects';
import type { GameHero } from './heroes';
import { HEROES_BY_ID } from './heroes';
import { SKILLS_BY_ID, clampSkillLevel, normalizeMods } from './skills';
import type { HeroPreset, PresetSelection, PresetStore, SavedUnit, UnitSnapshot } from './presets';
import { EMPTY_SELECTION, UNIT_SNAPSHOT_KEYS, newId } from './presets';
import { UNITS_BY_ID } from './units';

/** Условия атаки, задаваемые в форме; остальное выводится из режима */
export type AttackParams = Omit<AttackAbilities, 'rangePenalty' | 'modeMultiplier' | 'doubleStrike'>;

/** Всё состояние калькулятора, попадающее в ссылку */
export interface AppUrlState {
  attacker: AttackerStats;
  defender: DefenderStats;
  attack: AttackParams;
  modeId: string;
  attackerUnitId: string | null;
  defenderUnitId: string | null;
  attackerHero: HeroPick;
  defenderHero: HeroPick;
  presets: PresetStore;
  presetSelection: PresetSelection;
}

/** Имя query-параметра с закодированным состоянием */
export const SHARE_PARAM = 's';

/** Порядок статов отряда в массивах wire-формата */
const STAT_KEYS = [
  'count',
  'health',
  'topHealth',
  'damageMin',
  'damageMax',
  'attack',
  'defense',
  'heroAttack',
  'heroDefense',
] as const;

/** Отряд пресета: имя, id юнита (нет — ручной ввод), статы */
interface WireUnit {
  n: string;
  u?: string;
  /** Статы отряда в порядке UNIT_SNAPSHOT_KEYS */
  s: number[];
}

/** Навык героя в ссылке: [id, уровень] или [id, уровень, поднавыки] */
type WireSkillPick = [string, number] | [string, number, string[]];

/**
 * Игровой герой в ссылке. Старые ссылки — [id, уровень]; новые всегда
 * пишутся как [id, уровень, навыки, сила магии, знание] (список навыков
 * пишется и пустым: пустота отличает «все навыки удалены» от старой
 * ссылки, где сеются стартовые навыки героя).
 */
type WireHeroPick = [string, number] | [string, number, WireSkillPick[], number, number];

/** Пресет героя: имя, [атака, защита] героя, игровой герой, отряды */
interface WireHero {
  n: string;
  h: [number, number];
  /** Выбранный игровой герой; нет — пресет без героя */
  g?: WireHeroPick;
  u: WireUnit[];
}

/**
 * Wire-формат. Версия 1 не содержала пресетов; версия 2 добавила поля
 * pa/pd/ps, затем — необязательные ah/dh и g в пресетах (старые ссылки
 * декодируются без них), затем кортеж героя удлинился навыками и силой
 * магии со знанием: короткий кортеж из двух элементов — старая ссылка,
 * для неё сеются стартовые навыки героя и его сила магии и знание.
 * Остальные поля совпадают, поэтому декодер принимает обе версии, а
 * кодер всегда пишет вторую. При изменении смысла существующих полей
 * заводится версия 3.
 */
interface ShareV2 {
  v: 1 | 2;
  /** Статы атакующего в порядке STAT_KEYS */
  a: number[];
  /** Статы защитника в порядке STAT_KEYS */
  d: number[];
  /** distance, generalModifiers, typeModifiers, retaliation (0/1) */
  x: [number, number, number, 0 | 1];
  /** id режима атаки */
  m: string;
  /** id юнита атакующего; нет — ручной ввод */
  au?: string;
  /** id юнита защитника; нет — ручной ввод */
  du?: string;
  /** Игровой герой атакующего; нет — не выбран */
  ah?: WireHeroPick;
  /** Игровой герой защитника; нет — не выбран */
  dh?: WireHeroPick;
  /** Пресеты героев атакующего; нет — пусто */
  pa?: WireHero[];
  /** Пресеты героев защитника; нет — пусто */
  pd?: WireHero[];
  /** Выбор пресетов: [герой атк, отряд атк, герой защ, отряд защ]; -1 — нет */
  ps?: [number, number, number, number];
}

/** JSON → base64url: алфавит A-Za-z0-9-_ без набивки, юникод-безопасно */
const toBase64Url = (json: string): string => {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** base64url → JSON; на битой строке бросает исключение */
const fromBase64Url = (encoded: string): string => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Массив статов отряда: ровно 9 конечных чисел */
const isStatsArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === STAT_KEYS.length &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Массив wire-формата → объект статов отряда */
const toStats = (values: number[]): AttackerStats => {
  const stats = {} as AttackerStats;
  STAT_KEYS.forEach((key, index) => {
    stats[key] = values[index];
  });
  return stats;
};

/** id юнита из ссылки: неизвестный или нестроковый — ручной ввод */
const toUnitId = (id: unknown): string | null =>
  typeof id === 'string' && UNITS_BY_ID.has(id) ? id : null;

const toWireUnit = (unit: SavedUnit): WireUnit => {
  const wire: WireUnit = {
    n: unit.name,
    s: UNIT_SNAPSHOT_KEYS.map((key) => unit.stats[key]),
  };
  if (unit.unitId) wire.u = unit.unitId;
  return wire;
};

const toWireSkillPick = (pick: SkillPick): WireSkillPick =>
  pick.mods.length > 0 ? [pick.id, pick.level, pick.mods] : [pick.id, pick.level];

const toWireHeroPick = (pick: HeroPick): WireHeroPick | null =>
  pick.heroId === null
    ? null
    : [pick.heroId, pick.level, pick.skills.map(toWireSkillPick), pick.spellPower, pick.knowledge];

/** Навыки героя из ссылки: невалидные элементы отбрасываются поштучно */
const toSkillPicks = (value: unknown): SkillPick[] => {
  if (!Array.isArray(value)) return [];
  const picks: SkillPick[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const [id, level, mods] = item as unknown[];
    if (typeof id !== 'string') continue;
    const skill = SKILLS_BY_ID.get(id);
    if (!skill || picks.some((pick) => pick.id === id)) continue;
    const lvl = clampSkillLevel(typeof level === 'number' && Number.isFinite(level) ? level : 1);
    picks.push({ id, level: lvl, mods: normalizeMods(skill, lvl, mods) });
  }
  return picks;
};

/** Конечное неотрицательное число из ссылки; иначе — запасное значение */
const toStat = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/**
 * Игровой герой из ссылки. Неизвестный или нестроковый id даёт пустой
 * выбор (числовые статы формы при этом сохраняются); уровень зажимается
 * в допустимый диапазон. Кортеж из двух элементов — старая ссылка без
 * навыков: сеются стартовые навыки героя и его сила магии и знание,
 * чтобы расчёт совпадал с прежним поведением.
 */
const toHeroPick = (value: unknown): HeroPick => {
  if (!Array.isArray(value) || value.length < 2) return EMPTY_HERO_PICK;
  const [id, level, skills, spellPower, knowledge] = value as unknown[];
  if (typeof id !== 'string') return EMPTY_HERO_PICK;
  const hero: GameHero | undefined = HEROES_BY_ID.get(id);
  if (!hero) return EMPTY_HERO_PICK;
  const seeded = value.length === 2 || !Array.isArray(skills);
  return {
    heroId: id,
    level: clampLevel(typeof level === 'number' && Number.isFinite(level) ? level : 1),
    skills: seeded ? defaultSkillPicks(hero) : toSkillPicks(skills),
    spellPower: toStat(spellPower, hero.stats.spellPower),
    knowledge: toStat(knowledge, hero.stats.knowledge),
  };
};

const toWireHero = (hero: HeroPreset): WireHero => {
  const wire: WireHero = {
    n: hero.name,
    h: [hero.heroAttack, hero.heroDefense],
    u: hero.units.map(toWireUnit),
  };
  const pick = toWireHeroPick(hero.hero);
  if (pick) wire.g = pick;
  return wire;
};

/**
 * Выбор пресетов в индексы wire-формата. Runtime-id в ссылку не пишутся,
 * поэтому выбор адресуется позициями в списках; ничего не выбрано — null
 * (поле ps опускается).
 */
const toWireSelection = (
  store: PresetStore,
  selection: PresetSelection,
): [number, number, number, number] | null => {
  const heroIndex = (list: HeroPreset[], id: string | null): number =>
    id === null ? -1 : list.findIndex((hero) => hero.id === id);
  const unitIndex = (list: HeroPreset[], heroIdx: number, id: string | null): number =>
    heroIdx < 0 || id === null ? -1 : list[heroIdx].units.findIndex((unit) => unit.id === id);
  const attackerHero = heroIndex(store.attacker, selection.attackerHeroId);
  const defenderHero = heroIndex(store.defender, selection.defenderHeroId);
  const wire: [number, number, number, number] = [
    attackerHero,
    unitIndex(store.attacker, attackerHero, selection.attackerSavedUnitId),
    defenderHero,
    unitIndex(store.defender, defenderHero, selection.defenderSavedUnitId),
  ];
  return wire.some((index) => index >= 0) ? wire : null;
};

/** Статы отряда пресета: ровно 7 конечных чисел */
const isSnapshotArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === UNIT_SNAPSHOT_KEYS.length &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** WireUnit → SavedUnit; структурно неверный отряд отбрасывается */
const toSavedUnit = (value: unknown): SavedUnit | null => {
  if (typeof value !== 'object' || value === null) return null;
  const wire = value as Partial<WireUnit>;
  const values = wire.s;
  if (typeof wire.n !== 'string' || !isSnapshotArray(values)) return null;
  const stats = {} as UnitSnapshot;
  UNIT_SNAPSHOT_KEYS.forEach((key, index) => {
    stats[key] = values[index];
  });
  return { id: newId(), name: wire.n, unitId: toUnitId(wire.u), stats };
};

/** WireHero → HeroPreset; структурно неверный пресет отбрасывается */
const toHeroPreset = (value: unknown): HeroPreset | null => {
  if (typeof value !== 'object' || value === null) return null;
  const wire = value as Partial<WireHero>;
  const hero = wire.h;
  if (
    typeof wire.n !== 'string' ||
    !Array.isArray(hero) ||
    hero.length !== 2 ||
    !hero.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    !Array.isArray(wire.u)
  ) {
    return null;
  }
  return {
    id: newId(),
    name: wire.n,
    heroAttack: hero[0],
    heroDefense: hero[1],
    hero: toHeroPick(wire.g),
    units: wire.u.map(toSavedUnit).filter((unit): unit is SavedUnit => unit !== null),
  };
};

/** Список пресетов стороны; не-массив даёт пустой список */
const toHeroList = (value: unknown): HeroPreset[] =>
  Array.isArray(value)
    ? value.map(toHeroPreset).filter((preset): preset is HeroPreset => preset !== null)
    : [];

/** Индексы ps → runtime-id декодированных пресетов; вне диапазона — null */
const toSelection = (value: unknown, store: PresetStore): PresetSelection => {
  const indexes: unknown[] = Array.isArray(value) && value.length === 4 ? value : [];
  const hero = (list: HeroPreset[], index: unknown): HeroPreset | undefined =>
    typeof index === 'number' ? list[index] : undefined;
  const unit = (owner: HeroPreset | undefined, index: unknown): SavedUnit | undefined =>
    owner && typeof index === 'number' ? owner.units[index] : undefined;
  const attackerHero = hero(store.attacker, indexes[0]);
  const defenderHero = hero(store.defender, indexes[2]);
  return {
    attackerHeroId: attackerHero?.id ?? null,
    attackerSavedUnitId: unit(attackerHero, indexes[1])?.id ?? null,
    defenderHeroId: defenderHero?.id ?? null,
    defenderSavedUnitId: unit(defenderHero, indexes[3])?.id ?? null,
  };
};

/**
 * Упаковывает состояние калькулятора в base64url-строку для параметра
 * `s`. Результат содержит только символы `A-Za-z0-9-_` и вставляется в
 * query без экранирования.
 */
export function encodeAppState(state: AppUrlState): string {
  const payload: ShareV2 = {
    v: 2,
    a: STAT_KEYS.map((key) => state.attacker[key]),
    d: STAT_KEYS.map((key) => state.defender[key]),
    x: [
      state.attack.distance,
      state.attack.generalModifiers,
      state.attack.typeModifiers,
      state.attack.retaliation ? 1 : 0,
    ],
    m: state.modeId,
  };
  if (state.attackerUnitId) payload.au = state.attackerUnitId;
  if (state.defenderUnitId) payload.du = state.defenderUnitId;
  const attackerHero = toWireHeroPick(state.attackerHero);
  if (attackerHero) payload.ah = attackerHero;
  const defenderHero = toWireHeroPick(state.defenderHero);
  if (defenderHero) payload.dh = defenderHero;
  if (state.presets.attacker.length > 0) payload.pa = state.presets.attacker.map(toWireHero);
  if (state.presets.defender.length > 0) payload.pd = state.presets.defender.map(toWireHero);
  const selection = toWireSelection(state.presets, state.presetSelection);
  if (selection) payload.ps = selection;
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Разбирает строку параметра `s` обратно в состояние калькулятора.
 *
 * Повреждённая или структурно неверная строка даёт null. Частично
 * устаревшая ссылка деградирует мягко: пропавший из базы юнит заменяется
 * ручным вводом с сохранением числовых статов, недопустимый для юнита
 * режим — первым из его списка, невалидный пресет или отряд внутри него
 * отбрасывается поштучно, выбор с индексами вне диапазона сбрасывается.
 *
 * @param raw значение query-параметра или null, если его нет.
 * @returns восстановленное состояние либо null.
 */
export function decodeAppState(raw: string | null | undefined): AppUrlState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const share = parsed as Partial<ShareV2>;
    if (share.v !== 1 && share.v !== 2) return null;
    if (!isStatsArray(share.a) || !isStatsArray(share.d)) return null;
    if (typeof share.m !== 'string') return null;
    const x: unknown = share.x;
    if (
      !Array.isArray(x) ||
      x.length !== 4 ||
      !x.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      return null;
    }

    const attackerUnitId = toUnitId(share.au);
    const defenderUnitId = toUnitId(share.du);
    const attackerUnit = attackerUnitId ? (UNITS_BY_ID.get(attackerUnitId) ?? null) : null;
    const attackerHero = toHeroPick(share.ah);
    const modes = attackModesFor(attackerUnit);
    const requestedMode = share.m;
    // «Удар героя» — допустимый режим, только если герой атакующего
    // восстановился из ссылки.
    const validMode =
      modes.some((mode) => mode.id === requestedMode) ||
      (requestedMode === HERO_STRIKE_MODE_ID && attackerHero.heroId !== null);
    // В v1 полей пресетов нет: обе стороны декодируются в пустые списки.
    const presets: PresetStore = {
      attacker: toHeroList(share.pa),
      defender: toHeroList(share.pd),
    };

    return {
      attacker: toStats(share.a),
      defender: toStats(share.d),
      attack: {
        distance: x[0] as number,
        generalModifiers: x[1] as number,
        typeModifiers: x[2] as number,
        retaliation: x[3] === 1,
      },
      modeId: validMode ? requestedMode : modes[0].id,
      attackerUnitId,
      defenderUnitId,
      attackerHero,
      defenderHero: toHeroPick(share.dh),
      presets,
      presetSelection: share.ps === undefined ? EMPTY_SELECTION : toSelection(share.ps, presets),
    };
  } catch {
    return null;
  }
}
