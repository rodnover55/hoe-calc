/**
 * Курируемая карта эффектов героев, влияющих на расчёт урона.
 *
 * Специализации и стартовые навыки героев из heroes.ts переводятся в
 * бонусы калькулятора: прибавки к атаке/защите от специализаций по
 * существам (и штрафы таким же существам противника), процентные бонусы
 * «Нападения»/«Стрелка» и снижение урона «Защитой», а также урон удара
 * героя. Числа берутся из русских описаний: русский текст здесь — формат
 * данных, а не UI. Специализации и навыки, не перечисленные в картах
 * ниже, на расчёт не влияют и только отображаются в карточке героя.
 *
 * Урон удара героя (из игровых файлов v0.80.31):
 * 30 × (1 + 0.2 × (уровень − 1)); атака героя и защита цели не участвуют.
 * Усиления навыками («Ратное дело») и артефактами не учитываются;
 * специализации на удар героя учитываются.
 */

import type { AttackMode, Reach } from './abilityEffects';
import type { DamageStep } from './formula';
import { num, tokens } from './formula';
import type { GameHero } from './heroes';
import { heroTextName } from './heroes';
import type { Lang } from './i18n';
import { translate } from './i18n';
import type { UnitPreset } from './units';

/** Уровень героя в игре ограничен; ограничение поля уровня в форме */
export const MAX_HERO_LEVEL = 30;

/** Выбор игрового героя стороной: герой и его уровень */
export interface HeroPick {
  /** id героя из heroes.ts; null — герой не выбран */
  heroId: string | null;
  level: number;
}

export const clampLevel = (level: number): number =>
  Math.min(MAX_HERO_LEVEL, Math.max(1, Math.floor(level)));

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

/** Влияющие на урон стартовые навыки по имени без уровня мастерства */
type SkillKind = 'damage_percent' | 'incoming_percent' | 'magic_reduction';

const SKILL_KINDS: Record<string, SkillKind> = {
  offence: 'damage_percent',
  defence: 'incoming_percent',
  resistance: 'magic_reduction',
};

/** Ключ навыка в SKILL_KINDS: слаг без префикса уровня мастерства */
const skillKey = (id: string): string => id.replace(/^(?:basic|advanced|expert)_/, '');

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
  /** Штраф атаке юнита противника (отрицательный) */
  enemyAttack: number;
  /** Штраф защите юнита противника (отрицательный) */
  enemyDefense: number;
  /** Снижение входящего магического урона способностей, % (отрицательное) */
  magicReduction: number;
  notes: HeroBonusNote[];
}

export const EMPTY_BONUSES: HeroBonuses = {
  attack: 0,
  defense: 0,
  typeModifiers: 0,
  enemyAttack: 0,
  enemyDefense: 0,
  magicReduction: 0,
  notes: [],
};

/** Вход heroBonuses: герой стороны и контекст текущего расчёта */
export interface HeroBonusInput {
  hero: GameHero | null;
  level: number;
  /** Юнит своей стороны — для специализаций по существу */
  unit: UnitPreset | null;
  /** Юнит противника — для штрафа вражеским существам того же типа */
  enemyUnit: UnitPreset | null;
  /** Атака героя из формы — для «Истинного лорда» */
  heroAttack: number;
  /** Защита героя из формы */
  heroDefense: number;
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
 * Специализации по существам меняют статы и действуют всегда; процентные
 * эффекты действуют только на обычные атаки (не на способности с
 * собственным уроном) и только на «свой» удар: «Нападение» защитника не
 * усиливает ответ, потому что формула не учитывает модификаторы в ответе.
 * Заметки перечисляют специализацию (всегда) и влияющие навыки; чего нет
 * в заметках, то в расчёте не участвует.
 *
 * @param input герой, уровень, юниты обеих сторон, статы героя из формы,
 *   режим атаки и сторона.
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

  for (const skill of hero.skills) {
    const kind = SKILL_KINDS[skillKey(skill.id)];
    if (!kind) continue;
    const percent = parseSkillPercent(kind, skill.description);
    if (percent === null) continue;
    const source = L('skillSource', { name: heroTextName(skill, lang) });
    if (kind === 'damage_percent' && side === 'attacker' && regular) {
      result.typeModifiers += percent;
      result.notes.push({ source, text: L('typePercent', { n: `+${percent}` }), applied: true });
    } else if (kind === 'incoming_percent' && side === 'defender' && regular) {
      result.typeModifiers -= percent;
      result.notes.push({ source, text: L('typePercent', { n: `−${percent}` }), applied: true });
    } else if (kind === 'magic_reduction' && side === 'defender' && mode.special?.kind === 'magic') {
      result.magicReduction -= percent;
      result.notes.push({ source, text: L('magic', { n: `−${percent}` }), applied: true });
    }
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
 * Урон удара героя по уровню: 30 × (1 + 0.2 × (уровень − 1)) плюс бонус
 * специализации на удар героя. Навыки и артефакты не учитываются.
 */
export function heroStrikeDamage(hero: GameHero | null, level: number): number {
  const lvl = clampLevel(level);
  const base = HERO_STRIKE_BASE * (1 + HERO_STRIKE_PER_LEVEL * (lvl - 1));
  return Math.round(base + (hero ? heroStrikeSpecBonus(hero, lvl) : 0));
}

export const EMPTY_HERO_PICK: HeroPick = { heroId: null, level: 1 };

/** Покомпонентное равенство выбора героя */
export const sameHeroPick = (a: HeroPick, b: HeroPick): boolean =>
  a.heroId === b.heroId && a.level === b.level;

/** id режима атаки «Удар героя» в списке режимов атакующего */
export const HERO_STRIKE_MODE_ID = 'hero_strike';

/**
 * Режим атаки «Удар героя»: появляется в списке режимов, когда у
 * атакующего выбран герой. Считается как активная способность с
 * фиксированным чистым уроном — АТК/ЗЩТ, модификаторы, дальность и удача
 * не действуют, ответного удара нет, защитой цели не снижается.
 */
export function heroStrikeMode(hero: GameHero, level: number, lang: Lang = 'ru'): AttackMode {
  return {
    id: HERO_STRIKE_MODE_ID,
    label: translate(lang, 'modes.heroStrike'),
    multiplier: 1,
    rangePenalty: false,
    reach: 'ranged',
    provokesRetaliation: false,
    special: { kind: 'pure', base: heroStrikeDamage(hero, level), perUnit: 0 },
  };
}

/**
 * Формула удара героя для карточки урона — в формате обычной атаки:
 * бакеты «база × уровень», у героев-специалистов плюс слагаемое
 * специализации «бонус + прибавка × ⌊уровень / период⌋»; числа несут
 * названия параметров, строка легенды повторяет выражение бакета.
 */
export function heroStrikeSteps(hero: GameHero, level: number, lang: Lang = 'ru'): DamageStep[] {
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
  return steps;
}

/** Слаги юнитов специализации по существу; null — специализация не о том */
export const creatureSpecUnits = (specId: string): string[] | null => {
  const kind = SPEC_KINDS[specId];
  return kind?.kind === 'creature' ? kind.units : null;
};
