import { useState } from 'react';
import { useI18n } from '../LangContext';
import type { HeroBonusNote } from '../heroEffects';
import { MAX_HERO_LEVEL } from '../heroEffects';
import type { GameHero } from '../heroes';
import { HEROES_BY_ID, heroName, heroTextDescription, heroTextName, heroesOf } from '../heroes';
import type { Faction } from '../units';
import { FACTION_ORDER } from '../units';
import { HeroSearch } from './HeroSearch';
import { NumberField } from './NumberField';

interface HeroPickerProps {
  idPrefix: string;
  /** id выбранного героя; null — ручной ввод характеристик */
  selectedId: string | null;
  level: number;
  notes: HeroBonusNote[];
  onSelect: (hero: GameHero | null) => void;
  onLevelChange: (level: number) => void;
}

/** Фракции, у которых есть герои (у нейтралов героев нет) */
const HERO_FACTIONS = FACTION_ORDER.filter((faction) => heroesOf(faction).length > 0);

export function HeroPicker({
  idPrefix,
  selectedId,
  level,
  notes,
  onSelect,
  onLevelChange,
}: HeroPickerProps) {
  const { lang, t } = useI18n();
  const selected = selectedId ? HEROES_BY_ID.get(selectedId) : undefined;
  // Фракция выводится из выбранного героя (в том числе восстановленного из
  // ссылки); своё состояние нужно только режиму ручного ввода.
  const [manualFaction, setManualFaction] = useState<Faction | ''>('');
  const [searching, setSearching] = useState(false);

  // Родитель может сбросить выбор извне (кнопка обмена сторон); без сброса
  // фракции пикер показывал бы список героев, где ничего не выбрано.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (!selectedId) setManualFaction('');
  }

  const faction = selected ? selected.faction : manualFaction;
  const heroes = faction ? heroesOf(faction) : [];

  const pickFaction = (next: string) => {
    setManualFaction(next as Faction | '');
    const first = next ? heroesOf(next as Faction)[0] : undefined;
    onSelect(first ?? null);
  };

  const pickHero = (id: string) => {
    onSelect(id ? (HEROES_BY_ID.get(id) ?? null) : null);
  };

  const className = selected
    ? lang === 'ru'
      ? selected.class
      : selected.classEn || selected.class
    : '';

  return (
    <div className="unit-picker">
      {searching ? (
        <HeroSearch
          idPrefix={idPrefix}
          onPick={onSelect}
          onClose={() => setSearching(false)}
        />
      ) : (
        <div className="unit-picker-head">
          <div className="unit-picker-row">
            <div className="field">
              <label className="field-label" htmlFor={`${idPrefix}-hero-faction`}>
                {t('picker.faction')}
              </label>
              <select
                id={`${idPrefix}-hero-faction`}
                value={faction}
                onChange={(e) => pickFaction(e.target.value)}
              >
                <option value="">{t('picker.manual')}</option>
                {HERO_FACTIONS.map((f) => (
                  <option key={f} value={f}>
                    {t(`faction.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            {faction && (
              <div className="field">
                <label className="field-label" htmlFor={`${idPrefix}-hero`}>
                  {t('heroPicker.hero')}
                </label>
                <select
                  id={`${idPrefix}-hero`}
                  value={selected?.id ?? ''}
                  onChange={(e) => pickHero(e.target.value)}
                >
                  {heroes.map((hero) => (
                    <option key={hero.id} value={hero.id}>
                      {heroName(hero, lang)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            type="button"
            className="unit-search-toggle"
            aria-label={t('heroPicker.search')}
            title={t('heroPicker.search')}
            onClick={() => setSearching(true)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.5 10.5 14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
      {selected && (
        <div className="unit-preview">
          <img
            src={`${import.meta.env.BASE_URL}${selected.image}`}
            alt={heroName(selected, lang)}
            loading="lazy"
          />
          <div className="unit-preview-info">
            <div className="unit-preview-name">{heroName(selected, lang)}</div>
            <div className="unit-preview-sub">
              {lang === 'ru' ? selected.nameEn : selected.name}
            </div>
            <div className="unit-preview-sub">
              {t(`faction.${selected.faction}`)} · {className}
            </div>
            <div className="unit-preview-sub">
              {t('heroPicker.specialization')}:{' '}
              {heroTextName(selected.specialization, lang)}
            </div>
          </div>
        </div>
      )}
      {selected && (
        <NumberField
          id={`${idPrefix}-hero-level`}
          label={t('fields.heroLevel')}
          value={level}
          min={1}
          max={MAX_HERO_LEVEL}
          onChange={onLevelChange}
        />
      )}
      {selected && (
        <details className="unit-abilities">
          <summary>
            {t('heroPicker.specialization')} · {t('heroPicker.skills')} (
            {selected.skills.length})
          </summary>
          <ul>
            <li>
              <strong>{heroTextName(selected.specialization, lang)}</strong>
              {' — '}
              {heroTextDescription(selected.specialization, lang)}
            </li>
            {selected.skills.map((skill) => (
              <li key={skill.id}>
                <strong>{heroTextName(skill, lang)}</strong>
                {heroTextDescription(skill, lang)
                  ? ` — ${heroTextDescription(skill, lang)}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {selected &&
        notes.map((note) => (
          <p className="mode-note" key={note.source}>
            {note.applied
              ? t('heroBonus.applied', { source: note.source, text: note.text })
              : t('heroBonus.info', { source: note.source })}
          </p>
        ))}
    </div>
  );
}
