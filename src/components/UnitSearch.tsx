import { useEffect, useState } from 'react';
import type { UnitPreset } from '../units';
import { FACTION_LABEL, GRADE_LABEL } from '../units';
import { searchUnits } from '../unitSearch';

interface UnitSearchProps {
  idPrefix: string;
  onPick: (unit: UnitPreset) => void;
  onClose: () => void;
}

/** Поле поиска юнита по названию с выпадающим списком подсказок */
export function UnitSearch({ idPrefix, onPick, onClose }: UnitSearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = searchUnits(query);

  const optionId = (unit: UnitPreset) => `${idPrefix}-unit-search-opt-${unit.id}`;
  const activeOptionId = results[active] ? optionId(results[active]) : undefined;

  // Держим активную опцию видимой при навигации стрелками
  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId]);

  const pick = (unit: UnitPreset) => {
    onPick(unit);
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
      <label className="field-label" htmlFor={`${idPrefix}-unit-search`}>
        Поиск юнита
      </label>
      <input
        id={`${idPrefix}-unit-search`}
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={`${idPrefix}-unit-search-list`}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        placeholder="Название юнита…"
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
          id={`${idPrefix}-unit-search-list`}
        >
          {results.map((unit, i) => (
            <li
              key={unit.id}
              id={optionId(unit)}
              role="option"
              aria-selected={i === active}
              className="unit-search-option"
              // preventDefault: иначе blur инпута закроет список раньше клика
              onMouseDown={(e) => {
                e.preventDefault();
                pick(unit);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <img
                src={`${import.meta.env.BASE_URL}${unit.image}`}
                alt=""
                loading="lazy"
              />
              <span>
                <span className="unit-search-option-name">{unit.name}</span>
                <span className="unit-search-option-sub">
                  {FACTION_LABEL[unit.faction]} · Тир {unit.tier}
                  {unit.grade > 0 ? ` · ${GRADE_LABEL[unit.grade]}` : ''}
                </span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="unit-search-empty">Ничего не найдено</li>
          )}
        </ul>
      )}
    </div>
  );
}
