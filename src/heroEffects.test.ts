import { describe, expect, it } from 'vitest';
import type { AttackMode } from './abilityEffects';
import type { GameHero } from './heroes';
import { HEROES, HEROES_BY_ID } from './heroes';
import {
  EMPTY_HERO_PICK,
  creatureSpecUnits,
  defaultSkillPicks,
  MAX_HERO_LEVEL,
  heroBonuses,
  heroStrikeDamage,
  heroStrikeMode,
  heroStrikeSteps,
  sameHeroPick,
} from './heroEffects';
import type { HeroBonusInput, HeroPick, SkillPick } from './heroEffects';
import { UNITS, UNITS_BY_ID } from './units';

const meleeMode: AttackMode = {
  id: 'base',
  label: '',
  multiplier: 1,
  rangePenalty: false,
  reach: 'melee',
  provokesRetaliation: true,
};

const rangedMode: AttackMode = { ...meleeMode, id: 'ranged', reach: 'ranged' };

const specialMode = (kind: 'pure' | 'magic'): AttackMode => ({
  ...meleeMode,
  id: 'cast',
  special: { kind, base: 10, perUnit: 1 },
});

const hero = (id: string): GameHero => {
  const found = HEROES_BY_ID.get(id);
  if (!found) throw new Error(`нет героя ${id} в каталоге`);
  return found;
};

/** Герой без влияющей на расчёт специализации — для тестов навыков */
const plainHero = hero('ister');

/** Выбранный навык с уровнем и поднавыками */
const pick = (id: string, level: 1 | 2 | 3 = 1, mods: string[] = []): SkillPick => ({
  id,
  level,
  mods,
});

const input = (overrides: Partial<HeroBonusInput>): HeroBonusInput => ({
  hero: null,
  level: 1,
  skills: [],
  spellPower: 0,
  knowledge: 0,
  unit: null,
  enemyUnit: null,
  heroAttack: 0,
  heroDefense: 0,
  enemyUnitAttack: 0,
  enemyUnitDefense: 0,
  mode: meleeMode,
  side: 'attacker',
  ...overrides,
});

describe('heroStrikeDamage', () => {
  it('база 30 на первом уровне, +20% базы за уровень', () => {
    expect(heroStrikeDamage(null, 1)).toBe(30);
    expect(heroStrikeDamage(null, 2)).toBe(36);
    expect(heroStrikeDamage(null, 20)).toBe(144);
  });

  it('уровень ограничивается диапазоном 1..MAX_HERO_LEVEL', () => {
    expect(heroStrikeDamage(null, 0)).toBe(30);
    expect(heroStrikeDamage(null, 99)).toBe(heroStrikeDamage(null, MAX_HERO_LEVEL));
  });

  it('специализация на удар героя добавляет базу и уровневый бонус', () => {
    // Стингер: +40 урона, плюс 5 за каждые 3 уровня героя.
    expect(heroStrikeDamage(hero('stinger'), 6)).toBe(60 + 40 + 10);
    // Толкет: +40 урона, плюс 3 за каждые 5 уровней героя.
    expect(heroStrikeDamage(hero('tolketh'), 5)).toBe(54 + 40 + 3);
    // Курсон: +10 базового урона и ещё +5 за уровни героя: каждые 6.
    expect(heroStrikeDamage(hero('curson_duke_of_rage'), 6)).toBe(60 + 10 + 5);
  });

  it('чужая специализация урон удара не меняет', () => {
    expect(heroStrikeDamage(hero('ister'), 10)).toBe(heroStrikeDamage(null, 10));
  });

  it('«Ратное дело» и «Практичные заклинания» добавляют урон удару', () => {
    // Базовый/продвинутый/экспертный уровни: +10/+15/+20.
    expect(heroStrikeDamage(plainHero, 1, [pick('combat')])).toBe(30 + 10);
    expect(heroStrikeDamage(plainHero, 1, [pick('combat', 3)])).toBe(30 + 20);
    // Поднавык чародейства +10; недоступный на уровне — игнорируется.
    expect(
      heroStrikeDamage(plainHero, 1, [pick('thaumaturgy', 2, ['practical_incantations'])]),
    ).toBe(30 + 10);
    expect(
      heroStrikeDamage(plainHero, 1, [pick('thaumaturgy', 1, ['practical_incantations'])]),
    ).toBe(30);
    // Навыки складываются со специализацией на удар героя.
    expect(heroStrikeDamage(hero('stinger'), 6, [pick('combat')])).toBe(60 + 40 + 10 + 10);
  });

  it('формула удара героя получает слагаемое «бонус навыков»', () => {
    const steps = heroStrikeSteps(plainHero, 1, [pick('combat', 2)]);
    const last = steps[steps.length - 1];
    expect(last.label).toBe('бонус навыков');
    expect(last.op).toBe('+');
    expect(last.tokens.map((token) => token.text).join('')).toBe('15');
    // Режим удара героя учитывает навыки в базовом уроне.
    expect(heroStrikeMode(plainHero, 1, [pick('combat')]).special).toEqual({
      kind: 'pure',
      base: 40,
      perUnit: 0,
    });
  });

  it('EMPTY_HERO_PICK — пустой выбор первого уровня без навыков', () => {
    expect(EMPTY_HERO_PICK).toEqual({
      heroId: null,
      level: 1,
      skills: [],
      spellPower: 0,
      knowledge: 0,
    });
  });

  it('режим «Удар героя» несёт урон в специальной атаке, подпись без числа', () => {
    const mode = heroStrikeMode(hero('stinger'), 6);
    expect(mode.id).toBe('hero_strike');
    expect(mode.label).toBe('Удар героя');
    expect(mode.special).toEqual({ kind: 'pure', base: 110, perUnit: 0 });
    expect(mode.provokesRetaliation).toBe(false);
  });

  it('формула удара героя — бакеты с параметрами, как у обычной атаки', () => {
    const steps = heroStrikeSteps(hero('stinger'), 6);
    expect(steps.map((step) => step.label)).toEqual([
      'базовый урон',
      'рост с уровнем',
      'бонус специализации',
    ]);
    expect(steps.map((step) => step.tokens.map((token) => token.text).join(''))).toEqual([
      '30',
      '1 + 0.2 × (6 − 1)',
      '40 + 5 × ⌊6 / 3⌋',
    ]);
    expect(steps.map((step) => step.formula)).toEqual([
      'базовый урон удара героя',
      '1 + 0.2 × (уровень героя − 1)',
      'бонус специализации + прибавка специализации × ⌊уровень героя / уровней на прибавку⌋',
    ]);
    expect(steps[2].op).toBe('+');
    expect(steps[1].tokens.find((token) => token.text === '6')?.param).toBe('уровень героя');
    // База 30 — константа игровой формулы, без подсказки параметра.
    expect(steps[0].tokens[0].param).toBeUndefined();
    // Без специализации на удар героя — только база и уровень.
    expect(heroStrikeSteps(hero('ister'), 10)).toHaveLength(2);
  });
});

describe('heroBonuses: специализации', () => {
  it('без героя бонусов нет', () => {
    const bonuses = heroBonuses(input({}));
    expect(bonuses.typeModifiers).toBe(0);
    expect(bonuses.notes).toEqual([]);
  });

  it('«Стрелок» даёт типовой процент атакующему и растёт с уровнем', () => {
    // Нив: +10% обычными атаками, +1% за каждые 4 уровня; ещё +1%/4 в
    // дальнем бою и на расстоянии. Навыки заданы пустым списком и не
    // участвуют: heroBonuses не читает hero.skills.
    const melee = heroBonuses(input({ hero: hero('niev'), level: 8 }));
    expect(melee.typeModifiers).toBe(12);
    const ranged = heroBonuses(input({ hero: hero('niev'), level: 8, mode: rangedMode }));
    expect(ranged.typeModifiers).toBe(14);
  });

  it('процентные бонусы не действуют на способности и чужую сторону', () => {
    const special = heroBonuses(input({ hero: hero('niev'), level: 8, mode: specialMode('pure') }));
    expect(special.typeModifiers).toBe(0);
    const defender = heroBonuses(input({ hero: hero('niev'), level: 8, side: 'defender' }));
    expect(defender.typeModifiers).toBe(0);
    expect(defender.notes[0].applied).toBe(false);
  });

  it('«Защита» снижает типовые модификаторы у защитника по типу удара', () => {
    // Бастион: −10% от обычных атак, −1% за каждые 4 уровня; ещё −1% за
    // каждые 2 уровня от дальних и дальнобойных атак.
    const melee = heroBonuses(input({ hero: hero('bulwark'), level: 8, side: 'defender' }));
    expect(melee.typeModifiers).toBe(-12);
    const ranged = heroBonuses(
      input({ hero: hero('bulwark'), level: 8, side: 'defender', mode: rangedMode }),
    );
    expect(ranged.typeModifiers).toBe(-16);
  });

  it('специализация по существу усиливает свой отряд и ослабляет вражеский', () => {
    const swordsman = UNITS_BY_ID.get('swordsman') ?? null;
    const upgrade = UNITS.find((unit) => unit.upgradeOf === 'swordsman') ?? null;
    expect(swordsman).not.toBeNull();
    expect(upgrade).not.toBeNull();
    // Джон Джонсон: атака и защита мечников +1 за каждые 3 уровня.
    const own = heroBonuses(input({ hero: hero('john_johnson'), level: 7, unit: upgrade }));
    expect(own.attack).toBe(2);
    expect(own.defense).toBe(2);
    expect(own.notes[0].applied).toBe(true);
    const enemy = heroBonuses(input({ hero: hero('john_johnson'), level: 7, enemyUnit: swordsman }));
    expect(enemy.enemyAttack).toBe(-2);
    expect(enemy.enemyDefense).toBe(-2);
    const other = heroBonuses(
      input({ hero: hero('john_johnson'), level: 7, unit: UNITS_BY_ID.get('angel') ?? null }),
    );
    expect(other.attack).toBe(0);
    expect(other.notes[0].applied).toBe(false);
  });

  it('«Истинный лорд» добавляет процент от атаки и защиты героя', () => {
    // Лорд Эдгар: +10% от своей атаки и защиты, +5% за каждые 6 уровней.
    const bonuses = heroBonuses(
      input({ hero: hero('lord_edgar'), level: 6, heroAttack: 10, heroDefense: 20 }),
    );
    expect(bonuses.attack).toBe(1);
    expect(bonuses.defense).toBe(3);
  });

  it('специализация на удар героя отмечается в заметках атакующего', () => {
    const bonuses = heroBonuses(input({ hero: hero('stinger'), level: 6 }));
    expect(bonuses.notes[0].applied).toBe(true);
    expect(bonuses.notes[0].text).toContain('50');
    expect(bonuses.typeModifiers).toBe(0);
  });

  it('неизвестная специализация даёт только справочную заметку', () => {
    const bonuses = heroBonuses(input({ hero: hero('ister'), level: 20 }));
    expect(bonuses.attack).toBe(0);
    expect(bonuses.typeModifiers).toBe(0);
    expect(bonuses.notes[0].applied).toBe(false);
  });
});

describe('heroBonuses: навыки из списка', () => {
  it('«Нападение» действует у атакующего на обычные атаки по уровням', () => {
    expect(heroBonuses(input({ hero: plainHero, skills: [pick('offence')] })).typeModifiers).toBe(10);
    expect(
      heroBonuses(input({ hero: plainHero, skills: [pick('offence', 2)] })).typeModifiers,
    ).toBe(15);
    expect(
      heroBonuses(input({ hero: plainHero, skills: [pick('offence', 3)] })).typeModifiers,
    ).toBe(20);
    expect(
      heroBonuses(input({ hero: plainHero, skills: [pick('offence')], side: 'defender' }))
        .typeModifiers,
    ).toBe(0);
    expect(
      heroBonuses(input({ hero: plainHero, skills: [pick('offence')], mode: specialMode('pure') }))
        .typeModifiers,
    ).toBe(0);
  });

  it('«Защита» действует у защитника со знаком минус по уровням', () => {
    const defender = (level: 1 | 2 | 3) =>
      heroBonuses(input({ hero: plainHero, skills: [pick('defence', level)], side: 'defender' }));
    expect(defender(1).typeModifiers).toBe(-10);
    expect(defender(2).typeModifiers).toBe(-15);
    expect(defender(3).typeModifiers).toBe(-20);
    expect(
      heroBonuses(input({ hero: plainHero, skills: [pick('defence')] })).typeModifiers,
    ).toBe(0);
  });

  it('«Сопротивление» снижает только магический урон способностей', () => {
    const at = (mode: AttackMode) =>
      heroBonuses(input({ hero: plainHero, skills: [pick('resistance', 2)], side: 'defender', mode }));
    expect(at(specialMode('magic')).magicReduction).toBe(-25);
    expect(at(specialMode('pure')).magicReduction).toBe(0);
    expect(at(meleeMode).magicReduction).toBe(0);
  });

  it('«Боевая магия» даёт атаку и защиту от силы магии и знаний с floor', () => {
    const bonuses = heroBonuses(
      input({ hero: plainHero, skills: [pick('battle_magic')], spellPower: 7, knowledge: 13 }),
    );
    // Базовый уровень: 15% от 7 → 1, 15% от 13 → 1.
    expect(bonuses.attack).toBe(1);
    expect(bonuses.defense).toBe(1);
    const expert = heroBonuses(
      input({ hero: plainHero, skills: [pick('battle_magic', 3)], spellPower: 8, knowledge: 4 }),
    );
    // Экспертный уровень: 25% от 8 → 2, 25% от 4 → 1.
    expect(expert.attack).toBe(2);
    expect(expert.defense).toBe(1);
    // Без силы магии и знаний — справочная заметка.
    const empty = heroBonuses(input({ hero: plainHero, skills: [pick('battle_magic')] }));
    expect(empty.attack).toBe(0);
    expect(empty.notes[1].applied).toBe(false);
  });

  it('«Ратное дело» отмечается у атакующего и не трогает бакеты', () => {
    const bonuses = heroBonuses(input({ hero: plainHero, skills: [pick('combat', 2)] }));
    expect(bonuses.notes[1].applied).toBe(true);
    expect(bonuses.notes[1].text).toContain('15');
    expect(bonuses.typeModifiers).toBe(0);
    const defender = heroBonuses(
      input({ hero: plainHero, skills: [pick('combat', 2)], side: 'defender' }),
    );
    expect(defender.notes[1].applied).toBe(false);
  });

  it('«Стрельба» усиливает только дальние атаки атакующего', () => {
    const archer = pick('offence', 2, ['archery']);
    const ranged = heroBonuses(input({ hero: plainHero, skills: [archer], mode: rangedMode }));
    expect(ranged.typeModifiers).toBe(15 + 15);
    const melee = heroBonuses(input({ hero: plainHero, skills: [archer] }));
    expect(melee.typeModifiers).toBe(15);
  });

  it('«Укрытие» снижает только дальний урон защитника', () => {
    const covered = pick('defence', 2, ['cover']);
    const ranged = heroBonuses(
      input({ hero: plainHero, skills: [covered], side: 'defender', mode: rangedMode }),
    );
    expect(ranged.typeModifiers).toBe(-15 - 20);
    const melee = heroBonuses(input({ hero: plainHero, skills: [covered], side: 'defender' }));
    expect(melee.typeModifiers).toBe(-15);
  });

  it('«Мастерство боя» действует на обе стороны по типу удара', () => {
    const mastery = pick('battlecraft', 2, ['melee_mastery']);
    const attacker = heroBonuses(input({ hero: plainHero, skills: [mastery] }));
    expect(attacker.typeModifiers).toBe(10);
    const defender = heroBonuses(input({ hero: plainHero, skills: [mastery], side: 'defender' }));
    expect(defender.typeModifiers).toBe(-10);
    const ranged = heroBonuses(input({ hero: plainHero, skills: [mastery], mode: rangedMode }));
    expect(ranged.typeModifiers).toBe(0);
  });

  it('плоские прибавки к урону и здоровью попадают в свои бакеты', () => {
    const bonuses = heroBonuses(
      input({
        hero: plainHero,
        skills: [
          pick('offence', 3, ['shadow_blades']),
          pick('defence', 3, ['shields_and_shells']),
          pick('recruitment', 3, ['strenuous_training']),
        ],
      }),
    );
    expect(bonuses.damage).toBe(1);
    expect(bonuses.enemyDamage).toBe(-1);
    expect(bonuses.health).toBe(2);
  });

  it('процентные штрафы статам противника считаются от статов формы', () => {
    const bonuses = heroBonuses(
      input({
        hero: plainHero,
        skills: [pick('offence', 3, ['firmness']), pick('defence', 3, ['unstoppable_force'])],
        enemyUnitAttack: 30,
        enemyUnitDefense: 21,
      }),
    );
    // «Непоколебимость»: 15% от 21 → 3; «Неостановимая сила»: 15% от 30 → 4.
    expect(bonuses.enemyDefense).toBe(-3);
    expect(bonuses.enemyAttack).toBe(-4);
    // При нулевых статах противника вкладов и заметок эффекта нет.
    const zero = heroBonuses(
      input({ hero: plainHero, skills: [pick('offence', 3, ['firmness'])] }),
    );
    expect(zero.enemyDefense).toBe(0);
  });

  it('«Час волка» штрафует атаку и защиту противника разом', () => {
    const bonuses = heroBonuses(
      input({
        hero: plainHero,
        skills: [pick('nightshade_magic', 3, ['hour_of_the_wolf'])],
        enemyUnitAttack: 25,
        enemyUnitDefense: 14,
      }),
    );
    expect(bonuses.enemyAttack).toBe(-2);
    expect(bonuses.enemyDefense).toBe(-1);
  });

  it('«Договор с волшебниками» удваивается «Дипломатией»', () => {
    // Процент самой «Обороны» действует лишь на обычные атаки, поэтому в
    // магическом режиме остаётся только вклад поднавыка.
    const contract = pick('defence', 3, ['wizard_contract']);
    const single = heroBonuses(
      input({ hero: plainHero, skills: [contract], side: 'defender', mode: specialMode('magic') }),
    );
    expect(single.magicReduction).toBe(-10);
    expect(single.typeModifiers).toBe(0);
    const doubled = heroBonuses(
      input({
        hero: plainHero,
        skills: [contract, pick('diplomacy')],
        side: 'defender',
        mode: specialMode('magic'),
      }),
    );
    expect(doubled.magicReduction).toBe(-20);
  });

  it('«Хроническая слабость» снижает здоровье противника и удваивается', () => {
    const weakness = pick('nightshade_magic', 2, ['chronic_weakness']);
    expect(heroBonuses(input({ hero: plainHero, skills: [weakness] })).enemyHealth).toBe(-1);
    expect(
      heroBonuses(input({ hero: plainHero, skills: [weakness, pick('resistance')] })).enemyHealth,
    ).toBe(-2);
  });

  it('авторитеты «Боевой магии» берут проценты от силы магии и знаний', () => {
    const bonuses = heroBonuses(
      input({
        hero: plainHero,
        skills: [pick('battle_magic', 3, ['battle_mage_s_authority', 'mage_protector_s_authority'])],
        spellPower: 10,
        knowledge: 20,
      }),
    );
    // Уровень: 25% от 10 → 2 и 25% от 20 → 5; поднавыки: 15% от 10 → 1
    // и 15% от 20 → 3.
    expect(bonuses.attack).toBe(2 + 1);
    expect(bonuses.defense).toBe(5 + 3);
  });

  it('«Элитные стражи» действуют только на существ младших рангов', () => {
    const guards = pick('recruitment', 2, ['elite_guards']);
    const lowTier = heroBonuses(
      input({
        hero: plainHero,
        skills: [guards],
        unit: UNITS_BY_ID.get('swordsman') ?? null,
        heroAttack: 8,
        heroDefense: 12,
      }),
    );
    // 25% от 8 → 2, 25% от 12 → 3.
    expect(lowTier.attack).toBe(2);
    expect(lowTier.defense).toBe(3);
    const highTier = heroBonuses(
      input({
        hero: plainHero,
        skills: [guards],
        unit: UNITS_BY_ID.get('angel') ?? null,
        heroAttack: 8,
        heroDefense: 12,
      }),
    );
    expect(highTier.attack).toBe(0);
  });

  it('«Владение мечом» даёт плоские атаку и защиту', () => {
    const bonuses = heroBonuses(
      input({ hero: plainHero, skills: [pick('combat', 2, ['swordcraft'])] }),
    );
    expect(bonuses.attack).toBe(2);
    expect(bonuses.defense).toBe(2);
  });

  it('«Бродячая армия» усиливает только нейтральных существ', () => {
    const vagrant = pick('diplomacy', 3, ['vagrant_army']);
    const neutral = UNITS.find((unit) => unit.faction === 'neutral') ?? null;
    expect(neutral).not.toBeNull();
    const bonuses = heroBonuses(
      input({ hero: plainHero, skills: [vagrant], unit: neutral, heroAttack: 5, heroDefense: 3 }),
    );
    // 100% от атаки и защиты героя.
    expect(bonuses.attack).toBe(5);
    expect(bonuses.defense).toBe(3);
    const temple = heroBonuses(
      input({
        hero: plainHero,
        skills: [vagrant],
        unit: UNITS_BY_ID.get('swordsman') ?? null,
        heroAttack: 5,
        heroDefense: 3,
      }),
    );
    expect(temple.attack).toBe(0);
  });

  it('поднавыки недоступного уровня и неизвестные навыки игнорируются', () => {
    // «Теневые клинки» — экспертный поднавык: на продвинутом не действует.
    const early = heroBonuses(
      input({ hero: plainHero, skills: [pick('offence', 2, ['shadow_blades'])] }),
    );
    expect(early.damage).toBe(0);
    const unknown = heroBonuses(
      input({ hero: plainHero, skills: [pick('no_such_skill', 2)] }),
    );
    expect(unknown.notes).toHaveLength(1);
  });

  it('не влияющий на расчёт навык получает справочную заметку', () => {
    const bonuses = heroBonuses(input({ hero: plainHero, skills: [pick('logistics', 2)] }));
    expect(bonuses.typeModifiers).toBe(0);
    expect(bonuses.notes).toHaveLength(2);
    expect(bonuses.notes[1].applied).toBe(false);
    expect(bonuses.notes[1].source).toContain('Продвинутая логистика');
  });
});

describe('defaultSkillPicks и sameHeroPick', () => {
  it('стартовые навыки героя превращаются в пики с уровнем из слага', () => {
    // У Джона Джонсона среди стартовых навыков «Основы обороны».
    const picks = defaultSkillPicks(hero('john_johnson'));
    expect(picks.length).toBe(hero('john_johnson').skills.length);
    expect(picks).toContainEqual({ id: 'defence', level: 1, mods: [] });
    expect(defaultSkillPicks(null)).toEqual([]);
  });

  it('sameHeroPick сравнивает навыки, поднавыки и статы глубоко', () => {
    const base: HeroPick = {
      heroId: 'ister',
      level: 5,
      skills: [pick('offence', 2, ['archery'])],
      spellPower: 3,
      knowledge: 4,
    };
    expect(sameHeroPick(base, { ...base, skills: [pick('offence', 2, ['archery'])] })).toBe(true);
    expect(sameHeroPick(base, { ...base, skills: [pick('offence', 2)] })).toBe(false);
    expect(sameHeroPick(base, { ...base, skills: [pick('offence', 3, ['archery'])] })).toBe(false);
    expect(sameHeroPick(base, { ...base, spellPower: 4 })).toBe(false);
  });
});

describe('каталог покрывает курируемые специализации', () => {
  it('специализации по существам ссылаются на юниты из базы и парсятся', () => {
    for (const h of HEROES) {
      const units = creatureSpecUnits(h.specialization.id);
      if (!units) continue;
      for (const slug of units) {
        expect(UNITS_BY_ID.has(slug), `${h.id}: нет юнита ${slug}`).toBe(true);
      }
      const unit = UNITS_BY_ID.get(units[0]) ?? null;
      const bonuses = heroBonuses(input({ hero: h, level: 30, unit }));
      expect(bonuses.attack, `${h.id}: описание не распознано`).toBeGreaterThan(0);
    }
  });
});
