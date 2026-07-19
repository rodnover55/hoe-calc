/**
 * Тесты локализации: загрузка локалей из yaml, перевод с подстановкой и
 * фолбэком на русский, множественное число, а также язык в подписях
 * режимов атаки и автоимён пресетов.
 */
import { describe, expect, it } from 'vitest';
import { attackModesFor } from './abilityEffects';
import { DEFAULT_LANG, LANGUAGES, pluralWord, translate } from './i18n';
import { defaultUnitName } from './presets';
import type { UnitPreset } from './units';

describe('загрузка локалей', () => {
  it('русский и английский подхватываются из src/locales', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(codes).toContain('ru');
    expect(codes).toContain('en');
  });

  it('эталонный язык — русский', () => {
    expect(DEFAULT_LANG).toBe('ru');
  });

  /**
   * Русская локаль — фолбэк для всех остальных, поэтому обязана быть
   * надмножеством: ключ, которого нет в русской, никогда не переведётся.
   */
  it('русская локаль содержит все ключи остальных языков', () => {
    const ru = LANGUAGES.find((language) => language.code === 'ru')!;
    for (const language of LANGUAGES) {
      for (const key of Object.keys(language.strings)) {
        expect(ru.strings[key], `${language.code}: ${key}`).toBeDefined();
      }
    }
  });
});

describe('translate', () => {
  it('переводит ключ на выбранный язык', () => {
    expect(translate('ru', 'app.attacker')).toBe('Атакующий');
    expect(translate('en', 'app.attacker')).toBe('Attacker');
  });

  it('подставляет параметры в шаблон', () => {
    expect(translate('ru', 'modeNote.reduction', { percent: -30, source: 'Презрение' })).toBe(
      'Защита цели: -30% (Презрение) — учтено автоматически.',
    );
  });

  it('неизвестный язык падает на русский', () => {
    expect(translate('de', 'app.attacker')).toBe('Атакующий');
  });

  it('неизвестный ключ возвращается как есть', () => {
    expect(translate('ru', 'no.such.key')).toBe('no.such.key');
  });
});

describe('pluralWord', () => {
  it.each([
    [1, 'удар'],
    [2, 'удара'],
    [5, 'ударов'],
    [11, 'ударов'],
    [21, 'удар'],
    [104, 'удара'],
  ])('русское склонение: %i → %s', (n, word) => {
    expect(pluralWord('ru', 'strikes.word', n)).toBe(word);
  });

  it.each([
    [1, 'strike'],
    [2, 'strikes'],
    [21, 'strikes'],
  ])('английское число: %i → %s', (n, word) => {
    expect(pluralWord('en', 'strikes.word', n)).toBe(word);
  });
});

describe('язык подписей', () => {
  const shooter: UnitPreset = {
    id: 'test-shooter',
    name: 'Тестовый стрелок',
    nameEn: 'Test Shooter',
    faction: 'temple',
    tier: 1,
    grade: 0,
    image: '',
    stats: {
      health: 10,
      attack: 5,
      defense: 5,
      damageMin: 1,
      damageMax: 2,
      initiative: 5,
      speed: 3,
    },
    attackType: 'ranged',
    flying: false,
    abilities: [
      {
        id: 'ranged_attack',
        name: 'Выстрел',
        nameEn: 'Ranged Attack',
        description: '',
      },
      {
        id: 'piercing_shot',
        name: 'Пронзающий выстрел',
        nameEn: 'Piercing Shot',
        description: '',
      },
    ],
  };

  it('режимы атаки по умолчанию подписаны по-русски', () => {
    expect(attackModesFor(shooter).map((mode) => mode.label)).toEqual([
      'Дальняя атака',
      'Ближняя атака (×0.5)',
      'Пронзающий выстрел (×0.5)',
    ]);
  });

  it('режимы атаки переводятся на английский', () => {
    expect(attackModesFor(shooter, 'en').map((mode) => mode.label)).toEqual([
      'Ranged attack',
      'Melee attack (×0.5)',
      'Piercing Shot (×0.5)',
    ]);
  });

  it('автоимя пресета следует языку', () => {
    expect(defaultUnitName('marksman', 10, 'en')).toBe('Marksman ×10');
    expect(defaultUnitName(null, 5, 'en')).toBe('Stack ×5');
    expect(defaultUnitName(null, 5)).toBe('Отряд ×5');
  });
});
