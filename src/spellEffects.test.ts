/**
 * Тесты spellBonuses: перевод наложенных на отряд эффектов заклинаний в
 * аддитивные слагаемые расчёта и гейтинг по стороне, типу удара и
 * режиму атаки.
 */

import { describe, expect, it } from 'vitest';
import type { AttackMode } from './abilityEffects';
import { SPELLS_BY_ID } from './spells';
import type { SpellBonusInput, SpellEffectPick } from './spellEffects';
import {
  EMPTY_SPELL_BONUSES,
  SPELL_KINDS,
  resolveAmount,
  spellBonuses,
} from './spellEffects';

const meleeMode: AttackMode = {
  id: 'base',
  label: '',
  multiplier: 1,
  rangePenalty: false,
  reach: 'melee',
  provokesRetaliation: true,
};

const rangedMode: AttackMode = { ...meleeMode, id: 'ranged', reach: 'ranged' };
const longMode: AttackMode = { ...meleeMode, id: 'long', reach: 'long' };

const specialMode: AttackMode = {
  ...meleeMode,
  id: 'cast',
  special: { kind: 'magic', base: 10, perUnit: 1 },
};

/** Наложенный эффект: уровень 1 и нулевая сила магии по умолчанию */
const effect = (spellId: string, level: 1 | 2 | 3 | 4 = 1, spellPower = 0): SpellEffectPick => ({
  spellId,
  level,
  spellPower,
});

/** Вклад заклинания в модификатор */
const contrib = (spellId: string, value: number) => ({ spellId, value });

const input = (overrides: Partial<SpellBonusInput>): SpellBonusInput => ({
  effects: [],
  health: 10,
  mode: meleeMode,
  side: 'attacker',
  ...overrides,
});

describe('каталог эффектов', () => {
  it('каждый слаг карты эффектов есть в каталоге заклинаний', () => {
    for (const slug of Object.keys(SPELL_KINDS)) {
      expect(SPELLS_BY_ID.has(slug), `нет заклинания ${slug}`).toBe(true);
    }
  });
});

describe('resolveAmount', () => {
  it('число возвращается как есть, сила магии игнорируется', () => {
    expect(resolveAmount(35, 99)).toBe(35);
  });

  it('формула считается от силы магии, отрицательная сила — как ноль', () => {
    expect(resolveAmount({ base: 60, perSpellPower: 15 }, 4)).toBe(120);
    expect(resolveAmount({ base: 60, perSpellPower: 15 }, -5)).toBe(60);
  });
});

describe('урон обычных атак (damage_percent)', () => {
  it('«Благословение» даёт +15/+20/+20/+30% по уровням', () => {
    for (const [level, percent] of [
      [1, 15],
      [2, 20],
      [3, 20],
      [4, 30],
    ] as const) {
      const result = spellBonuses(input({ effects: [effect('blessing', level)] }));
      expect(result.typeModifiers).toEqual([contrib('blessing', percent)]);
    }
  });

  it('«Странный покой» на атакующем снижает его урон', () => {
    const result = spellBonuses(input({ effects: [effect('unnatural_calm', 4)] }));
    expect(result.typeModifiers).toEqual([contrib('unnatural_calm', -30)]);
  });

  it('у защитника и на способностях бафф урона не действует', () => {
    const defender = spellBonuses(input({ effects: [effect('blessing')], side: 'defender' }));
    expect(defender.typeModifiers).toEqual([]);
    const special = spellBonuses(input({ effects: [effect('blessing')], mode: specialMode }));
    expect(special.typeModifiers).toEqual([]);
  });

  it('«Берсерк» первого уровня не даёт бонуса', () => {
    expect(spellBonuses(input({ effects: [effect('berserk', 1)] }))).toEqual(EMPTY_SPELL_BONUSES);
  });

  it('«Попутный ветер» действует только на выстрелы и атаки на расстоянии', () => {
    const melee = spellBonuses(input({ effects: [effect('favorable_wind', 3)] }));
    expect(melee.typeModifiers).toEqual([]);
    const ranged = spellBonuses(input({ effects: [effect('favorable_wind', 3)], mode: rangedMode }));
    expect(ranged.typeModifiers).toEqual([contrib('favorable_wind', 40)]);
    const long = spellBonuses(input({ effects: [effect('favorable_wind', 3)], mode: longMode }));
    expect(long.typeModifiers).toEqual([contrib('favorable_wind', 40)]);
  });

  it('«Сумерки» с 3-го уровня снижают урон носителя в ближнем бою', () => {
    expect(spellBonuses(input({ effects: [effect('twilight', 2)] })).typeModifiers).toEqual([]);
    expect(spellBonuses(input({ effects: [effect('twilight', 3)] })).typeModifiers).toEqual([
      contrib('twilight', -15),
    ]);
    const ranged = spellBonuses(input({ effects: [effect('twilight', 3)], mode: rangedMode }));
    expect(ranged.typeModifiers).toEqual([]);
  });

  it('«Искусное благословение» дополнительно даёт максимальный урон', () => {
    const result = spellBonuses(input({ effects: [effect('blessing_m', 1)] }));
    expect(result.typeModifiers).toEqual([contrib('blessing_m', 15)]);
    expect(result.maxDamage).toBe(true);
  });
});

describe('входящий урон (incoming_percent)', () => {
  it('«Толстая шкура» защищает только от ближнего боя', () => {
    const melee = spellBonuses(input({ effects: [effect('thick_hide', 4)], side: 'defender' }));
    expect(melee.typeModifiers).toEqual([contrib('thick_hide', -30)]);
    const ranged = spellBonuses(
      input({ effects: [effect('thick_hide', 4)], side: 'defender', mode: rangedMode }),
    );
    expect(ranged.typeModifiers).toEqual([]);
  });

  it('«Оптическая иллюзия» распространяется на длинные атаки с 3-го уровня', () => {
    const long2 = spellBonuses(
      input({ effects: [effect('optical_illusion', 2)], side: 'defender', mode: longMode }),
    );
    expect(long2.typeModifiers).toEqual([]);
    const long3 = spellBonuses(
      input({ effects: [effect('optical_illusion', 3)], side: 'defender', mode: longMode }),
    );
    expect(long3.typeModifiers).toEqual([contrib('optical_illusion', -60)]);
  });

  it('«Лучезарная броня» действует при любом типе удара, но не у атакующего', () => {
    const result = spellBonuses(
      input({ effects: [effect('radiant_armour', 4)], side: 'defender', mode: rangedMode }),
    );
    expect(result.typeModifiers).toEqual([contrib('radiant_armour', -35)]);
    const attacker = spellBonuses(input({ effects: [effect('radiant_armour', 4)] }));
    expect(attacker.typeModifiers).toEqual([]);
  });
});

describe('«Уязвимость» (vulnerability)', () => {
  it('добавляет процент входящего урона и максимум с 3-го уровня', () => {
    const l2 = spellBonuses(input({ effects: [effect('vulnerability', 2)], side: 'defender' }));
    expect(l2.typeModifiers).toEqual([contrib('vulnerability', 30)]);
    expect(l2.maxDamage).toBe(false);
    const l3 = spellBonuses(input({ effects: [effect('vulnerability', 3)], side: 'defender' }));
    expect(l3.typeModifiers).toEqual([contrib('vulnerability', 30)]);
    expect(l3.maxDamage).toBe(true);
  });

  it('на атакующем не действует: ответ модификаторов не получает', () => {
    expect(spellBonuses(input({ effects: [effect('vulnerability', 3)] }))).toEqual(
      EMPTY_SPELL_BONUSES,
    );
  });
});

describe('статы и здоровье', () => {
  it('«Удлинить/Укоротить тень» дают ±3 к атаке и защите на любом уровне', () => {
    const enlarge = spellBonuses(input({ effects: [effect('enlarge_shadow', 4)] }));
    expect(enlarge.attack).toBe(3);
    expect(enlarge.defense).toBe(3);
    const shorten = spellBonuses(input({ effects: [effect('shorten_shadow', 1)], side: 'defender' }));
    expect(shorten.attack).toBe(-3);
    expect(shorten.defense).toBe(-3);
  });

  it('статы действуют и на способностях с собственным уроном', () => {
    const result = spellBonuses(input({ effects: [effect('enlarge_shadow')], mode: specialMode }));
    expect(result.attack).toBe(3);
  });

  it('«Смертельный распад» снижает здоровье с 2-го уровня, дробная часть отбрасывается', () => {
    const l1 = spellBonuses(input({ effects: [effect('fatal_decay', 1)] }));
    expect(l1.health).toBe(0);
    const l4 = spellBonuses(input({ effects: [effect('fatal_decay', 4)], health: 13 }));
    expect(l4.health).toBe(-3);
  });
});

describe('чистый урон и контратака', () => {
  it('«Небесные клинки» дают 35, со 2-го уровня 75 чистого урона', () => {
    expect(spellBonuses(input({ effects: [effect('heavenly_blades', 1)] })).flatDamage).toEqual([
      contrib('heavenly_blades', 35),
    ]);
    expect(spellBonuses(input({ effects: [effect('heavenly_blades', 2)] })).flatDamage).toEqual([
      contrib('heavenly_blades', 75),
    ]);
    const defender = spellBonuses(
      input({ effects: [effect('heavenly_blades', 2)], side: 'defender' }),
    );
    expect(defender.flatDamage).toEqual([]);
  });

  it('«Парирование» даёт +20% к урону ответа защитника со 2-го уровня', () => {
    const l1 = spellBonuses(input({ effects: [effect('riposte', 1)], side: 'defender' }));
    expect(l1.retaliationPercent).toEqual([]);
    const l2 = spellBonuses(input({ effects: [effect('riposte', 2)], side: 'defender' }));
    expect(l2.retaliationPercent).toEqual([contrib('riposte', 20)]);
    const attacker = spellBonuses(input({ effects: [effect('riposte', 2)] }));
    expect(attacker.retaliationPercent).toEqual([]);
  });
});

describe('устойчивость к некорректному входу', () => {
  it('неизвестное заклинание не роняет расчёт и ничего не добавляет', () => {
    expect(spellBonuses(input({ effects: [effect('no_such_spell')] }))).toEqual(
      EMPTY_SPELL_BONUSES,
    );
  });

  it('заклинание без записи в карте эффектов ничего не добавляет', () => {
    expect(spellBonuses(input({ effects: [effect('fireball')] }))).toEqual(EMPTY_SPELL_BONUSES);
  });

  it('пустой список эффектов возвращает пустые бонусы', () => {
    expect(spellBonuses(input({}))).toEqual(EMPTY_SPELL_BONUSES);
  });

  it('вклады разных заклинаний собираются раздельно', () => {
    const result = spellBonuses(
      input({ effects: [effect('blessing', 4), effect('heavenly_blades', 2)] }),
    );
    expect(result.typeModifiers).toEqual([contrib('blessing', 30)]);
    expect(result.flatDamage).toEqual([contrib('heavenly_blades', 75)]);
  });
});
