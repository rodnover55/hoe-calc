import { describe, expect, it } from 'vitest';
import { FACTION_ORDER } from './units';
import { HEROES, HEROES_BY_ID, heroName, heroesOf } from './heroes';

describe('каталог героев', () => {
  it('загружен и не пуст', () => {
    expect(HEROES.length).toBeGreaterThan(0);
  });

  it('id уникальны', () => {
    expect(HEROES_BY_ID.size).toBe(HEROES.length);
  });

  it('фракции известны, у нейтралов героев нет', () => {
    for (const hero of HEROES) {
      expect(FACTION_ORDER).toContain(hero.faction);
      expect(hero.faction).not.toBe('neutral');
    }
  });

  it('обязательные поля заполнены', () => {
    for (const hero of HEROES) {
      expect(hero.name).toBeTruthy();
      expect(hero.nameEn).toBeTruthy();
      expect(hero.image).toBe(`heroes/${hero.faction}/${hero.id}.webp`);
      for (const key of ['attack', 'defense', 'spellPower', 'knowledge'] as const) {
        expect(hero.stats[key], `${hero.id}.stats.${key}`).toBeTypeOf('number');
      }
      expect(hero.specialization.id).toBeTruthy();
      expect(hero.specialization.description).toBeTruthy();
      expect(hero.skills.length).toBeGreaterThan(0);
      for (const skill of hero.skills) {
        expect(skill.id, `${hero.id}: пустой навык`).toBeTruthy();
        expect(skill.name, `${hero.id}: навык ${skill.id} без названия`).toBeTruthy();
      }
    }
  });

  it('heroesOf возвращает героев только своей фракции', () => {
    for (const faction of FACTION_ORDER) {
      for (const hero of heroesOf(faction)) expect(hero.faction).toBe(faction);
    }
  });

  it('heroName подставляет английское имя вне русского', () => {
    const hero = HEROES[0];
    expect(heroName(hero, 'ru')).toBe(hero.name);
    expect(heroName(hero, 'en')).toBe(hero.nameEn);
  });
});
