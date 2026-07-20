/**
 * Тесты каталога навыков: целостность данных src/data/skills, связь со
 * стартовыми навыками героев и хелперы уровней и поднавыков.
 */

import { describe, expect, it } from 'vitest';
import { HEROES } from './heroes';
import {
  SKILLS,
  SKILLS_BY_ID,
  clampSkillLevel,
  levelOfSlug,
  normalizeMods,
  slugOfLevel,
  subskillsFor,
} from './skills';

describe('каталог навыков', () => {
  it('каталог полон: 30 навыков, у каждого три уровня с текстами', () => {
    expect(SKILLS.length).toBe(30);
    for (const skill of SKILLS) {
      expect(skill.name, skill.id).toBeTruthy();
      expect(skill.nameEn, skill.id).toBeTruthy();
      expect(skill.levels, skill.id).toHaveLength(3);
      for (const level of skill.levels) {
        expect(level.name, skill.id).toBeTruthy();
        expect(level.nameEn, skill.id).toBeTruthy();
        expect(level.description, skill.id).toBeTruthy();
        expect(level.descriptionEn, skill.id).toBeTruthy();
      }
    }
  });

  it('поднавыки уникальны глобально, tier ∈ {2, 3}', () => {
    const seen = new Set<string>();
    for (const skill of SKILLS) {
      for (const sub of skill.subskills) {
        expect([2, 3], `${skill.id}/${sub.id}`).toContain(sub.tier);
        expect(seen.has(sub.id), `повтор поднавыка ${sub.id}`).toBe(false);
        seen.add(sub.id);
        expect(sub.name, sub.id).toBeTruthy();
        expect(sub.description, sub.id).toBeTruthy();
      }
    }
  });

  it('каждый стартовый навык каждого героя есть в каталоге', () => {
    for (const hero of HEROES) {
      for (const skill of hero.skills) {
        expect(levelOfSlug(skill.id), `${hero.id}: ${skill.id}`).not.toBeNull();
      }
    }
  });
});

describe('хелперы уровней', () => {
  it('levelOfSlug разбирает слаг уровня, slugOfLevel собирает обратно', () => {
    const parsed = levelOfSlug('advanced_offence');
    expect(parsed?.skill.id).toBe('offence');
    expect(parsed?.level).toBe(2);
    expect(slugOfLevel('offence', 2)).toBe('advanced_offence');
    expect(levelOfSlug('advanced_no_such_skill')).toBeNull();
    expect(levelOfSlug('offence')).toBeNull();
  });

  it('clampSkillLevel зажимает в 1..3 с округлением вниз', () => {
    expect(clampSkillLevel(0)).toBe(1);
    expect(clampSkillLevel(2.9)).toBe(2);
    expect(clampSkillLevel(99)).toBe(3);
  });

  it('subskillsFor фильтрует по уровню мастерства', () => {
    const offence = SKILLS_BY_ID.get('offence')!;
    expect(subskillsFor(offence, 1)).toHaveLength(0);
    expect(subskillsFor(offence, 2).every((sub) => sub.tier === 2)).toBe(true);
    expect(subskillsFor(offence, 3)).toHaveLength(offence.subskills.length);
  });

  it('normalizeMods отбрасывает лишнее и держит порядок каталога', () => {
    const offence = SKILLS_BY_ID.get('offence')!;
    expect(normalizeMods(offence, 3, ['shadow_blades', 'archery', 'archery', 'junk', 7])).toEqual([
      'archery',
      'shadow_blades',
    ]);
    // На продвинутом уровне экспертные поднавыки недоступны.
    expect(normalizeMods(offence, 2, ['shadow_blades', 'archery'])).toEqual(['archery']);
    expect(normalizeMods(offence, 3, 'junk')).toEqual([]);
  });
});
