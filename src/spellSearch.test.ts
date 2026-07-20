import { describe, expect, it } from 'vitest';
import { searchSpells } from './spellSearch';

describe('searchSpells', () => {
  it('возвращает пустой список для пустого и пробельного запроса', () => {
    expect(searchSpells('')).toEqual([]);
    expect(searchSpells('   ')).toEqual([]);
  });

  it('находит заклинание по русскому названию', () => {
    expect(searchSpells('благословение').map((s) => s.id)).toContain('blessing');
  });

  it('ищет и по английскому названию', () => {
    expect(searchSpells('Blessing').map((s) => s.id)).toContain('blessing');
    expect(searchSpells('Vulnerability').map((s) => s.id)).toContain('vulnerability');
  });

  it('точное совпадение ранжируется выше приставочного', () => {
    // «Благословение» и «Искусное благословение» находятся оба, но
    // точное имя — первым.
    const ids = searchSpells('благословение').map((s) => s.id);
    expect(ids[0]).toBe('blessing');
    expect(ids).toContain('blessing_m');
  });

  it('не предлагает исключённые заклинания', () => {
    const ids = searchSpells('благословение', 10, new Set(['blessing'])).map((s) => s.id);
    expect(ids).not.toContain('blessing');
    expect(ids).toContain('blessing_m');
  });

  it('ограничивает число результатов', () => {
    expect(searchSpells('а').length).toBeLessThanOrEqual(10);
    expect(searchSpells('а', 3)).toHaveLength(3);
  });

  it('возвращает пустой список, когда совпадений нет', () => {
    expect(searchSpells('квазимодо')).toEqual([]);
  });
});
