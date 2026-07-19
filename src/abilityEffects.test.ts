/**
 * Тесты карты способностей `abilityEffects`.
 *
 * Покрывают построение списка режимов атаки по типу юнита и его
 * способностям, отмену штрафов «Снайпером» и «Дуэлянтом», ответный удар
 * по умолчанию и двойной удар в зависимости от режима.
 */

import { describe, expect, it } from 'vitest';
import { attackModesFor, damageReduction, defaultRetaliation, doubleStrikeFor } from './abilityEffects';
import type { UnitAbility, UnitPreset } from './units';

/** Способность с формальными текстами: для расчёта важен только слаг */
const ability = (id: string, name = id): UnitAbility => ({ id, name, description: '' });

/** Юнит-болванка: ближний бой без способностей */
const makeUnit = (over: Partial<UnitPreset> = {}): UnitPreset => ({
  id: 'test_unit',
  name: 'Тестовый юнит',
  nameEn: 'Test Unit',
  faction: 'neutral',
  tier: 1,
  grade: 0,
  image: 'units/neutral/test_unit.webp',
  stats: {
    health: 10,
    attack: 10,
    defense: 10,
    damageMin: 1,
    damageMax: 2,
    initiative: 10,
    speed: 5,
  },
  attackType: 'melee',
  flying: false,
  abilities: [ability('melee_attack')],
  ...over,
});

describe('attackModesFor', () => {
  /**
   * Рукопашный юнит получает единственный режим — базовую атаку без
   * штрафа дальности.
   */
  it('рукопашному юниту даёт базовую атаку без штрафов', () => {
    const modes = attackModesFor(makeUnit());
    expect(modes).toEqual([
      {
        id: 'base',
        label: 'Базовая атака',
        multiplier: 1,
        rangePenalty: false,
        reach: 'melee',
        provokesRetaliation: true,
      },
    ]);
  });

  /**
   * Юнит с ударом через гекс — базовая атака без штрафов, но она не
   * провоцирует ответ.
   */
  it('юниту с длинной атакой даёт базовую атаку без штрафов и ответа', () => {
    const modes = attackModesFor(
      makeUnit({ attackType: 'long_reach', abilities: [ability('long_reach')] }),
    );
    expect(modes.map((m) => m.id)).toEqual(['base']);
    expect(modes[0].rangePenalty).toBe(false);
    expect(modes[0].provokesRetaliation).toBe(false);
  });

  /**
   * Стрелок получает дальний режим со штрафом дальности и ближний со
   * множителем 0.5.
   */
  it('стрелку даёт дальний режим и ближний ×0.5', () => {
    const modes = attackModesFor(makeUnit({ abilities: [ability('ranged_attack')] }));
    expect(modes).toEqual([
      {
        id: 'ranged',
        label: 'Дальняя атака',
        multiplier: 1,
        rangePenalty: true,
        reach: 'ranged',
        provokesRetaliation: false,
      },
      {
        id: 'melee',
        label: 'Ближняя атака (×0.5)',
        multiplier: 0.5,
        rangePenalty: false,
        reach: 'melee',
        provokesRetaliation: true,
      },
    ]);
  });

  /**
   * «Снайпер» убирает штраф дальности у дальнего режима.
   */
  it('«Снайпер» отменяет штраф дальности', () => {
    const modes = attackModesFor(
      makeUnit({ abilities: [ability('ranged_attack'), ability('sharpshooter')] }),
    );
    expect(modes.find((m) => m.id === 'ranged')?.rangePenalty).toBe(false);
  });

  /**
   * «Дуэлянт» делает ближний режим стрелка полноценным: множитель 1 и
   * подпись без ×0.5.
   */
  it('«Дуэлянт» отменяет штраф ближней атаки стрелка', () => {
    const modes = attackModesFor(
      makeUnit({ abilities: [ability('ranged_attack'), ability('duelist')] }),
    );
    const melee = modes.find((m) => m.id === 'melee');
    expect(melee?.multiplier).toBe(1);
    expect(melee?.label).toBe('Ближняя атака');
  });

  /**
   * Боевая стойка из способностей юнита добавляется отдельным режимом с
   * её русским названием и множителем 0.5.
   */
  it('боевая стойка становится режимом с названием способности', () => {
    const modes = attackModesFor(
      makeUnit({
        abilities: [
          ability('melee_attack'),
          ability('fighting_style_whirlwind_strike', 'Стиль боя: Вихревой удар'),
        ],
      }),
    );
    expect(modes[1]).toEqual({
      id: 'fighting_style_whirlwind_strike',
      label: 'Стиль боя: Вихревой удар (×0.5)',
      multiplier: 0.5,
      rangePenalty: false,
      reach: 'melee',
      provokesRetaliation: true,
    });
  });

  /**
   * Дальняя стойка стрелка сохраняет штраф дальности, а «Снайпер»
   * отменяет его и у стойки.
   */
  it('дальняя стойка учитывает штраф дальности и «Снайпера»', () => {
    const abilities = [ability('ranged_attack'), ability('fighting_style_arrow_barrage', 'Шквал стрел')];
    const plain = attackModesFor(makeUnit({ abilities }));
    const barrage = plain.find((m) => m.id === 'fighting_style_arrow_barrage');
    expect(barrage?.reach).toBe('ranged');
    expect(barrage?.rangePenalty).toBe(true);

    const sharp = attackModesFor(makeUnit({ abilities: [...abilities, ability('sharpshooter')] }));
    expect(sharp.find((m) => m.id === 'fighting_style_arrow_barrage')?.rangePenalty).toBe(false);
  });

  /**
   * Без юнита возвращаются режимы ручного ввода: базовая атака и
   * половинный урон, оба со штрафом дальности как раньше.
   */
  it('без юнита даёт режимы ручного ввода', () => {
    const modes = attackModesFor(null);
    expect(modes.map((m) => m.id)).toEqual(['base', 'half']);
    expect(modes.every((m) => m.rangePenalty)).toBe(true);
    expect(modes[1].multiplier).toBe(0.5);
  });

  /**
   * Список способностей главнее attackType: юнит с ranged_attack в
   * способностях считается стрелком, а юнит с attackType ranged без
   * ranged_attack в списке — нет.
   */
  it('список способностей главнее attackType', () => {
    const bySkills = attackModesFor(
      makeUnit({ attackType: 'melee', abilities: [ability('ranged_attack')] }),
    );
    expect(bySkills[0].id).toBe('ranged');

    const byType = attackModesFor(
      makeUnit({ attackType: 'ranged', abilities: [ability('melee_attack')] }),
    );
    expect(byType[0].id).toBe('base');
  });

  /**
   * Для юнита без списка способностей тип атаки берётся из attackType.
   */
  it('без списка способностей опирается на attackType', () => {
    const modes = attackModesFor(makeUnit({ attackType: 'ranged', abilities: undefined }));
    expect(modes[0].id).toBe('ranged');
  });

  /**
   * Активная способность с фиксированной формулой урона становится
   * режимом с разобранными из описания коэффициентами.
   */
  it('способность с фиксированным уроном разбирается из описания', () => {
    const glance: UnitAbility = {
      id: 'glance_of_the_abyss',
      name: 'Взор Бездны',
      description:
        'Проклинает выбранный отряд противника. Проклятый отряд получает ' +
        '[ 15 + 3 × численность отряда ] чистого урона в начале своего хода.',
    };
    const modes = attackModesFor(makeUnit({ abilities: [ability('long_reach'), glance] }));
    const cast = modes.find((m) => m.id === 'glance_of_the_abyss');
    expect(cast?.label).toBe('Взор Бездны');
    expect(cast?.special).toEqual({ kind: 'pure', base: 15, perUnit: 3, ignoreDefense: undefined });
    expect(cast?.provokesRetaliation).toBe(false);
  });

  /**
   * Способность с долей урона обычной атаки получает разобранный
   * множитель, а не фиксированную формулу.
   */
  it('способность с долей урона разбирается из описания', () => {
    const gaze: UnitAbility = {
      id: 'gaze_of_the_abyss_slow',
      name: 'Взгляд Бездны. Замедление',
      description:
        'Наносит выбранному отряду противника чистый урон в размере 50% от обычной атаки ' +
        '([ 2—4 × численность отряда ]).',
    };
    const cast = attackModesFor(makeUnit({ abilities: [gaze] })).find(
      (m) => m.id === 'gaze_of_the_abyss_slow',
    );
    expect(cast?.special?.factor).toBe(0.5);
    expect(cast?.special?.base).toBeUndefined();
  });

  /**
   * Способность с нераспознанным описанием не становится режимом и
   * остаётся только в карточке юнита.
   */
  it('нераспознанная способность не попадает в режимы', () => {
    const broken: UnitAbility = {
      id: 'glance_of_the_abyss',
      name: 'Взор Бездны',
      description: 'Просто текст без формулы.',
    };
    const modes = attackModesFor(makeUnit({ abilities: [broken] }));
    expect(modes.map((m) => m.id)).toEqual(['base']);
  });

  /**
   * «Драконий клинок» удваивает урон базовой ближней атаки.
   */
  it('«Драконий клинок» удваивает ближний урон', () => {
    const modes = attackModesFor(
      makeUnit({ abilities: [ability('melee_attack'), ability('draconic_blade')] }),
    );
    expect(modes[0].multiplier).toBe(2);
    expect(modes[0].label).toBe('Базовая атака (×2)');
  });
});

describe('defaultRetaliation', () => {
  /**
   * Ближняя атака провоцирует ответ, дальняя — нет.
   */
  it('дальняя атака не провоцирует ответ, ближняя провоцирует', () => {
    const unit = makeUnit({ abilities: [ability('ranged_attack')] });
    const [ranged, melee] = attackModesFor(unit);
    expect(defaultRetaliation(unit, ranged)).toBe(false);
    expect(defaultRetaliation(unit, melee)).toBe(true);
  });

  /**
   * «Стремительный удар» отменяет ответ и в ближнем бою.
   */
  it('«Стремительный удар» отменяет ответ', () => {
    const unit = makeUnit({ abilities: [ability('melee_attack'), ability('swift_strike')] });
    const [base] = attackModesFor(unit);
    expect(defaultRetaliation(unit, base)).toBe(false);
  });

  /**
   * Стойка-плевок бьёт через гекс и, как длинная атака, не провоцирует
   * ответ, в отличие от обычной ближней стойки.
   */
  it('стойка через гекс не провоцирует ответ', () => {
    const unit = makeUnit({
      abilities: [ability('melee_attack'), ability('fighting_style_viscous_spit')],
    });
    const modes = attackModesFor(unit);
    const spit = modes.find((m) => m.id === 'fighting_style_viscous_spit');
    expect(spit && defaultRetaliation(unit, spit)).toBe(false);
    expect(defaultRetaliation(unit, modes[0])).toBe(true);
  });
});

describe('doubleStrikeFor', () => {
  /**
   * «Двойной удар» действует в любом режиме.
   */
  it('«Двойной удар» действует в любом режиме', () => {
    const unit = makeUnit({ abilities: [ability('melee_attack'), ability('double_strike')] });
    const [base] = attackModesFor(unit);
    expect(doubleStrikeFor(unit, base)).toBe(true);
  });

  /**
   * «Двойной выстрел» действует только при дальней атаке.
   */
  it('«Двойной выстрел» действует только при дальней атаке', () => {
    const unit = makeUnit({ abilities: [ability('ranged_attack'), ability('double_shot')] });
    const [ranged, melee] = attackModesFor(unit);
    expect(doubleStrikeFor(unit, ranged)).toBe(true);
    expect(doubleStrikeFor(unit, melee)).toBe(false);
  });

  /**
   * Без юнита и без способностей второго удара нет.
   */
  it('без юнита второго удара нет', () => {
    const [base] = attackModesFor(null);
    expect(doubleStrikeFor(null, base)).toBe(false);
    expect(doubleStrikeFor(makeUnit(), attackModesFor(makeUnit())[0])).toBe(false);
  });

  /**
   * На способности с собственным уроном «Двойной удар» не действует.
   */
  it('способность с собственным уроном не бьёт дважды', () => {
    const glance: UnitAbility = {
      id: 'glance_of_the_abyss',
      name: 'Взор Бездны',
      description: 'Получает [ 15 + 3 × численность отряда ] чистого урона.',
    };
    const unit = makeUnit({ abilities: [ability('melee_attack'), ability('double_strike'), glance] });
    const cast = attackModesFor(unit).find((m) => m.id === 'glance_of_the_abyss');
    expect(cast && doubleStrikeFor(unit, cast)).toBe(false);
  });
});

describe('damageReduction', () => {
  const shooter = makeUnit({ abilities: [ability('ranged_attack')] });

  /**
   * «Защита от выстрелов» снижает урон только дальнего режима.
   */
  it('«Защита от выстрелов» действует только на выстрелы', () => {
    const defender = makeUnit({
      abilities: [ability('melee_attack'), ability('ranged_defence_1', 'Защита от выстрелов I')],
    });
    const [ranged, melee] = attackModesFor(shooter);
    expect(damageReduction(defender, ranged)).toEqual({
      percent: -30,
      source: 'Защита от выстрелов I',
    });
    expect(damageReduction(defender, melee)).toBeNull();
  });

  /**
   * «Презрение» различает ближний бой, атаку через гекс и выстрелы.
   */
  it('«Презрение» снижает урон по типу удара', () => {
    const defender = makeUnit({ abilities: [ability('melee_attack'), ability('disdain', 'Презрение')] });
    const [ranged, melee] = attackModesFor(shooter);
    const [long] = attackModesFor(
      makeUnit({ attackType: 'long_reach', abilities: [ability('long_reach')] }),
    );
    expect(damageReduction(defender, melee)?.percent).toBe(-25);
    expect(damageReduction(defender, long)?.percent).toBe(-50);
    expect(damageReduction(defender, ranged)?.percent).toBe(-75);
  });

  /**
   * Магические способности снижает только «Защита от магии», чистые — ничто.
   */
  it('магию снижает только защита от магии, чистый урон — ничто', () => {
    const caster = makeUnit({
      abilities: [
        ability('melee_attack'),
        {
          id: 'starfall',
          name: 'Звездопад',
          description: 'Наносит [ 6 × численность отряда ] магического урона.',
        },
        {
          id: 'glance_of_the_abyss',
          name: 'Взор Бездны',
          description: 'Получает [ 15 + 3 × численность отряда ] чистого урона.',
        },
      ],
    });
    const modes = attackModesFor(caster);
    const magic = modes.find((m) => m.id === 'starfall');
    const pure = modes.find((m) => m.id === 'glance_of_the_abyss');
    const defender = makeUnit({
      abilities: [
        ability('melee_attack'),
        ability('magic_defence_3', 'Защита от магии III'),
        ability('ranged_defence_3', 'Защита от выстрелов III'),
      ],
    });
    expect(magic && damageReduction(defender, magic)).toEqual({
      percent: -60,
      source: 'Защита от магии III',
    });
    expect(pure && damageReduction(defender, pure)).toBeNull();
  });

  /**
   * Без выбранного защитника снижения нет.
   */
  it('без защитника снижения нет', () => {
    const [ranged] = attackModesFor(shooter);
    expect(damageReduction(null, ranged)).toBeNull();
  });
});
