import { useEffect, useState } from 'react';
import { useI18n } from '../LangContext';
import { heroTextDescription, heroTextName } from '../heroes';
import type { Spell } from '../spells';
import { searchSpells } from '../spellSearch';
import { Modal } from './Modal';

interface SpellSearchModalProps {
  idPrefix: string;
  /** id заклинаний, уже наложенных на отряд: в подсказки не попадают */
  exclude: ReadonlySet<string>;
  onPick: (spell: Spell) => void;
  onClose: () => void;
}

/** Модальное окно выбора эффекта: поиск заклинания по названию */
export function SpellSearchModal({ idPrefix, exclude, onPick, onClose }: SpellSearchModalProps) {
  const { lang, t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = searchSpells(query, 10, exclude);

  const optionId = (spell: Spell) => `${idPrefix}-spell-search-opt-${spell.id}`;
  const activeOptionId = results[active] ? optionId(results[active]) : undefined;

  // Держим активную опцию видимой при навигации стрелками
  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId]);

  const pick = (spell: Spell) => {
    onPick(spell);
    onClose();
  };

  // Escape не обрабатывается: закрытие по Esc даёт сам <dialog>
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
    }
  };

  return (
    <Modal title={t('effects.modalTitle')} onClose={onClose}>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-spell-search`}>
          {t('effects.searchLabel')}
        </label>
        <input
          id={`${idPrefix}-spell-search`}
          type="text"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={`${idPrefix}-spell-search-list`}
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          placeholder={t('effects.searchPlaceholder')}
          data-autofocus=""
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {query.trim() !== '' && (
        <ul
          className="unit-search-list modal-search-list"
          role="listbox"
          id={`${idPrefix}-spell-search-list`}
        >
          {results.map((spell, i) => (
            <li
              key={spell.id}
              id={optionId(spell)}
              role="option"
              aria-selected={i === active}
              className="unit-search-option"
              title={heroTextDescription(spell.levels[0], lang)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(spell);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <img src={`${import.meta.env.BASE_URL}${spell.image}`} alt="" loading="lazy" />
              <span>
                <span className="unit-search-option-name">{heroTextName(spell, lang)}</span>
                <span className="unit-search-option-sub">
                  {t(`school.${spell.school}`)} · {t('picker.tier')} {spell.tier}
                </span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="unit-search-empty">{t('search.empty')}</li>
          )}
        </ul>
      )}
    </Modal>
  );
}
