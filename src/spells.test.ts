/**
 * Тесты каталога заклинаний: целостность данных src/data/spells и хелпер
 * уровня изучения.
 */

import { describe, expect, it } from 'vitest';
import { SPELLS, SPELLS_BY_ID, SPELL_SCHOOLS, clampSpellLevel } from './spells';

describe('каталог заклинаний', () => {
  it('каталог полон: 94 заклинания, у каждого четыре уровня с текстами', () => {
    expect(SPELLS.length).toBe(94);
    for (const spell of SPELLS) {
      expect(spell.name, spell.id).toBeTruthy();
      expect(spell.nameEn, spell.id).toBeTruthy();
      expect(spell.levels, spell.id).toHaveLength(4);
      for (const level of spell.levels) {
        expect(level.description, spell.id).toBeTruthy();
        expect(level.descriptionEn, spell.id).toBeTruthy();
      }
    }
  });

  it('слаги уникальны, школа из известных, ранг и мана корректны', () => {
    const seen = new Set<string>();
    for (const spell of SPELLS) {
      expect(seen.has(spell.id), `повтор заклинания ${spell.id}`).toBe(false);
      seen.add(spell.id);
      expect(SPELL_SCHOOLS, spell.id).toContain(spell.school);
      expect(spell.tier, spell.id).toBeGreaterThanOrEqual(1);
      expect(spell.tier, spell.id).toBeLessThanOrEqual(5);
      expect(spell.mana, spell.id).toBeGreaterThanOrEqual(0);
      expect(spell.image, spell.id).toMatch(/^spells\/[a-z]+\/[a-z0-9_]+\.webp$/);
    }
  });

  it('иконка лежит в каталоге своей школы', () => {
    for (const spell of SPELLS) {
      expect(spell.image.startsWith(`spells/${spell.school}/`), spell.id).toBe(true);
    }
  });

  it('SPELLS_BY_ID находит заклинание по слагу', () => {
    expect(SPELLS_BY_ID.get('blessing')?.nameEn).toBe('Blessing');
  });
});

describe('clampSpellLevel', () => {
  it('зажимает в 1..4 с округлением вниз', () => {
    expect(clampSpellLevel(0)).toBe(1);
    expect(clampSpellLevel(2.9)).toBe(2);
    expect(clampSpellLevel(99)).toBe(4);
  });
});
