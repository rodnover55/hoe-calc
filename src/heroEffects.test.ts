import { describe, expect, it } from 'vitest';
import type { AttackMode } from './abilityEffects';
import type { GameHero } from './heroes';
import { HEROES, HEROES_BY_ID } from './heroes';
import {
  EMPTY_HERO_PICK,
  creatureSpecUnits,
  MAX_HERO_LEVEL,
  heroBonuses,
  heroStrikeDamage,
  heroStrikeMode,
  heroStrikeSteps,
} from './heroEffects';
import type { HeroBonusInput } from './heroEffects';
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

/** Синтетический герой для тестов эффектов навыков без специализации */
const withSkills = (skills: GameHero['skills']): GameHero => ({
  id: 'test',
  name: 'Тест',
  nameEn: 'Test',
  faction: 'temple',
  class: '',
  classEn: '',
  image: '',
  stats: { attack: 0, defense: 0, spellPower: 0, knowledge: 0 },
  specialization: {
    id: 'unknown_spec',
    name: 'Никакая',
    nameEn: 'None',
    description: 'Ничего не делает.',
    descriptionEn: '',
  },
  skills,
});

const input = (overrides: Partial<HeroBonusInput>): HeroBonusInput => ({
  hero: null,
  level: 1,
  unit: null,
  enemyUnit: null,
  heroAttack: 0,
  heroDefense: 0,
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

  it('EMPTY_HERO_PICK — пустой выбор первого уровня', () => {
    expect(EMPTY_HERO_PICK).toEqual({ heroId: null, level: 1 });
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
    // дальнем бою и на расстоянии. Навык «Основы нападения» даёт ещё +10%.
    const melee = heroBonuses(input({ hero: hero('niev'), level: 8 }));
    expect(melee.typeModifiers).toBe(12 + 10);
    const ranged = heroBonuses(input({ hero: hero('niev'), level: 8, mode: rangedMode }));
    expect(ranged.typeModifiers).toBe(14 + 10);
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
    // каждые 2 уровня от дальних и дальнобойных атак. Навык «Основы
    // обороны» добавляет −10%.
    const melee = heroBonuses(input({ hero: hero('bulwark'), level: 8, side: 'defender' }));
    expect(melee.typeModifiers).toBe(-12 - 10);
    const ranged = heroBonuses(
      input({ hero: hero('bulwark'), level: 8, side: 'defender', mode: rangedMode }),
    );
    expect(ranged.typeModifiers).toBe(-16 - 10);
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

describe('heroBonuses: стартовые навыки', () => {
  it('«Нападение» действует у атакующего на обычные атаки', () => {
    const skilled = withSkills([
      {
        id: 'basic_offence',
        name: 'Основы нападения',
        nameEn: 'Basic Offense',
        description: 'Дружественные существа наносят +10% урона обычными атаками.',
        descriptionEn: '',
      },
    ]);
    expect(heroBonuses(input({ hero: skilled })).typeModifiers).toBe(10);
    expect(heroBonuses(input({ hero: skilled, side: 'defender' })).typeModifiers).toBe(0);
    expect(heroBonuses(input({ hero: skilled, mode: specialMode('pure') })).typeModifiers).toBe(0);
  });

  it('«Оборона» действует у защитника со знаком минус', () => {
    const skilled = withSkills([
      {
        id: 'basic_defence',
        name: 'Основы обороны',
        nameEn: 'Basic Defense',
        description: 'Дружественные существа получают –10% урона от обычных атак.',
        descriptionEn: '',
      },
    ]);
    expect(heroBonuses(input({ hero: skilled, side: 'defender' })).typeModifiers).toBe(-10);
    expect(heroBonuses(input({ hero: skilled })).typeModifiers).toBe(0);
  });

  it('«Сопротивление» снижает только магический урон способностей', () => {
    const skilled = withSkills([
      {
        id: 'basic_resistance',
        name: 'Основы сопротивления',
        nameEn: 'Basic Resistance',
        description: 'Дружественные существа получают –15% магического урона.',
        descriptionEn: '',
      },
    ]);
    const magic = heroBonuses(
      input({ hero: skilled, side: 'defender', mode: specialMode('magic') }),
    );
    expect(magic.magicReduction).toBe(-15);
    const pure = heroBonuses(input({ hero: skilled, side: 'defender', mode: specialMode('pure') }));
    expect(pure.magicReduction).toBe(0);
    const regular = heroBonuses(input({ hero: skilled, side: 'defender' }));
    expect(regular.magicReduction).toBe(0);
  });

  it('нераспознанные навыки бонусов не дают', () => {
    const skilled = withSkills([
      {
        id: 'basic_logistics',
        name: 'Основы логистики',
        nameEn: 'Basic Logistics',
        description: '+10% очков движения по карте приключений.',
        descriptionEn: '',
      },
    ]);
    const bonuses = heroBonuses(input({ hero: skilled }));
    expect(bonuses.typeModifiers).toBe(0);
    // Заметки: только специализация (справочно), навык не упоминается.
    expect(bonuses.notes).toHaveLength(1);
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
