import { useState } from 'react';
import { useI18n } from '../LangContext';
import type { HeroBonusNote, SkillPick } from '../heroEffects';
import { MAX_HERO_LEVEL } from '../heroEffects';
import type { GameHero } from '../heroes';
import { HEROES_BY_ID, heroName, heroTextDescription, heroTextName, heroesOf } from '../heroes';
import type { Skill } from '../skills';
import { SKILLS, SKILLS_BY_ID, clampSkillLevel, normalizeMods, subskillsFor } from '../skills';
import type { Faction } from '../units';
import { FACTION_ORDER } from '../units';
import { HeroSearch } from './HeroSearch';
import { NumberField } from './NumberField';
import { SkillSearch } from './SkillSearch';

interface HeroPickerProps {
  idPrefix: string;
  /** id выбранного героя; null — ручной ввод характеристик */
  selectedId: string | null;
  level: number;
  /** Навыки героя; редактируются только при выбранном герое */
  skills: SkillPick[];
  notes: HeroBonusNote[];
  onSelect: (hero: GameHero | null) => void;
  onLevelChange: (level: number) => void;
  onSkillsChange: (skills: SkillPick[]) => void;
}

/** Фракции, у которых есть герои (у нейтралов героев нет) */
const HERO_FACTIONS = FACTION_ORDER.filter((faction) => heroesOf(faction).length > 0);

export function HeroPicker({
  idPrefix,
  selectedId,
  level,
  skills,
  notes,
  onSelect,
  onLevelChange,
  onSkillsChange,
}: HeroPickerProps) {
  const { lang, t } = useI18n();
  const selected = selectedId ? HEROES_BY_ID.get(selectedId) : undefined;

  /** Навыки каталога, ещё не занятые другими строками списка */
  const freeSkills = (current?: string): Skill[] =>
    SKILLS.filter(
      (skill) => skill.id === current || !skills.some((pick) => pick.id === skill.id),
    );

  const replaceSkill = (index: number, next: SkillPick) =>
    onSkillsChange(skills.map((pick, i) => (i === index ? next : pick)));

  const pickSkill = (index: number, id: string) => {
    const pick = skills[index];
    replaceSkill(index, { id, level: pick.level, mods: [] });
  };

  const pickSkillLevel = (index: number, raw: string) => {
    const pick = skills[index];
    const skill = SKILLS_BY_ID.get(pick.id);
    const next = clampSkillLevel(Number(raw));
    if (!skill) return;
    // Понижение уровня отбрасывает поднавыки, недоступные на нём.
    replaceSkill(index, { ...pick, level: next, mods: normalizeMods(skill, next, pick.mods) });
  };

  const toggleMod = (index: number, modId: string) => {
    const pick = skills[index];
    const skill = SKILLS_BY_ID.get(pick.id);
    if (!skill) return;
    const next = pick.mods.includes(modId)
      ? pick.mods.filter((id) => id !== modId)
      : [...pick.mods, modId];
    replaceSkill(index, { ...pick, mods: normalizeMods(skill, pick.level, next) });
  };

  const addSkill = (id?: string) => {
    const next = id ?? freeSkills()[0]?.id;
    if (next) onSkillsChange([...skills, { id: next, level: 1, mods: [] }]);
  };

  const removeSkill = (index: number) =>
    onSkillsChange(skills.filter((_, i) => i !== index));

  const [skillSearching, setSkillSearching] = useState(false);
  const pickedSkillIds = new Set(skills.map((p) => p.id));
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
          <summary>{t('heroPicker.specialization')}</summary>
          <ul>
            <li>
              <strong>{heroTextName(selected.specialization, lang)}</strong>
              {' — '}
              {heroTextDescription(selected.specialization, lang)}
            </li>
          </ul>
        </details>
      )}
      {selected && (
        <div className="skill-list">
          <div className="field-label">{t('heroSkills.title')}</div>
          {skills.map((pick, index) => {
            const skill = SKILLS_BY_ID.get(pick.id);
            if (!skill) return null;
            const levelText = skill.levels[pick.level - 1];
            const subs = subskillsFor(skill, pick.level);
            return (
              <div className="skill-row" key={pick.id}>
                <div className="skill-row-head">
                  <select
                    aria-label={t('heroSkills.skill')}
                    value={pick.id}
                    onChange={(e) => pickSkill(index, e.target.value)}
                  >
                    {freeSkills(pick.id).map((option) => (
                      <option key={option.id} value={option.id}>
                        {heroTextName(option, lang)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('heroSkills.level')}
                    title={levelText ? heroTextDescription(levelText, lang) : undefined}
                    value={pick.level}
                    onChange={(e) => pickSkillLevel(index, e.target.value)}
                  >
                    {skill.levels.map((text, i) => (
                      <option key={i} value={i + 1} title={heroTextDescription(text, lang)}>
                        {heroTextName(text, lang)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="unit-search-toggle"
                    aria-label={t('heroSkills.remove')}
                    title={t('heroSkills.remove')}
                    onClick={() => removeSkill(index)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M4 4 12 12M12 4 4 12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                {subs.length > 0 && (
                  <div className="skill-mods">
                    {subs.map((sub) => (
                      <label
                        className="checkbox"
                        key={sub.id}
                        title={heroTextDescription(sub, lang)}
                      >
                        <input
                          type="checkbox"
                          checked={pick.mods.includes(sub.id)}
                          onChange={() => toggleMod(index, sub.id)}
                        />
                        {heroTextName(sub, lang)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {freeSkills().length > 0 &&
            (skillSearching ? (
              <SkillSearch
                idPrefix={idPrefix}
                exclude={pickedSkillIds}
                onPick={(skill) => addSkill(skill.id)}
                onClose={() => setSkillSearching(false)}
              />
            ) : (
              <div className="skill-add-row">
                <button type="button" className="skill-add" onClick={() => addSkill()}>
                  {t('heroSkills.add')}
                </button>
                <button
                  type="button"
                  className="unit-search-toggle"
                  aria-label={t('heroSkills.search')}
                  title={t('heroSkills.search')}
                  onClick={() => setSkillSearching(true)}
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
            ))}
        </div>
      )}
      {selected &&
        notes
          .filter((note) => note.applied)
          .map((note, index) => (
            <p className="mode-note" key={index}>
              {t('heroBonus.applied', { source: note.source, text: note.text })}
            </p>
          ))}
    </div>
  );
}
