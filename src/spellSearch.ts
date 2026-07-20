import { rankByName } from './search';
import type { Spell } from './spells';
import { SPELLS } from './spells';

/**
 * Ищет заклинания по названию на обоих языках. Заклинания из exclude
 * (уже наложенные на отряд эффекты) не предлагаются.
 */
export const searchSpells = (
  query: string,
  limit = 10,
  exclude: ReadonlySet<string> = new Set(),
): Spell[] =>
  rankByName(
    SPELLS.filter((spell) => !exclude.has(spell.id)),
    (spell) => [spell.name, spell.nameEn],
    query,
    limit,
  );
