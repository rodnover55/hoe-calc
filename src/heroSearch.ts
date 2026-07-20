import { HEROES } from './heroes';
import type { GameHero } from './heroes';
import { rankByName } from './search';

/**
 * Ищет героев по русскому и английскому имени. Внутри ранга сохраняется
 * порядок HEROES (фракция → имя).
 */
export const searchHeroes = (query: string, limit = 10): GameHero[] =>
  rankByName(HEROES, (hero) => [hero.name, hero.nameEn], query, limit);
