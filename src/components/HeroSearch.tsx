import { useEffect, useState } from 'react';
import { useI18n } from '../LangContext';
import type { GameHero } from '../heroes';
import { heroName } from '../heroes';
import { searchHeroes } from '../heroSearch';

interface HeroSearchProps {
  idPrefix: string;
  onPick: (hero: GameHero) => void;
  onClose: () => void;
}

/** Поле поиска героя по имени с выпадающим списком подсказок */
export function HeroSearch({ idPrefix, onPick, onClose }: HeroSearchProps) {
  const { lang, t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = searchHeroes(query);

  const optionId = (hero: GameHero) => `${idPrefix}-hero-search-opt-${hero.id}`;
  const activeOptionId = results[active] ? optionId(results[active]) : undefined;

  // Держим активную опцию видимой при навигации стрелками
  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId]);

  const pick = (hero: GameHero) => {
    onPick(hero);
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
      <label className="field-label" htmlFor={`${idPrefix}-hero-search`}>
        {t('heroPicker.searchLabel')}
      </label>
      <input
        id={`${idPrefix}-hero-search`}
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={`${idPrefix}-hero-search-list`}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        placeholder={t('heroPicker.searchPlaceholder')}
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
          id={`${idPrefix}-hero-search-list`}
        >
          {results.map((hero, i) => (
            <li
              key={hero.id}
              id={optionId(hero)}
              role="option"
              aria-selected={i === active}
              className="unit-search-option"
              // preventDefault: иначе blur инпута закроет список раньше клика
              onMouseDown={(e) => {
                e.preventDefault();
                pick(hero);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <img
                src={`${import.meta.env.BASE_URL}${hero.image}`}
                alt=""
                loading="lazy"
              />
              <span>
                <span className="unit-search-option-name">{heroName(hero, lang)}</span>
                <span className="unit-search-option-sub">
                  {t(`faction.${hero.faction}`)} ·{' '}
                  {lang === 'ru' ? hero.class : hero.classEn || hero.class}
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
