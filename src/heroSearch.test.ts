import { describe, expect, it } from 'vitest';
import { searchHeroes } from './heroSearch';

describe('searchHeroes', () => {
  it('возвращает пустой список для пустого и пробельного запроса', () => {
    expect(searchHeroes('')).toEqual([]);
    expect(searchHeroes('   ')).toEqual([]);
  });

  it('не зависит от регистра', () => {
    const lower = searchHeroes('нив').map((h) => h.id);
    const upper = searchHeroes('НИВ').map((h) => h.id);
    expect(lower.length).toBeGreaterThan(0);
    expect(upper).toEqual(lower);
  });

  it('находит героя по русскому имени', () => {
    const ids = searchHeroes('Нив').map((h) => h.id);
    expect(ids).toContain('niev');
  });

  it('ищет и по английскому имени', () => {
    const ids = searchHeroes('Niev').map((h) => h.id);
    expect(ids).toContain('niev');
  });

  it('ограничивает число результатов', () => {
    expect(searchHeroes('а').length).toBeLessThanOrEqual(10);
    expect(searchHeroes('а', 3)).toHaveLength(3);
  });

  it('возвращает пустой список, когда совпадений нет', () => {
    expect(searchHeroes('квазимодо')).toEqual([]);
  });
});
