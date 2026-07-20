import { useState } from 'react';
import { useI18n } from '../LangContext';
import { heroTextDescription, heroTextName } from '../heroes';
import { SPELLS_BY_ID, clampSpellLevel } from '../spells';
import type { SpellEffectPick } from '../spellEffects';
import { usesSpellPower } from '../spellEffects';
import { NumberField } from './NumberField';
import { SpellSearchModal } from './SpellSearchModal';

interface EffectListProps {
  idPrefix: string;
  /** Наложенные на отряд эффекты */
  effects: SpellEffectPick[];
  onChange: (next: SpellEffectPick[]) => void;
}

/**
 * Блок «Эффекты» отряда: список наложенных заклинаний с уровнем изучения
 * (и силой магии кастера — для эффектов, чья формула её использует) и
 * кнопка добавления с модальным окном поиска. Вклад эффектов виден в
 * формуле расчёта отдельными слагаемыми.
 */
export function EffectList({ idPrefix, effects, onChange }: EffectListProps) {
  const { lang, t } = useI18n();
  const [adding, setAdding] = useState(false);
  const pickedIds = new Set(effects.map((pick) => pick.spellId));

  const patch = (index: number, changes: Partial<SpellEffectPick>) =>
    onChange(effects.map((pick, i) => (i === index ? { ...pick, ...changes } : pick)));

  return (
    <div className="group">
      <div className="group-title">{t('effects.title')}</div>
      {effects.map((pick, index) => {
        const spell = SPELLS_BY_ID.get(pick.spellId);
        if (!spell) return null;
        const levelText = spell.levels[pick.level - 1];
        return (
          <div className="skill-row" key={pick.spellId}>
            <div className="skill-row-head">
              <span
                className="effect-name"
                title={heroTextDescription(spell.levels[0], lang)}
              >
                {heroTextName(spell, lang)}
              </span>
              <select
                aria-label={t('effects.level')}
                title={levelText ? heroTextDescription(levelText, lang) : undefined}
                value={pick.level}
                onChange={(e) => patch(index, { level: clampSpellLevel(Number(e.target.value)) })}
              >
                {spell.levels.map((text, i) => (
                  <option key={i} value={i + 1} title={heroTextDescription(text, lang)}>
                    {t('effects.levelOption', { n: i + 1 })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="unit-search-toggle"
                aria-label={t('effects.remove')}
                title={t('effects.remove')}
                onClick={() => onChange(effects.filter((_, i) => i !== index))}
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
            {usesSpellPower(pick.spellId) && (
              <NumberField
                id={`${idPrefix}-effect-${pick.spellId}-power`}
                label={t('effects.spellPower')}
                value={pick.spellPower}
                min={0}
                onChange={(value) => patch(index, { spellPower: value })}
              />
            )}
          </div>
        );
      })}
      <div className="skill-add-row">
        <button type="button" className="skill-add" onClick={() => setAdding(true)}>
          {t('effects.add')}
        </button>
      </div>
      {adding && (
        <SpellSearchModal
          idPrefix={idPrefix}
          exclude={pickedIds}
          onPick={(spell) => onChange([...effects, { spellId: spell.id, level: 1, spellPower: 0 }])}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
