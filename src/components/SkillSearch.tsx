import { useEffect, useState } from 'react';
import { useI18n } from '../LangContext';
import { heroTextName } from '../heroes';
import type { Skill } from '../skills';
import { searchSkills } from '../skillSearch';

interface SkillSearchProps {
  idPrefix: string;
  /** id навыков, уже добавленных герою: в подсказки не попадают */
  exclude: ReadonlySet<string>;
  onPick: (skill: Skill) => void;
  onClose: () => void;
}

/** Поле поиска навыка по названию с выпадающим списком подсказок */
export function SkillSearch({ idPrefix, exclude, onPick, onClose }: SkillSearchProps) {
  const { lang, t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = searchSkills(query, 10, exclude);

  const optionId = (skill: Skill) => `${idPrefix}-skill-search-opt-${skill.id}`;
  const activeOptionId = results[active] ? optionId(results[active]) : undefined;

  // Держим активную опцию видимой при навигации стрелками
  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId]);

  const pick = (skill: Skill) => {
    onPick(skill);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) pick(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="unit-search field">
      <label className="field-label" htmlFor={`${idPrefix}-skill-search`}>
        {t('heroSkills.searchLabel')}
      </label>
      <input
        id={`${idPrefix}-skill-search`}
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={`${idPrefix}-skill-search-list`}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        placeholder={t('heroSkills.searchPlaceholder')}
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={onClose}
      />
      {query.trim() !== '' && (
        <ul
          className="unit-search-list"
          role="listbox"
          id={`${idPrefix}-skill-search-list`}
        >
          {results.map((skill, i) => (
            <li
              key={skill.id}
              id={optionId(skill)}
              role="option"
              aria-selected={i === active}
              className="unit-search-option"
              // preventDefault: иначе blur инпута закроет список раньше клика
              onMouseDown={(e) => {
                e.preventDefault();
                pick(skill);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>
                <span className="unit-search-option-name">{heroTextName(skill, lang)}</span>
                <span className="unit-search-option-sub">
                  {heroTextName(skill.levels[0], lang)}
                </span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="unit-search-empty">{t('search.empty')}</li>
          )}
        </ul>
      )}
    </div>
  );
}
