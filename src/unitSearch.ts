import type { UnitPreset } from './units';
import { UNITS } from './units';

/** Регистр и «ё» не влияют на поиск: пользователь чаще печатает «е» */
const normalize = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');

/**
 * Ищет юниты по русскому и английскому названию. Каждый грейд — отдельный
 * юнит со своим именем, поэтому «Храмовый грифон» находит именно грейд 1.
 * Ранжирование: префикс названия → префикс слова → вхождение подстроки;
 * внутри ранга сохраняется порядок UNITS (фракция → тир → грейд).
 */
export const searchUnits = (query: string, limit = 10): UnitPreset[] => {
  const q = normalize(query.trim());
  if (!q) return [];
  const rank = (unit: UnitPreset): number => {
    const names = [normalize(unit.name), normalize(unit.nameEn)];
    if (names.some((n) => n.startsWith(q))) return 0;
    if (names.some((n) => n.split(/[\s-]+/).some((w) => w.startsWith(q)))) return 1;
    if (names.some((n) => n.includes(q))) return 2;
    return -1;
  };
  return UNITS.map((unit) => ({ unit, rank: rank(unit) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.unit);
};
