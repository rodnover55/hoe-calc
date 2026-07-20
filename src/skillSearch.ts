import { rankByName } from './search';
import type { Skill } from './skills';
import { SKILLS } from './skills';

/**
 * Ищет навыки по базовому имени и названиям уровней на обоих языках:
 * базовое имя и имя уровня различаются («Атака» — «Основы нападения»),
 * пользователь может печатать любое. Навыки из exclude (уже добавленные
 * в список героя) не предлагаются.
 */
export const searchSkills = (
  query: string,
  limit = 10,
  exclude: ReadonlySet<string> = new Set(),
): Skill[] =>
  rankByName(
    SKILLS.filter((skill) => !exclude.has(skill.id)),
    (skill) => [
      skill.name,
      skill.nameEn,
      ...skill.levels.flatMap((level) => [level.name, level.nameEn]),
    ],
    query,
    limit,
  );
