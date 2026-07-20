/**
 * Тесты кодека состояния `urlState`.
 *
 * Покрывают round-trip кодирования для ручного ввода, выбранного юнита
 * и пресетов героев, пригодность результата для query-параметра без
 * экранирования, обратную совместимость с версиями 1 и 2 (раздельные
 * списки пресетов сторон склеиваются в общий), отказ на повреждённой
 * или структурно неверной строке и мягкую деградацию: пропавший юнит,
 * недопустимый режим атаки, битые пресеты и выбор.
 */

import { describe, expect, it } from 'vitest';
import type { HeroPick } from './heroEffects';
import { EMPTY_HERO_PICK, defaultSkillPicks } from './heroEffects';
import { HEROES_BY_ID } from './heroes';
import type { HeroPreset } from './presets';
import { EMPTY_SELECTION, createHeroPreset, createSavedUnit } from './presets';
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
  attackerEffects: [],
  defenderEffects: [],
  presets: [],
  presetSelection: EMPTY_SELECTION,
  ...over,
});

/** Общий список пресетов: юнит из базы, ручной ввод, по два отряда */
const samplePresets = (): HeroPreset[] => [
  createHeroPreset(stats(), 'marksman'),
  {
    ...createHeroPreset(stats({ heroAttack: 9 }), null),
    units: [createSavedUnit(stats({ count: 20 }), null), createSavedUnit(stats(), 'marksman')],
  },
  createHeroPreset(stats({ count: 7 }), null),
];

/** Пресеты без runtime-id: декодер выдаёт новые id при каждом разборе */
const stripIds = (presets: HeroPreset[]) =>
  presets.map(({ id: _id, units, ...hero }) => ({
    ...hero,
    units: units.map(({ id: _unitId, ...unit }) => unit),
  }));

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
   * Общий список пресетов восстанавливается с точностью до runtime-id
   * (декодер выдаёт свежие), а выбор обеих сторон указывает на те же
   * позиции уже с новыми id.
   */
  it('пресеты и их выбор восстанавливаются', () => {
    const list = samplePresets();
    const state = manualState({
      presets: list,
      presetSelection: {
        attackerHeroId: list[1].id,
        attackerSavedUnitId: list[1].units[1].id,
        defenderHeroId: list[2].id,
        defenderSavedUnitId: null,
      },
    });
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded).not.toBeNull();
    expect(stripIds(decoded!.presets)).toEqual(stripIds(list));
    expect(decoded!.presetSelection).toEqual({
      attackerHeroId: decoded!.presets[1].id,
      attackerSavedUnitId: decoded!.presets[1].units[1].id,
      defenderHeroId: decoded!.presets[2].id,
      defenderSavedUnitId: null,
    });
  });

  /** Обе стороны могут выбрать один и тот же пресет из общего списка */
  it('пресет, выбранный обеими сторонами, восстанавливается у обеих', () => {
    const list = samplePresets();
    const state = manualState({
      presets: list,
      presetSelection: {
        attackerHeroId: list[0].id,
        attackerSavedUnitId: list[0].units[0].id,
        defenderHeroId: list[0].id,
        defenderSavedUnitId: list[0].units[0].id,
      },
    });
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded!.presetSelection).toEqual({
      attackerHeroId: decoded!.presets[0].id,
      attackerSavedUnitId: decoded!.presets[0].units[0].id,
      defenderHeroId: decoded!.presets[0].id,
      defenderSavedUnitId: decoded!.presets[0].units[0].id,
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
    const list: HeroPreset[] = [
      createHeroPreset(
        stats(),
        null,
        'ru',
        heroPick('niev', 12, { skills: [{ id: 'defence', level: 3, mods: [] }] }),
      ),
    ];
    const state = manualState({
      attackerHero: attackerPick,
      defenderHero: heroPick('bulwark', 3),
      modeId: 'hero_strike',
      presets: list,
    });
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded?.attackerHero).toEqual(attackerPick);
    expect(decoded?.defenderHero).toEqual(heroPick('bulwark', 3));
    expect(decoded?.modeId).toBe('hero_strike');
    expect(decoded?.presets[0].hero).toEqual(
      heroPick('niev', 12, { skills: [{ id: 'defence', level: 3, mods: [] }] }),
    );
  });

  /** Строка пригодна для query-параметра: только A-Za-z0-9-_ */
  it('кодирует только в URL-безопасные символы', () => {
    const withPresets = manualState({ presets: samplePresets() });
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
    ['неизвестная версия', { v: 4 }],
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
      tamper({ p: [{ n: 'hero', h: [5, 3], u: [{ ...wireUnit, u: 'deleted_unit' }] }] }),
    );
    const saved = decoded?.presets[0]?.units[0];
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
        p: [
          { n: 'valid', h: [5, 3], u: [wireUnit, { n: 'broken', s: [1, 2, 3] }] },
          { n: 'broken', h: [5], u: [] },
        ],
      }),
    );
    expect(decoded?.presets).toHaveLength(1);
    expect(decoded?.presets[0].name).toBe('valid');
    expect(decoded?.presets[0].units).toHaveLength(1);
  });

  /** Список пресетов, не являющийся массивом, даёт пустой список */
  it('p не-массив даёт пустой список пресетов', () => {
    expect(decodeAppState(tamper({ p: 'junk' }))?.presets).toEqual([]);
  });

  /**
   * Ссылка версии 2 хранила раздельные списки пресетов сторон: при
   * декодировании они склеиваются в общий список, а выбор ps, адресующий
   * каждый свой список, переносится на склеенные позиции.
   */
  it('раздельные списки v2 склеиваются с сохранением выбора', () => {
    const decoded = decodeAppState(
      tamper({
        v: 2,
        pa: [{ n: 'att hero', h: [5, 3], u: [wireUnit] }],
        pd: [{ n: 'def hero', h: [7, 1], u: [wireUnit] }],
        ps: [0, 0, 0, -1],
      }),
    );
    expect(decoded?.presets.map((preset) => preset.name)).toEqual(['att hero', 'def hero']);
    expect(decoded?.presetSelection).toEqual({
      attackerHeroId: decoded?.presets[0].id,
      attackerSavedUnitId: decoded?.presets[0].units[0].id,
      defenderHeroId: decoded?.presets[1].id,
      defenderSavedUnitId: null,
    });
  });

  /** В ссылке версии 3 старые поля pa/pd не читаются */
  it('v3 игнорирует устаревшие поля pa/pd', () => {
    const decoded = decodeAppState(tamper({ pa: [{ n: 'stale', h: [5, 3], u: [wireUnit] }] }));
    expect(decoded?.presets).toEqual([]);
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
    expect(decoded?.presets).toEqual([]);
  });

  /** Индексы выбора вне диапазона сбрасываются, валидные выживают */
  it('выбор с индексами вне диапазона сбрасывается', () => {
    const decoded = decodeAppState(
      tamper({ p: [{ n: 'hero', h: [5, 3], u: [wireUnit] }], ps: [0, 7, 4, 0] }),
    );
    expect(decoded?.presetSelection).toEqual({
      attackerHeroId: decoded?.presets[0].id,
      attackerSavedUnitId: null,
      defenderHeroId: null,
      defenderSavedUnitId: null,
    });
  });
});

describe('эффекты заклинаний в ссылке', () => {
  /**
   * Эффекты обеих сторон переживают round-trip: уровень и ненулевая
   * сила магии сохраняются, нулевая сила магии восстанавливается нулём.
   */
  it('эффекты обеих сторон восстанавливаются без изменений', () => {
    const state = manualState({
      attackerEffects: [
        { spellId: 'blessing', level: 4, spellPower: 0 },
        { spellId: 'heavenly_blades', level: 2, spellPower: 6 },
      ],
      defenderEffects: [{ spellId: 'vulnerability', level: 3, spellPower: 0 }],
    });
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded?.attackerEffects).toEqual(state.attackerEffects);
    expect(decoded?.defenderEffects).toEqual(state.defenderEffects);
  });

  /** Пустые списки эффектов не пишутся в wire-формат */
  it('пустые списки эффектов опускаются в ссылке', () => {
    const payload = JSON.parse(atob(encodeAppState(manualState()))) as Record<string, unknown>;
    expect('ae' in payload).toBe(false);
    expect('de' in payload).toBe(false);
  });

  /** Старая ссылка без полей ae/de даёт пустые списки */
  it('старая ссылка декодируется с пустыми эффектами', () => {
    const decoded = decodeAppState(tamper({ v: 1 }));
    expect(decoded?.attackerEffects).toEqual([]);
    expect(decoded?.defenderEffects).toEqual([]);
  });

  /**
   * Неизвестное заклинание, короткий кортеж и повтор по id отбрасываются
   * поштучно; уровень зажимается в 1–4, отрицательная сила магии — 0.
   */
  it('битые эффекты отбрасываются поштучно с зажимом значений', () => {
    const decoded = decodeAppState(
      tamper({
        ae: [
          ['no_such_spell', 2],
          ['blessing'],
          ['blessing', 99],
          ['blessing', 1],
          ['heavenly_blades', 0, -5],
          7,
        ],
      }),
    );
    expect(decoded?.attackerEffects).toEqual([
      { spellId: 'blessing', level: 4, spellPower: 0 },
      { spellId: 'heavenly_blades', level: 1, spellPower: 0 },
    ]);
  });

  /** Не-массив в поле эффектов не роняет декодер */
  it('не-массив в поле эффектов даёт пустой список', () => {
    expect(decodeAppState(tamper({ de: 'junk' }))?.defenderEffects).toEqual([]);
  });
});
