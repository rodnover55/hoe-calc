/**
 * Курируемая карта эффектов героев, влияющих на расчёт урона.
 *
 * Специализации героев из heroes.ts и выбранные навыки каталога
 * skills.ts переводятся в бонусы калькулятора: прибавки к атаке/защите
 * (и штрафы существам противника), процентные бонусы и снижения урона,
 * плоские прибавки к урону и здоровью, а также урон удара героя.
 * Навыки учитываются только по списку HeroPick.skills; стартовые навыки
 * героя сеются в него при выборе героя (defaultSkillPicks). Числа
 * берутся из русских описаний: русский текст здесь — формат данных, а
 * не UI. Специализации, навыки и поднавыки, не перечисленные в картах
 * ниже, на расчёт не влияют и только отображаются в карточке героя.
 *
 * Урон удара героя (из игровых файлов v0.80.31):
 * 30 × (1 + 0.2 × (уровень − 1)); атака героя и защита цели не участвуют.
 * «Ратное дело» и поднавыки с плоской прибавкой к удару героя
 * учитываются, артефакты — нет; специализации на удар героя учитываются.
 */

import type { AttackMode, Reach } from './abilityEffects';
import type { DamageStep } from './formula';
import { num, tokens } from './formula';
import type { GameHero } from './heroes';
import { heroTextName } from './heroes';
import type { Lang } from './i18n';
import { translate } from './i18n';
import type { SkillLevel, Subskill } from './skills';
import { SKILLS_BY_ID, levelOfSlug, subskillsFor } from './skills';
import type { UnitPreset } from './units';

/** Уровень героя в игре ограничен; ограничение поля уровня в форме */
export const MAX_HERO_LEVEL = 30;

/** Выбранный навык героя: навык каталога, уровень мастерства, поднавыки */
export interface SkillPick {
  /** id навыка из skills.ts */
  id: string;
  level: SkillLevel;
  /** Выбранные поднавыки: id из каталога, tier ≤ level, порядок каталога */
  mods: string[];
}

/** Выбор игрового героя стороной: герой, уровень и его навыки */
export interface HeroPick {
  /** id героя из heroes.ts; null — герой не выбран */
  heroId: string | null;
  level: number;
  /** Навыки героя; расчёт учитывает только их, а не hero.skills */
  skills: SkillPick[];
  /** Сила магии героя — для «Боевой магии»; сеется из статов героя */
  spellPower: number;
  /** Знание героя — для «Боевой магии»; сеется из статов героя */
  knowledge: number;
}

export const clampLevel = (level: number): number =>
  Math.min(MAX_HERO_LEVEL, Math.max(1, Math.floor(level)));

/**
 * Стартовые навыки героя как значение для HeroPick.skills: слаг уровня
 * («basic_offence») превращается в навык каталога и уровень мастерства.
 * Слаги, неизвестные каталогу, и повторы навыка отбрасываются.
 */
export function defaultSkillPicks(hero: GameHero | null): SkillPick[] {
  const picks: SkillPick[] = [];
  for (const skill of hero?.skills ?? []) {
    const parsed = levelOfSlug(skill.id);
    if (!parsed || picks.some((pick) => pick.id === parsed.skill.id)) continue;
    picks.push({ id: parsed.skill.id, level: parsed.level, mods: [] });
  }
  return picks;
}

const HERO_STRIKE_BASE = 30;
const HERO_STRIKE_PER_LEVEL = 0.2;

/** Классификация специализаций; числа разбираются из русского описания */
type SpecKind =
  /** Специализация по существу: бонус своим, такой же штраф вражеским */
  | { kind: 'creature'; units: string[] }
  /** «Стрелок»/«Боец»: +% урона обычными атаками, растёт с уровнем */
  | { kind: 'damage_percent' }
  /** «Защита»: −% входящего урона от обычных атак */
  | { kind: 'incoming_percent' }
  /** «Истинный лорд»: +% от атаки и защиты героя существам */
  | { kind: 'ascension' }
  /** Бонус к урону удара героя */
  | { kind: 'hero_strike' };

const SPEC_KINDS: Record<string, SpecKind> = {
  minotaurs: { kind: 'creature', units: ['minotaur'] },
  medusae: { kind: 'creature', units: ['medusa'] },
  troglodytes: { kind: 'creature', units: ['troglodyte'] },
  onyx_dancers: { kind: 'creature', units: ['onyx_dancer'] },
  infiltrators: { kind: 'creature', units: ['infiltrator'] },
  hydras: { kind: 'creature', units: ['hydra'] },
  swordsmen: { kind: 'creature', units: ['swordsman'] },
  cavalry: { kind: 'creature', units: ['cavalry'] },
  crossbowmen: { kind: 'creature', units: ['crossbowman'] },
  lightweavers: { kind: 'creature', units: ['light_weaver'] },
  wight: { kind: 'creature', units: ['wight'] },
  liches: { kind: 'creature', units: ['lich'] },
  grave_robbers: { kind: 'creature', units: ['graverobber'] },
  dread_knights: { kind: 'creature', units: ['dread_knight'] },
  undead_pets: { kind: 'creature', units: ['undead_pet'] },
  skeletons: { kind: 'creature', units: ['skeleton'] },
  concubi: { kind: 'creature', units: ['concubus'] },
  cultists: { kind: 'creature', units: ['cultist'] },
  ra_shothes: { kind: 'creature', units: ['rashoth'] },
  aga_shoth_riders: { kind: 'creature', units: ['agashoth_rider'] },
  grand_shothes: { kind: 'creature', units: ['grand_shoth'] },
  son_of_all_mothers: { kind: 'creature', units: ['hive_queen'] },
  stinging: { kind: 'creature', units: ['hornet'] },
  scavenger: { kind: 'creature', units: ['locust'] },
  reave_away: { kind: 'creature', units: ['reaver'] },
  waurmification: { kind: 'creature', units: ['waurms'] },
  oldest_known_tree: { kind: 'creature', units: ['herbomancer'] },
  faunsong: { kind: 'creature', units: ['faun'] },
  shooter: { kind: 'damage_percent' },
  offence: { kind: 'damage_percent' },
  defence: { kind: 'incoming_percent' },
  ascension: { kind: 'ascension' },
  heroic_strike: { kind: 'hero_strike' },
  intimidating_strike: { kind: 'hero_strike' },
};

/** Классификация влияющих на урон навыков каталога */
type SkillKind =
  | 'damage_percent'
  | 'incoming_percent'
  | 'magic_reduction'
  /** «Боевая магия»: атака/защита существ от силы магии и знаний героя */
  | 'battle_magic'
  /** «Ратное дело»: плоская прибавка к урону удара героя */
  | 'hero_strike';

const SKILL_KINDS: Record<string, SkillKind> = {
  offence: 'damage_percent',
  defence: 'incoming_percent',
  resistance: 'magic_reduction',
  battle_magic: 'battle_magic',
  combat: 'hero_strike',
};

/** Классификация влияющих на урон поднавыков; слаги уникальны в каталоге */
type SubskillKind =
  /** «Стрельба»: +% урона своим по типу удара */
  | 'reach_damage'
  /** «Укрытие»: −% входящего урона по типу удара */
  | 'reach_incoming'
  /** «Мастерство ближнего/дальнего боя»: +% своим и −% входящего по типу */
  | 'reach_mastery'
  /** «Теневые клинки»: +N урона каждому своему существу */
  | 'own_damage'
  /** «Щиты и панцири»: −N урона существам противника */
  | 'enemy_damage'
  /** «Неостановимая сила»: −% к атаке существ противника */
  | 'enemy_attack_percent'
  /** «Непоколебимость»: −% к защите существ противника */
  | 'enemy_defense_percent'
  /** «Час волка»: −% к атаке и защите существ противника */
  | 'enemy_stats_percent'
  /** «Договор с волшебниками»: −% магического урона способностей */
  | 'magic_reduction'
  /** «Хроническая слабость»: −N к здоровью существ противника */
  | 'enemy_health'
  /** «Владение мечом», «Бесконечная харизма»: +N к атаке и защите */
  | 'own_stats'
  /** «Авторитет боевого мага»: атака существ +% от силы магии героя */
  | 'spell_attack'
  /** «Авторитет мага-защитника»: защита существ +% от знаний героя */
  | 'knowledge_defense'
  /** «Элитные стражи»: +% от атаки и защиты героя младшим рангам */
  | 'hero_stats_tiers'
  /** «Бродячая армия»: +% от атаки и защиты героя нейтралам */
  | 'hero_stats_neutral'
  /** «Усиленные тренировки»: +N к здоровью своих существ */
  | 'own_health'
  /** «Практичные заклинания»: +N к урону удара героя */
  | 'strike_flat';

const SUBSKILL_KINDS: Record<string, SubskillKind> = {
  archery: 'reach_damage',
  cover: 'reach_incoming',
  melee_mastery: 'reach_mastery',
  ranged_mastery: 'reach_mastery',
  shadow_blades: 'own_damage',
  shields_and_shells: 'enemy_damage',
  unstoppable_force: 'enemy_attack_percent',
  firmness: 'enemy_defense_percent',
  hour_of_the_wolf: 'enemy_stats_percent',
  wizard_contract: 'magic_reduction',
  chronic_weakness: 'enemy_health',
  swordcraft: 'own_stats',
  endless_charisma: 'own_stats',
  battle_mage_s_authority: 'spell_attack',
  mage_protector_s_authority: 'knowledge_defense',
  elite_guards: 'hero_stats_tiers',
  vagrant_army: 'hero_stats_neutral',
  strenuous_training: 'own_health',
  practical_incantations: 'strike_flat',
};

/**
 * «Бонус удваивается, если герой владеет «X»»: название навыка в
 * творительном падеже → слаг каталога. Перечислены только названия из
 * описаний учитываемых поднавыков.
 */
const DOUBLING_SKILLS: Record<string, string> = {
  Дипломатией: 'diplomacy',
  Сопротивлением: 'resistance',
  Волшебством: 'sorcery',
  Тактикой: 'tactics',
};

/** Прибавка «за каждые N уровней»: округление вниз */
const perLevels = (level: number, levels: number, amount: number): number =>
  levels > 0 ? Math.floor(level / levels) * amount : 0;

/** «в дальнем бою и на расстоянии» и синонимы → типы удара режима */
const REACH_SETS: Record<string, Reach[]> = {
  'дальнем бою и на расстоянии': ['ranged', 'long'],
  'дальних и дальнобойных атак': ['ranged', 'long'],
  'ближнем бою': ['melee'],
  'атак в ближнем бою': ['melee'],
};

const DASH = '[-–−]';

/**
 * «Стрелок»/«Боец»: базовый процент, прибавка за уровни и типовой бонус
 * по типу удара. null — описание не распознано.
 */
const parseDamagePercent = (d: string) => {
  const base = /\+(\d+)% урона обычными атаками/.exec(d);
  if (!base) return null;
  const inc = /обычными атаками,? (?:и ещё \+|плюс )(\d+)% за (?:уровни героя: каждые (\d+)|каждые (\d+) уровн)/.exec(d);
  const extra = /наносят \+(\d+)% урона в (дальнем бою и на расстоянии|ближнем бою) за (?:уровни героя: каждые (\d+)|каждые (\d+) уровн)/.exec(d);
  return {
    base: Number(base[1]),
    inc: inc ? { percent: Number(inc[1]), levels: Number(inc[2] ?? inc[3]) } : null,
    extra: extra
      ? {
          percent: Number(extra[1]),
          reach: REACH_SETS[extra[2]],
          levels: Number(extra[3] ?? extra[4]),
        }
      : null,
  };
};

/** «Защита»: снижение входящего урона; проценты возвращаются положительными */
const parseIncomingPercent = (d: string) => {
  const base = new RegExp(`${DASH}(\\d+)% урона от обычных атак`).exec(d);
  if (!base) return null;
  const inc = new RegExp(`${DASH}(\\d+)% (?:дополнительно|меньше) за каждые (\\d+) уровн`).exec(d);
  const extra = new RegExp(
    `за каждые (\\d+) уровн\\S* существа в армии получают ${DASH}(\\d+)% урона от (дальних и дальнобойных атак|атак в ближнем бою)`,
  ).exec(d);
  return {
    base: Number(base[1]),
    inc: inc ? { percent: Number(inc[1]), levels: Number(inc[2]) } : null,
    extra: extra
      ? {
          percent: Number(extra[2]),
          reach: REACH_SETS[extra[3]],
          levels: Number(extra[1]),
        }
      : null,
  };
};

/** Специализация по существу: «+1 к атаке и защите за каждые 3 уровня» */
const parseCreature = (d: string) => {
  const m =
    /атака и защита увеличиваются на (\d+) за каждые (\d+) уровн/.exec(d) ??
    /\+(\d+) к атаке и защите за уровни героя: каждые (\d+)/.exec(d);
  if (!m) return null;
  return {
    amount: Number(m[1]),
    levels: Number(m[2]),
    enemyLoss: /теряют (?:столько же|такое же)/.test(d),
  };
};

/** «Истинный лорд»: +% от атаки и защиты героя, растёт с уровнем */
const parseAscension = (d: string) =>
  ((m) => (m ? { base: Number(m[1]), inc: Number(m[2]), levels: Number(m[3]) } : null))(
    /на (\d+)% от своей атаки и защиты, плюс (\d+)% за каждые (\d+) уровн/.exec(d),
  );

/** Бонус специализации к удару героя: «+40 урона, плюс 5 за каждые 3» */
const parseHeroStrike = (d: string) =>
  ((m) => (m ? { base: Number(m[1]), amount: Number(m[2]), levels: Number(m[3] ?? m[4]) } : null))(
    /наносит \+(\d+)(?: базового)? урона(?:, плюс |(?: и ещё)? \+)(\d+) за (?:каждые (\d+) уровн|уровни героя: каждые (\d+))/.exec(d),
  );

/**
 * Прибавка к урону удара героя: «Удар героя наносит +10 …». У базового
 * «Ратного дела» на сайте нет русского текста, поэтому английский
 * вариант описания тоже распознаётся.
 */
const parseStrikeBonus = (d: string): number | null => {
  const m = /Удар героя наносит \+(\d+)/.exec(d) ?? /Heroic Strike deals \+(\d+)/.exec(d);
  return m ? Number(m[1]) : null;
};

/** Процент навыка: «+10% урона обычными атаками», «–10% …», «–15% магического» */
const parseSkillPercent = (kind: SkillKind, d: string): number | null => {
  const m =
    kind === 'damage_percent'
      ? /\+(\d+)% урона обычными атаками/.exec(d)
      : kind === 'incoming_percent'
        ? new RegExp(`${DASH}(\\d+)% урона от обычных атак`).exec(d)
        : new RegExp(`${DASH}(\\d+)% магического урона`).exec(d);
  return m ? Number(m[1]) : null;
};

/** Строка заметки об эффекте героя в карточке героя */
export interface HeroBonusNote {
  /** Название источника: специализации или навыка */
  source: string;
  /** Пояснение: что именно учтено; для неучтённых — пусто */
  text: string;
  /** Учтён ли эффект в текущем расчёте автоматически */
  applied: boolean;
}

/** Бонусы героя стороны к текущему расчёту; все слагаемые аддитивны */
export interface HeroBonuses {
  /** Прибавка к атаке героя (бонус своему отряду) */
  attack: number;
  /** Прибавка к защите героя */
  defense: number;
  /** Слагаемое типовых модификаторов, % */
  typeModifiers: number;
  /** Прибавка к урону каждого своего существа */
  damage: number;
  /** Прибавка к здоровью своих существ */
  health: number;
  /** Штраф атаке юнита противника (отрицательный) */
  enemyAttack: number;
  /** Штраф защите юнита противника (отрицательный) */
  enemyDefense: number;
  /** Штраф урону существ противника (отрицательный) */
  enemyDamage: number;
  /** Штраф здоровью существ противника (отрицательный) */
  enemyHealth: number;
  /** Снижение входящего магического урона способностей, % (отрицательное) */
  magicReduction: number;
  notes: HeroBonusNote[];
}

export const EMPTY_BONUSES: HeroBonuses = {
  attack: 0,
  defense: 0,
  typeModifiers: 0,
  damage: 0,
  health: 0,
  enemyAttack: 0,
  enemyDefense: 0,
  enemyDamage: 0,
  enemyHealth: 0,
  magicReduction: 0,
  notes: [],
};

/** Вход heroBonuses: герой стороны и контекст текущего расчёта */
export interface HeroBonusInput {
  hero: GameHero | null;
  level: number;
  /** Навыки героя (HeroPick.skills) */
  skills: SkillPick[];
  /** Сила магии героя из формы — для «Боевой магии» */
  spellPower: number;
  /** Знание героя из формы — для «Боевой магии» */
  knowledge: number;
  /** Юнит своей стороны — для специализаций по существу */
  unit: UnitPreset | null;
  /** Юнит противника — для штрафа вражеским существам того же типа */
  enemyUnit: UnitPreset | null;
  /** Атака героя из формы — для «Истинного лорда» */
  heroAttack: number;
  /** Защита героя из формы */
  heroDefense: number;
  /** Атака юнита противника из формы — база процентных штрафов */
  enemyUnitAttack: number;
  /** Защита юнита противника из формы — база процентных штрафов */
  enemyUnitDefense: number;
  /** Режим атаки текущего расчёта */
  mode: AttackMode;
  /** Чья сторона: процентные бонусы действуют только на основной удар */
  side: 'attacker' | 'defender';
}

const matchesUnit = (unit: UnitPreset | null, slugs: string[]): boolean =>
  unit !== null && slugs.some((slug) => unit.id === slug || unit.upgradeOf === slug);

/**
 * Бонусы героя стороны к текущему расчёту.
 *
 * Специализации по существам и статовые эффекты навыков действуют
 * всегда; процентные эффекты действуют только на обычные атаки (не на
 * способности с собственным уроном) и только на «свой» удар:
 * «Нападение» защитника не усиливает ответ, потому что формула не
 * учитывает модификаторы в ответе. Навыки учитываются по input.skills;
 * заметку получает специализация (всегда) и каждый выбранный навык:
 * без вкладов в текущий расчёт — справочную.
 *
 * @param input герой, уровень, навыки, юниты обеих сторон, статы из
 *   формы, режим атаки и сторона.
 * @param lang язык текстов заметок.
 * @returns аддитивные слагаемые к статам и модификаторам с заметками.
 */
export function heroBonuses(input: HeroBonusInput, lang: Lang = 'ru'): HeroBonuses {
  const { hero, unit, enemyUnit, mode, side } = input;
  if (!hero) return EMPTY_BONUSES;
  const level = clampLevel(input.level);
  const L = (key: string, params?: Record<string, string | number>): string =>
    translate(lang, `heroBonus.${key}`, params);

  const result: HeroBonuses = { ...EMPTY_BONUSES, notes: [] };
  const regular = !mode.special;

  const spec = hero.specialization;
  const specKind = SPEC_KINDS[spec.id];
  const specSource = L('specSource', { name: heroTextName(spec, lang) });
  const specTexts: string[] = [];

  if (specKind?.kind === 'creature') {
    const parsed = parseCreature(spec.description);
    if (parsed) {
      const amount = perLevels(level, parsed.levels, parsed.amount);
      if (amount > 0 && matchesUnit(unit, specKind.units)) {
        result.attack += amount;
        result.defense += amount;
        specTexts.push(L('ownCreature', { n: amount }));
      }
      if (amount > 0 && parsed.enemyLoss && matchesUnit(enemyUnit, specKind.units)) {
        result.enemyAttack -= amount;
        result.enemyDefense -= amount;
        specTexts.push(L('enemyCreature', { n: amount }));
      }
    }
  } else if (specKind?.kind === 'damage_percent' && side === 'attacker' && regular) {
    const parsed = parseDamagePercent(spec.description);
    if (parsed) {
      let percent = parsed.base;
      if (parsed.inc) percent += perLevels(level, parsed.inc.levels, parsed.inc.percent);
      if (parsed.extra && parsed.extra.reach?.includes(mode.reach)) {
        percent += perLevels(level, parsed.extra.levels, parsed.extra.percent);
      }
      if (percent > 0) {
        result.typeModifiers += percent;
        specTexts.push(L('typePercent', { n: `+${percent}` }));
      }
    }
  } else if (specKind?.kind === 'incoming_percent' && side === 'defender' && regular) {
    const parsed = parseIncomingPercent(spec.description);
    if (parsed) {
      let percent = parsed.base;
      if (parsed.inc) percent += perLevels(level, parsed.inc.levels, parsed.inc.percent);
      if (parsed.extra && parsed.extra.reach?.includes(mode.reach)) {
        percent += perLevels(level, parsed.extra.levels, parsed.extra.percent);
      }
      if (percent > 0) {
        result.typeModifiers -= percent;
        specTexts.push(L('typePercent', { n: `−${percent}` }));
      }
    }
  } else if (specKind?.kind === 'ascension') {
    const parsed = parseAscension(spec.description);
    if (parsed) {
      const percent = parsed.base + perLevels(level, parsed.levels, parsed.inc);
      const attack = Math.floor((Math.max(0, input.heroAttack) * percent) / 100);
      const defense = Math.floor((Math.max(0, input.heroDefense) * percent) / 100);
      if (attack > 0 || defense > 0) {
        result.attack += attack;
        result.defense += defense;
        specTexts.push(L('ownStats', { a: attack, d: defense }));
      }
    }
  } else if (specKind?.kind === 'hero_strike' && side === 'attacker') {
    const bonus = heroStrikeSpecBonus(hero, level);
    if (bonus > 0) specTexts.push(L('heroStrike', { n: bonus }));
  }

  result.notes.push(
    specTexts.length > 0
      ? { source: specSource, text: specTexts.join(', '), applied: true }
      : { source: specSource, text: '', applied: false },
  );

  const hasSkill = (id: string): boolean => input.skills.some((pick) => pick.id === id);

  /** Множитель «удваивается, если герой владеет «X»» по описанию */
  const doublingFactor = (d: string): number => {
    const m = /(?:Бонус|Эффект) удваивается, если герой владеет «([^»]+)»/.exec(d);
    const slug = m ? DOUBLING_SKILLS[m[1]] : undefined;
    return slug !== undefined && hasSkill(slug) ? 2 : 1;
  };

  /** Типы удара из описания поднавыка; null — тип не распознан */
  const reachOf = (d: string): Reach[] | null =>
    /ближнем бою/.test(d)
      ? ['melee']
      : /выстрел|на расстоянии/.test(d)
        ? ['ranged', 'long']
        : null;

  /** Прибавки от процента атаки и защиты героя из формы */
  const heroStatsShare = (percent: number): { attack: number; defense: number } => ({
    attack: Math.floor((Math.max(0, input.heroAttack) * percent) / 100),
    defense: Math.floor((Math.max(0, input.heroDefense) * percent) / 100),
  });

  /** Применяет поднавык к бакетам; текст вклада или null, если не влияет */
  const applyMod = (sub: Subskill): string | null => {
    const kind = SUBSKILL_KINDS[sub.id];
    if (!kind) return null;
    const d = sub.description;
    const factor = doublingFactor(d);
    switch (kind) {
      case 'reach_damage': {
        if (side !== 'attacker' || !regular) return null;
        const m = /наносят \+(\d+)% урона/.exec(d);
        if (!m || !reachOf(d)?.includes(mode.reach)) return null;
        const percent = Number(m[1]) * factor;
        result.typeModifiers += percent;
        return L('typePercent', { n: `+${percent}` });
      }
      case 'reach_incoming': {
        if (side !== 'defender' || !regular) return null;
        const m = new RegExp(`${DASH}(\\d+)% урона от`).exec(d);
        if (!m || !reachOf(d)?.includes(mode.reach)) return null;
        const percent = Number(m[1]) * factor;
        result.typeModifiers -= percent;
        return L('typePercent', { n: `−${percent}` });
      }
      case 'reach_mastery': {
        if (!regular) return null;
        const m = new RegExp(`наносят \\+(\\d+)% и получают ${DASH}(\\d+)% урона`).exec(d);
        if (!m || !reachOf(d)?.includes(mode.reach)) return null;
        const percent = Number(m[side === 'attacker' ? 1 : 2]) * factor;
        result.typeModifiers += side === 'attacker' ? percent : -percent;
        return L('typePercent', { n: side === 'attacker' ? `+${percent}` : `−${percent}` });
      }
      case 'own_damage': {
        const m = /наносят \+(\d+) урона/.exec(d);
        if (!m) return null;
        const amount = Number(m[1]) * factor;
        result.damage += amount;
        return L('ownDamage', { n: amount });
      }
      case 'enemy_damage': {
        const m = new RegExp(`наносят ${DASH}(\\d+) урона`).exec(d);
        if (!m) return null;
        const amount = Number(m[1]) * factor;
        result.enemyDamage -= amount;
        return L('enemyDamage', { n: amount });
      }
      case 'enemy_attack_percent': {
        const m = new RegExp(`${DASH}(\\d+)% к атаке существ противника`).exec(d);
        if (!m) return null;
        const amount = Math.floor(
          (Math.max(0, input.enemyUnitAttack) * Number(m[1]) * factor) / 100,
        );
        if (amount <= 0) return null;
        result.enemyAttack -= amount;
        return L('enemyAttack', { n: amount });
      }
      case 'enemy_defense_percent': {
        const m = new RegExp(`${DASH}(\\d+)% к защите существ противника`).exec(d);
        if (!m) return null;
        const amount = Math.floor(
          (Math.max(0, input.enemyUnitDefense) * Number(m[1]) * factor) / 100,
        );
        if (amount <= 0) return null;
        result.enemyDefense -= amount;
        return L('enemyDefense', { n: amount });
      }
      case 'enemy_stats_percent': {
        const m = new RegExp(`${DASH}(\\d+)% к атаке и защите существ противника`).exec(d);
        if (!m) return null;
        const percent = Number(m[1]) * factor;
        const attack = Math.floor((Math.max(0, input.enemyUnitAttack) * percent) / 100);
        const defense = Math.floor((Math.max(0, input.enemyUnitDefense) * percent) / 100);
        if (attack <= 0 && defense <= 0) return null;
        result.enemyAttack -= attack;
        result.enemyDefense -= defense;
        return L('enemyStats', { a: attack, d: defense });
      }
      case 'magic_reduction': {
        if (side !== 'defender' || mode.special?.kind !== 'magic') return null;
        const m = new RegExp(`${DASH}(\\d+)% магического урона`).exec(d);
        if (!m) return null;
        const percent = Number(m[1]) * factor;
        result.magicReduction -= percent;
        return L('magic', { n: `−${percent}` });
      }
      case 'enemy_health': {
        const m = /здоровье существ противника на (\d+)/.exec(d);
        if (!m) return null;
        const amount = Number(m[1]) * factor;
        result.enemyHealth -= amount;
        return L('enemyHealth', { n: amount });
      }
      case 'own_stats': {
        const m = /\+(\d+) к атаке(?: и|,) защите/.exec(d);
        if (!m) return null;
        const amount = Number(m[1]) * factor;
        result.attack += amount;
        result.defense += amount;
        return L('ownCreature', { n: amount });
      }
      case 'spell_attack': {
        const m = /повышается на (\d+)% от силы магии/.exec(d);
        if (!m) return null;
        const amount = Math.floor((Math.max(0, input.spellPower) * Number(m[1]) * factor) / 100);
        if (amount <= 0) return null;
        result.attack += amount;
        return L('attackBonus', { n: amount });
      }
      case 'knowledge_defense': {
        const m = /повышается на (\d+)% от знаний/.exec(d);
        if (!m) return null;
        const amount = Math.floor((Math.max(0, input.knowledge) * Number(m[1]) * factor) / 100);
        if (amount <= 0) return null;
        result.defense += amount;
        return L('defenseBonus', { n: amount });
      }
      case 'hero_stats_tiers': {
        const m = /существа (\d+)[—–−-](\d+)\S* рангов получают \+(\d+)% от атаки и защиты героя/.exec(d);
        if (!m || !unit || unit.tier < Number(m[1]) || unit.tier > Number(m[2])) return null;
        const share = heroStatsShare(Number(m[3]) * factor);
        if (share.attack <= 0 && share.defense <= 0) return null;
        result.attack += share.attack;
        result.defense += share.defense;
        return L('ownStats', { a: share.attack, d: share.defense });
      }
      case 'hero_stats_neutral': {
        const m = /\+(\d+)% от его атаки и защиты/.exec(d);
        if (!m || unit?.faction !== 'neutral') return null;
        const share = heroStatsShare(Number(m[1]) * factor);
        if (share.attack <= 0 && share.defense <= 0) return null;
        result.attack += share.attack;
        result.defense += share.defense;
        return L('ownStats', { a: share.attack, d: share.defense });
      }
      case 'own_health': {
        const m = /получают \+(\d+) к здоровью/.exec(d);
        if (!m) return null;
        const amount = Number(m[1]) * factor;
        result.health += amount;
        return L('ownHealth', { n: amount });
      }
      case 'strike_flat': {
        if (side !== 'attacker') return null;
        const bonus = parseStrikeBonus(d);
        return bonus !== null ? L('heroStrike', { n: bonus * factor }) : null;
      }
    }
  };

  for (const pick of input.skills) {
    const skill = SKILLS_BY_ID.get(pick.id);
    const levelText = skill?.levels[pick.level - 1];
    if (!skill || !levelText) continue;
    const source = L('skillSource', { name: heroTextName(levelText, lang) });
    const texts: string[] = [];

    const kind = SKILL_KINDS[pick.id];
    if (kind === 'battle_magic') {
      const m = /повышаются на (\d+)% от силы магии/.exec(levelText.description);
      if (m) {
        const percent = Number(m[1]);
        const attack = Math.floor((Math.max(0, input.spellPower) * percent) / 100);
        const defense = Math.floor((Math.max(0, input.knowledge) * percent) / 100);
        if (attack > 0 || defense > 0) {
          result.attack += attack;
          result.defense += defense;
          texts.push(L('ownStats', { a: attack, d: defense }));
        }
      }
    } else if (kind === 'hero_strike') {
      if (side === 'attacker') {
        const bonus = parseStrikeBonus(levelText.description);
        if (bonus !== null) texts.push(L('heroStrike', { n: bonus }));
      }
    } else if (kind) {
      const percent = parseSkillPercent(kind, levelText.description);
      if (percent !== null) {
        if (kind === 'damage_percent' && side === 'attacker' && regular) {
          result.typeModifiers += percent;
          texts.push(L('typePercent', { n: `+${percent}` }));
        } else if (kind === 'incoming_percent' && side === 'defender' && regular) {
          result.typeModifiers -= percent;
          texts.push(L('typePercent', { n: `−${percent}` }));
        } else if (
          kind === 'magic_reduction' &&
          side === 'defender' &&
          mode.special?.kind === 'magic'
        ) {
          result.magicReduction -= percent;
          texts.push(L('magic', { n: `−${percent}` }));
        }
      }
    }

    // Выбранные поднавыки в порядке каталога; недоступные на уровне
    // мастерства пропускаются (декодер и UI их и так отбрасывают).
    const available = new Set(subskillsFor(skill, pick.level).map((sub) => sub.id));
    for (const sub of skill.subskills) {
      if (!pick.mods.includes(sub.id) || !available.has(sub.id)) continue;
      const text = applyMod(sub);
      if (text) texts.push(L('mod', { name: heroTextName(sub, lang), text }));
    }

    result.notes.push(
      texts.length > 0
        ? { source, text: texts.join(', '), applied: true }
        : { source, text: '', applied: false },
    );
  }

  return result;
}

/** Слагаемые бонуса специализации к удару героя; null — специализация не о том */
const heroStrikeSpec = (
  hero: GameHero,
  level: number,
): { base: number; amount: number; levels: number; total: number } | null => {
  if (SPEC_KINDS[hero.specialization.id]?.kind !== 'hero_strike') return null;
  const parsed = parseHeroStrike(hero.specialization.description);
  if (!parsed) return null;
  const increments = parsed.levels > 0 ? Math.floor(level / parsed.levels) : 0;
  return {
    base: parsed.base,
    amount: parsed.amount,
    levels: parsed.levels,
    total: parsed.base + increments * parsed.amount,
  };
};

/** Бонус специализации героя к урону удара героя; 0 — специализация не о том */
const heroStrikeSpecBonus = (hero: GameHero, level: number): number =>
  heroStrikeSpec(hero, level)?.total ?? 0;

/**
 * Плоская прибавка выбранных навыков к урону удара героя: уровень
 * «Ратного дела» плюс выбранные поднавыки с прибавкой к удару
 * («Практичные заклинания»).
 */
const skillStrikeBonus = (skills: SkillPick[]): number => {
  let total = 0;
  for (const pick of skills) {
    const skill = SKILLS_BY_ID.get(pick.id);
    if (!skill) continue;
    if (SKILL_KINDS[pick.id] === 'hero_strike') {
      total += parseStrikeBonus(skill.levels[pick.level - 1]?.description ?? '') ?? 0;
    }
    for (const sub of skill.subskills) {
      if (SUBSKILL_KINDS[sub.id] !== 'strike_flat') continue;
      if (!pick.mods.includes(sub.id) || sub.tier > pick.level) continue;
      total += parseStrikeBonus(sub.description) ?? 0;
    }
  }
  return total;
};

/**
 * Урон удара героя по уровню: 30 × (1 + 0.2 × (уровень − 1)) плюс бонус
 * специализации на удар героя и плоские прибавки выбранных навыков
 * («Ратное дело», «Практичные заклинания»). Артефакты не учитываются.
 */
export function heroStrikeDamage(
  hero: GameHero | null,
  level: number,
  skills: SkillPick[] = [],
): number {
  const lvl = clampLevel(level);
  const base = HERO_STRIKE_BASE * (1 + HERO_STRIKE_PER_LEVEL * (lvl - 1));
  return Math.round(base + (hero ? heroStrikeSpecBonus(hero, lvl) : 0) + skillStrikeBonus(skills));
}

export const EMPTY_HERO_PICK: HeroPick = {
  heroId: null,
  level: 1,
  skills: [],
  spellPower: 0,
  knowledge: 0,
};

/** Покомпонентное равенство выбранного навыка */
const sameSkillPick = (a: SkillPick, b: SkillPick): boolean =>
  a.id === b.id &&
  a.level === b.level &&
  a.mods.length === b.mods.length &&
  a.mods.every((mod, index) => mod === b.mods[index]);

/** Покомпонентное равенство выбора героя, включая навыки */
export const sameHeroPick = (a: HeroPick, b: HeroPick): boolean =>
  a.heroId === b.heroId &&
  a.level === b.level &&
  a.spellPower === b.spellPower &&
  a.knowledge === b.knowledge &&
  a.skills.length === b.skills.length &&
  a.skills.every((pick, index) => sameSkillPick(pick, b.skills[index]));

/** id режима атаки «Удар героя» в списке режимов атакующего */
export const HERO_STRIKE_MODE_ID = 'hero_strike';

/**
 * Режим атаки «Удар героя»: появляется в списке режимов, когда у
 * атакующего выбран герой. Считается как активная способность с
 * фиксированным чистым уроном — АТК/ЗЩТ, модификаторы, дальность и удача
 * не действуют, ответного удара нет, защитой цели не снижается.
 */
export function heroStrikeMode(
  hero: GameHero,
  level: number,
  skills: SkillPick[] = [],
  lang: Lang = 'ru',
): AttackMode {
  return {
    id: HERO_STRIKE_MODE_ID,
    label: translate(lang, 'modes.heroStrike'),
    multiplier: 1,
    rangePenalty: false,
    reach: 'ranged',
    provokesRetaliation: false,
    special: { kind: 'pure', base: heroStrikeDamage(hero, level, skills), perUnit: 0 },
  };
}

/**
 * Формула удара героя для карточки урона — в формате обычной атаки:
 * бакеты «база × уровень», у героев-специалистов плюс слагаемое
 * специализации «бонус + прибавка × ⌊уровень / период⌋», при выбранных
 * навыках с прибавкой к удару — слагаемое «бонус навыков»; числа несут
 * названия параметров, строка легенды повторяет выражение бакета.
 */
export function heroStrikeSteps(
  hero: GameHero,
  level: number,
  skills: SkillPick[] = [],
  lang: Lang = 'ru',
): DamageStep[] {
  const lvl = clampLevel(level);
  const P = (key: string): string => translate(lang, `formula.params.${key}`);
  const B = (key: string): string => translate(lang, `formula.labels.${key}`);
  const steps: DamageStep[] = [
    {
      label: B('strikeBase'),
      formula: P('strikeBase'),
      tokens: tokens(`${HERO_STRIKE_BASE}`),
    },
    {
      label: B('strikeLevel'),
      formula: `1 + ${HERO_STRIKE_PER_LEVEL} × (${P('heroLevel')} − 1)`,
      tokens: tokens(`1 + ${HERO_STRIKE_PER_LEVEL} × (`, num(lvl, P('heroLevel')), ' − 1)'),
    },
  ];
  const spec = heroStrikeSpec(hero, lvl);
  if (spec) {
    steps.push({
      label: B('strikeSpec'),
      formula:
        spec.levels > 0
          ? `${P('specBonus')} + ${P('specAmount')} × ⌊${P('heroLevel')} / ${P('specLevels')}⌋`
          : P('specBonus'),
      tokens:
        spec.levels > 0
          ? tokens(
              num(spec.base, P('specBonus')),
              ' + ',
              num(spec.amount, P('specAmount')),
              ' × ⌊',
              num(lvl, P('heroLevel')),
              ' / ',
              num(spec.levels, P('specLevels')),
              '⌋',
            )
          : tokens(num(spec.base, P('specBonus'))),
      op: '+',
    });
  }
  const skillBonus = skillStrikeBonus(skills);
  if (skillBonus > 0) {
    steps.push({
      label: B('strikeSkill'),
      formula: P('skillBonus'),
      tokens: tokens(num(skillBonus, P('skillBonus'))),
      op: '+',
    });
  }
  return steps;
}

/** Слаги юнитов специализации по существу; null — специализация не о том */
export const creatureSpecUnits = (specId: string): string[] | null => {
  const kind = SPEC_KINDS[specId];
  return kind?.kind === 'creature' ? kind.units : null;
};
