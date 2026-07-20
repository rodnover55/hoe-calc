import { describe, expect, it } from 'vitest';
import { searchSkills } from './skillSearch';

describe('searchSkills', () => {
  it('возвращает пустой список для пустого и пробельного запроса', () => {
    expect(searchSkills('')).toEqual([]);
    expect(searchSkills('   ')).toEqual([]);
  });

  it('находит навык по русскому базовому имени', () => {
    expect(searchSkills('атака').map((s) => s.id)).toContain('offence');
  });

  it('находит навык по названию уровня', () => {
    // Базовое имя «Атака», но пользователь печатает «нападение» — имя
    // уровня «Основы нападения»; аналогично «оборона» для «Защиты».
    expect(searchSkills('нападение').map((s) => s.id)).toContain('offence');
    expect(searchSkills('оборона').map((s) => s.id)).toContain('defence');
  });

  it('ищет и по английскому имени', () => {
    expect(searchSkills('Offence').map((s) => s.id)).toContain('offence');
    expect(searchSkills('Resistance').map((s) => s.id)).toContain('resistance');
  });

  it('не предлагает исключённые навыки', () => {
    const ids = searchSkills('атака', 10, new Set(['offence'])).map((s) => s.id);
    expect(ids).not.toContain('offence');
  });

  it('ограничивает число результатов', () => {
    expect(searchSkills('а').length).toBeLessThanOrEqual(10);
    expect(searchSkills('а', 3)).toHaveLength(3);
  });

  it('возвращает пустой список, когда совпадений нет', () => {
    expect(searchSkills('квазимодо')).toEqual([]);
  });
});
