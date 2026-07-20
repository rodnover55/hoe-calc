import { rankByName } from './search';
import type { UnitPreset } from './units';
import { UNITS } from './units';

/**
 * Ищет юниты по русскому и английскому названию. Каждый грейд — отдельный
 * юнит со своим именем, поэтому «Храмовый грифон» находит именно грейд 1.
 * Внутри ранга сохраняется порядок UNITS (фракция → тир → грейд).
 */
export const searchUnits = (query: string, limit = 10): UnitPreset[] =>
  rankByName(UNITS, (unit) => [unit.name, unit.nameEn], query, limit);
