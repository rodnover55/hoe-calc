/** Регистр и «ё» не влияют на поиск: пользователь чаще печатает «е» */
const normalize = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');

/**
 * Ранжированный поиск по названиям: префикс названия → префикс слова →
 * вхождение подстроки. Внутри ранга сохраняется исходный порядок items
 * (сортировка стабильна).
 */
export const rankByName = <T>(
  items: readonly T[],
  namesOf: (item: T) => string[],
  query: string,
  limit = 10,
): T[] => {
  const q = normalize(query.trim());
  if (!q) return [];
  const rank = (item: T): number => {
    const names = namesOf(item).map(normalize);
    if (names.some((n) => n.startsWith(q))) return 0;
    if (names.some((n) => n.split(/[\s-]+/).some((w) => w.startsWith(q)))) return 1;
    if (names.some((n) => n.includes(q))) return 2;
    return -1;
  };
  return items
    .map((item) => ({ item, rank: rank(item) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.item);
};
