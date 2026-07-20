/**
 * Тесты кодека состояния `urlState`.
 *
 * Покрывают round-trip кодирования для ручного ввода, выбранного юнита
 * и пресетов героев, пригодность результата для query-параметра без
 * экранирования, обратную совместимость с версией 1, отказ на
 * повреждённой или структурно неверной строке и мягкую деградацию:
 * пропавший юнит, недопустимый режим атаки, битые пресеты и выбор.
 */

import { describe, expect, it } from 'vitest';
import type { HeroPick } from './heroEffects';
import { EMPTY_HERO_PICK, defaultSkillPicks } from './heroEffects';
import { HEROES_BY_ID } from './heroes';
import type { PresetStore } from './presets';
import { EMPTY_SELECTION, EMPTY_STORE, createHeroPreset, createSavedUnit } from './presets';
import type { AppUrlState } from './urlState';
import { decodeAppState, encodeAppState } from './urlState';

/** Полный выбор героя с навыками и статами для тестов */
const heroPick = (heroId: string, level: number, over: Partial<HeroPick> = {}): HeroPick => ({
  heroId,
  level,
  skills: [],
  spellPower: 2,
  knowledge: 1,
  ...over,
});

/** Отряд с различимыми значениями всех девяти статов */
const stats = (over: Partial<AppUrlState['attacker']> = {}): AppUrlState['attacker'] => ({
  count: 100,
  health: 120,
  topHealth: 90,
  damageMin: 50,
  damageMax: 75,
  attack: 36,
  defense: 20,
  heroAttack: 5,
  heroDefense: 3,
  ...over,
});

/** Состояние ручного ввода: юниты не выбраны, режим базовый, без пресетов */
const manualState = (over: Partial<AppUrlState> = {}): AppUrlState => ({
  attacker: stats(),
  defender: stats({ count: 42, health: 150, topHealth: 150 }),
  attack: { distance: 7, generalModifiers: 15, typeModifiers: -25, retaliation: true },
  modeId: 'base',
  attackerUnitId: null,
  defenderUnitId: null,
  attackerHero: EMPTY_HERO_PICK,
  defenderHero: EMPTY_HERO_PICK,
  presets: EMPTY_STORE,
  presetSelection: EMPTY_SELECTION,
  ...over,
});

/** Пресеты обеих сторон: юнит из базы, ручной ввод, по два отряда */
const sampleStore = (): PresetStore => ({
  attacker: [
    createHeroPreset(stats(), 'marksman'),
    {
      ...createHeroPreset(stats({ heroAttack: 9 }), null),
      units: [createSavedUnit(stats({ count: 20 }), null), createSavedUnit(stats(), 'marksman')],
    },
  ],
  defender: [createHeroPreset(stats({ count: 7 }), null)],
});

/** Пресеты без runtime-id: декодер выдаёт новые id при каждом разборе */
const stripIds = (store: PresetStore) =>
  (['attacker', 'defender'] as const).map((side) =>
    store[side].map(({ id: _id, units, ...hero }) => ({
      ...hero,
      units: units.map(({ id: _unitId, ...unit }) => unit),
    })),
  );

/** Кодирует состояние с подменённым wire-полем: для проверок валидации */
const tamper = (patch: Record<string, unknown>): string => {
  const payload = JSON.parse(atob(encodeAppState(manualState()))) as Record<string, unknown>;
  return btoa(JSON.stringify({ ...payload, ...patch }));
};

describe('round-trip', () => {
  /**
   * Кодирование и декодирование состояния ручного ввода возвращают его
   * без изменений, включая отрицательные модификаторы и неполное
   * здоровье верхнего юнита.
   */
  it('состояние ручного ввода восстанавливается без изменений', () => {
    const state = manualState();
    expect(decodeAppState(encodeAppState(state))).toEqual(state);
  });

  /**
   * Состояние с выбранным юнитом-стрелком и статами, отличными от
   * пресета, восстанавливается целиком: id юнитов, режим и правленые
   * статы.
   */
  it('состояние с выбранным юнитом восстанавливается целиком', () => {
    const state = manualState({
      attackerUnitId: 'marksman',
      defenderUnitId: 'marksman',
      modeId: 'melee',
      attacker: stats({ health: 999 }),
    });
    expect(decodeAppState(encodeAppState(state))).toEqual(state);
  });

  /**
   * Пресеты обеих сторон восстанавливаются с точностью до runtime-id
   * (декодер выдаёт свежие), а выбор указывает на те же позиции уже
   * с новыми id.
   */
  it('пресеты и их выбор восстанавливаются', () => {
    const store = sampleStore();
    const state = manualState({
      presets: store,
      presetSelection: {
        attackerHeroId: store.attacker[1].id,
        attackerSavedUnitId: store.attacker[1].units[1].id,
        defenderHeroId: store.defender[0].id,
        defenderSavedUnitId: null,
      },
    });
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded).not.toBeNull();
    expect(stripIds(decoded!.presets)).toEqual(stripIds(store));
    expect(decoded!.presetSelection).toEqual({
      attackerHeroId: decoded!.presets.attacker[1].id,
      attackerSavedUnitId: decoded!.presets.attacker[1].units[1].id,
      defenderHeroId: decoded!.presets.defender[0].id,
      defenderSavedUnitId: null,
    });
  });

  /**
   * Игровые герои обеих сторон — id, уровень, навыки с поднавыками, сила
   * магии и знание — переживают round-trip, в том числе внутри пресета
   * героя; режим «Удар героя» сохраняется. Пустой список навыков
   * остаётся пустым, а не заменяется стартовыми навыками.
   */
  it('игровые герои сторон и пресетов восстанавливаются', () => {
    const attackerPick = heroPick('ister', 7, {
      skills: [
        { id: 'offence', level: 2, mods: ['archery'] },
        { id: 'luck', level: 1, mods: [] },
      ],
      spellPower: 4,
      knowledge: 6,
    });
    const store: PresetStore = {
      attacker: [
        createHeroPreset(
          stats(),
          null,
          'ru',
          heroPick('niev', 12, { skills: [{ id: 'defence', level: 3, mods: [] }] }),
        ),
      ],
      defender: [],
    };
    const state = manualState({
      attackerHero: attackerPick,
      defenderHero: heroPick('bulwark', 3),
      modeId: 'hero_strike',
      presets: store,
    });
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded?.attackerHero).toEqual(attackerPick);
    expect(decoded?.defenderHero).toEqual(heroPick('bulwark', 3));
    expect(decoded?.modeId).toBe('hero_strike');
    expect(decoded?.presets.attacker[0].hero).toEqual(
      heroPick('niev', 12, { skills: [{ id: 'defence', level: 3, mods: [] }] }),
    );
  });

  /** Строка пригодна для query-параметра: только A-Za-z0-9-_ */
  it('кодирует только в URL-безопасные символы', () => {
    const withPresets = manualState({ presets: sampleStore() });
    expect(encodeAppState(withPresets)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  /** Ссылка версии 1 (до пресетов) декодируется в пустые пресеты */
  it('ссылка версии 1 даёт пустые пресеты', () => {
    const decoded = decodeAppState(tamper({ v: 1 }));
    expect(decoded).toEqual(manualState());
  });
});

describe('повреждённая строка', () => {
  /** Любой мусор вместо параметра даёт null, а не исключение */
  it.each([
    ['null', null],
    ['пустая строка', ''],
    ['битый base64', '%%%'],
    ['base64 не-JSON', btoa('not json')],
    ['JSON не-объект', btoa('[1,2,3]')],
  ])('%s → null', (_name, raw) => {
    expect(decodeAppState(raw)).toBeNull();
  });

  /** Структурно неверный payload целиком отвергается */
  it.each([
    ['неизвестная версия', { v: 3 }],
    ['статов меньше девяти', { a: [1, 2, 3, 4, 5, 6, 7, 8] }],
    ['стат-строка', { a: [1, 2, 3, 4, 5, 6, 7, 8, '9'] }],
    ['стат-NaN', { d: [1, 2, 3, 4, 5, 6, 7, 8, Number.NaN] }],
    ['условия атаки не той длины', { x: [1, 0, 0] }],
    ['режим не строка', { m: 7 }],
  ])('%s → null', (_name, patch) => {
    expect(decodeAppState(tamper(patch))).toBeNull();
  });
});

describe('мягкая деградация', () => {
  /**
   * Юнит, пропавший из базы (переименован или удалён), заменяется ручным
   * вводом; числовые статы из ссылки при этом сохраняются.
   */
  it('неизвестный юнит сбрасывается в ручной ввод с сохранением статов', () => {
    const decoded = decodeAppState(tamper({ au: 'deleted_unit' }));
    expect(decoded?.attackerUnitId).toBeNull();
    expect(decoded?.attacker).toEqual(manualState().attacker);
  });

  /** Флаг ответного удара с недопустимым значением приводится к false */
  it('неизвестное значение флага ответного удара даёт false', () => {
    expect(decodeAppState(tamper({ x: [1, 0, 0, 2] }))?.attack.retaliation).toBe(false);
  });

  /**
   * Режим, недопустимый для юнита из ссылки, заменяется первым из его
   * списка: у стрелка это дальняя атака, при ручном вводе — базовая.
   */
  it('недопустимый режим заменяется первым режимом юнита', () => {
    expect(decodeAppState(tamper({ au: 'marksman', m: 'no_such_mode' }))?.modeId).toBe('ranged');
    expect(decodeAppState(tamper({ m: 'no_such_mode' }))?.modeId).toBe('base');
  });

  /** Валидный wire-отряд пресета; имена ASCII — btoa в tamper не умеет юникод */
  const wireUnit = { n: 'unit x10', s: [10, 120, 90, 50, 75, 36, 20] };

  /** Юнит пресета, пропавший из базы, становится ручным вводом */
  it('неизвестный юнит в пресете сбрасывается в ручной ввод', () => {
    const decoded = decodeAppState(
      tamper({ pa: [{ n: 'hero', h: [5, 3], u: [{ ...wireUnit, u: 'deleted_unit' }] }] }),
    );
    const saved = decoded?.presets.attacker[0]?.units[0];
    expect(saved?.unitId).toBeNull();
    expect(saved?.stats).toEqual({
      count: 10,
      health: 120,
      topHealth: 90,
      damageMin: 50,
      damageMax: 75,
      attack: 36,
      defense: 20,
    });
  });

  /** Битые записи пресетов отбрасываются поштучно, соседи выживают */
  it('битый отряд и битый пресет отбрасываются поштучно', () => {
    const decoded = decodeAppState(
      tamper({
        pa: [
          { n: 'valid', h: [5, 3], u: [wireUnit, { n: 'broken', s: [1, 2, 3] }] },
          { n: 'broken', h: [5], u: [] },
        ],
      }),
    );
    expect(decoded?.presets.attacker).toHaveLength(1);
    expect(decoded?.presets.attacker[0].name).toBe('valid');
    expect(decoded?.presets.attacker[0].units).toHaveLength(1);
  });

  /** Список пресетов стороны, не являющийся массивом, даёт пустой список */
  it('pa не-массив даёт пустой список пресетов', () => {
    expect(decodeAppState(tamper({ pa: 'junk' }))?.presets.attacker).toEqual([]);
  });

  /** Герой, пропавший из базы, и битые кортежи дают пустой выбор героя */
  it.each([
    ['неизвестный герой', ['deleted_hero', 5]],
    ['id не строка', [7, 5]],
    ['не кортеж', 'junk'],
    ['короткий кортеж', ['ister']],
  ])('%s → пустой выбор героя', (_name, ah) => {
    expect(decodeAppState(tamper({ ah }))?.attackerHero).toEqual(EMPTY_HERO_PICK);
  });

  /** Уровень вне диапазона зажимается в допустимый, NaN становится 1 */
  it('уровень героя зажимается в допустимый диапазон', () => {
    expect(decodeAppState(tamper({ ah: ['ister', 99] }))?.attackerHero.level).toBe(30);
    expect(decodeAppState(tamper({ ah: ['ister', Number.NaN] }))?.attackerHero.level).toBe(1);
  });

  /**
   * Старая ссылка — кортеж [id, уровень] — сеет стартовые навыки героя
   * и его силу магии со знанием: расчёт совпадает с прежним поведением.
   */
  it('короткий кортеж героя сеет стартовые навыки и статы', () => {
    const decoded = decodeAppState(tamper({ ah: ['ister', 5] }));
    const ister = HEROES_BY_ID.get('ister')!;
    expect(decoded?.attackerHero).toEqual({
      heroId: 'ister',
      level: 5,
      skills: defaultSkillPicks(ister),
      spellPower: ister.stats.spellPower,
      knowledge: ister.stats.knowledge,
    });
    expect(decoded?.attackerHero.skills.length).toBeGreaterThan(0);
  });

  /** Битые навыки деградируют поштучно, сила магии/знание — на статы героя */
  it('битые навыки и статы героя деградируют поштучно', () => {
    const decoded = decodeAppState(
      tamper({
        ah: [
          'ister',
          5,
          [
            ['offence', 99, ['archery', 'no_such_mod', 'shadow_blades']],
            ['offence', 1],
            ['no_such_skill', 2],
            'junk',
            ['luck', Number.NaN],
          ],
          -3,
          'junk',
        ],
      }),
    );
    const ister = HEROES_BY_ID.get('ister')!;
    expect(decoded?.attackerHero.skills).toEqual([
      // Уровень 99 зажат в 3; неизвестный поднавык отброшен, доступные
      // упорядочены как в каталоге; дубль навыка и мусор отброшены.
      { id: 'offence', level: 3, mods: ['archery', 'shadow_blades'] },
      { id: 'luck', level: 1, mods: [] },
    ]);
    expect(decoded?.attackerHero.spellPower).toBe(ister.stats.spellPower);
    expect(decoded?.attackerHero.knowledge).toBe(ister.stats.knowledge);
  });

  /** Пустой список навыков — «все удалены», стартовые не сеются */
  it('пустой список навыков не заменяется стартовыми', () => {
    const decoded = decodeAppState(tamper({ ah: ['ister', 5, [], 0, 0] }));
    expect(decoded?.attackerHero.skills).toEqual([]);
  });

  /** «Удар героя» без героя в ссылке откатывается на первый режим */
  it('режим удара героя без героя заменяется базовым', () => {
    expect(decodeAppState(tamper({ m: 'hero_strike' }))?.modeId).toBe('base');
  });

  /** Ссылка без полей героев (старый формат) даёт пустой выбор */
  it('старая ссылка без героев декодируется в пустой выбор', () => {
    const decoded = decodeAppState(tamper({ v: 1 }));
    expect(decoded?.attackerHero).toEqual(EMPTY_HERO_PICK);
    expect(decoded?.defenderHero).toEqual(EMPTY_HERO_PICK);
    expect(decoded?.presets.attacker).toEqual([]);
  });

  /** Индексы выбора вне диапазона сбрасываются, валидные выживают */
  it('выбор с индексами вне диапазона сбрасывается', () => {
    const decoded = decodeAppState(
      tamper({ pa: [{ n: 'hero', h: [5, 3], u: [wireUnit] }], ps: [0, 7, 4, 0] }),
    );
    expect(decoded?.presetSelection).toEqual({
      attackerHeroId: decoded?.presets.attacker[0].id,
      attackerSavedUnitId: null,
      defenderHeroId: null,
      defenderSavedUnitId: null,
    });
  });
});
