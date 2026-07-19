import { describe, expect, it } from 'vitest';
import { searchUnits } from './unitSearch';

describe('searchUnits', () => {
  it('возвращает пустой список для пустого и пробельного запроса', () => {
    expect(searchUnits('')).toEqual([]);
    expect(searchUnits('   ')).toEqual([]);
  });

  it('не зависит от регистра', () => {
    const lower = searchUnits('грифон').map((u) => u.id);
    const upper = searchUnits('ГРИФОН').map((u) => u.id);
    expect(lower.length).toBeGreaterThan(0);
    expect(upper).toEqual(lower);
  });

  it('находит грейд по его собственному названию', () => {
    const [first] = searchUnits('Храмовый грифон');
    expect(first.id).toBe('temple_griffin');
    expect(first.grade).toBe(1);
    expect(first.faction).toBe('temple');
  });

  it('ставит префикс названия выше вхождения в середине', () => {
    const ids = searchUnits('грифон').map((u) => u.id);
    expect(ids[0]).toBe('griffin');
    expect(ids).toContain('temple_griffin');
    expect(ids.indexOf('griffin')).toBeLessThan(ids.indexOf('temple_griffin'));
  });

  it('не различает «ё» и «е»', () => {
    const viaE = searchUnits('черный дракон').map((u) => u.id);
    const viaYo = searchUnits('чёрный дракон').map((u) => u.id);
    expect(viaE).toContain('black_dragon');
    expect(viaYo).toEqual(viaE);
  });

  it('ищет и по английскому названию', () => {
    const [first] = searchUnits('temple griffin');
    expect(first.id).toBe('temple_griffin');
  });

  it('ограничивает число результатов', () => {
    expect(searchUnits('а').length).toBeLessThanOrEqual(10);
    expect(searchUnits('а', 3)).toHaveLength(3);
  });

  it('возвращает пустой список, когда совпадений нет', () => {
    expect(searchUnits('квазимодо')).toEqual([]);
  });
});
