import { useState } from 'react';
import { useI18n } from '../LangContext';
import type { Faction, UnitPreset } from '../units';
import {
  FACTION_ORDER,
  UNITS_BY_ID,
  abilityDescription,
  abilityName,
  baseUnits,
  gradeLabel,
  gradesOf,
  unitName,
} from '../units';
import { UnitSearch } from './UnitSearch';

interface UnitPickerProps {
  idPrefix: string;
  /** id выбранного юнита; null — ручной ввод */
  selectedId: string | null;
  onSelect: (unit: UnitPreset | null) => void;
}

export function UnitPicker({ idPrefix, selectedId, onSelect }: UnitPickerProps) {
  const { lang, t } = useI18n();
  const selected = selectedId ? UNITS_BY_ID.get(selectedId) : undefined;
  // Фракция выводится из выбранного юнита (в том числе восстановленного из
  // ссылки); своё состояние нужно только режиму ручного ввода.
  const [manualFaction, setManualFaction] = useState<Faction | ''>('');
  const [searching, setSearching] = useState(false);

  // Родитель может сбросить выбор извне (кнопка обмена сторон); без сброса
  // фракции пикер показывал бы список юнитов, где ничего не выбрано.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (!selectedId) setManualFaction('');
  }

  const faction = selected ? selected.faction : manualFaction;

  const units = faction ? baseUnits(faction) : [];
  const grades = selected ? gradesOf(selected) : [];
  const baseId = selected ? (selected.upgradeOf ?? selected.id) : '';

  const pickFaction = (next: string) => {
    setManualFaction(next as Faction | '');
    const first = next ? baseUnits(next as Faction)[0] : undefined;
    onSelect(first ?? null);
  };

  const pickUnit = (id: string) => {
    onSelect(id ? (UNITS_BY_ID.get(id) ?? null) : null);
  };

  return (
    <div className="unit-picker">
      {searching ? (
        <UnitSearch
          idPrefix={idPrefix}
          onPick={onSelect}
          onClose={() => setSearching(false)}
        />
      ) : (
        <div className="unit-picker-head">
          <div className="unit-picker-row">
            <div className="field">
              <label className="field-label" htmlFor={`${idPrefix}-faction`}>
                {t('picker.faction')}
              </label>
              <select
                id={`${idPrefix}-faction`}
                value={faction}
                onChange={(e) => pickFaction(e.target.value)}
              >
                <option value="">{t('picker.manual')}</option>
                {FACTION_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {t(`faction.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            {faction && (
              <div className="field">
                <label className="field-label" htmlFor={`${idPrefix}-unit`}>
                  {t('picker.unit')}
                </label>
                <select
                  id={`${idPrefix}-unit`}
                  value={baseId}
                  onChange={(e) => pickUnit(e.target.value)}
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unitName(unit, lang)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            type="button"
            className="unit-search-toggle"
            aria-label={t('picker.search')}
            title={t('picker.search')}
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
      {selected && grades.length > 1 && (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-grade`}>
            {t('picker.grade')}
          </label>
          <select
            id={`${idPrefix}-grade`}
            value={selected.id}
            onChange={(e) => pickUnit(e.target.value)}
          >
            {grades.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {gradeLabel(unit.grade, lang)} — {unitName(unit, lang)}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected && (
        <div className="unit-preview">
          <img
            src={`${import.meta.env.BASE_URL}${selected.image}`}
            alt={unitName(selected, lang)}
            loading="lazy"
          />
          <div className="unit-preview-info">
            <div className="unit-preview-name">{unitName(selected, lang)}</div>
            <div className="unit-preview-sub">
              {lang === 'ru' ? selected.nameEn : selected.name}
            </div>
            <div className="unit-preview-sub">
              {t('picker.tier')} {selected.tier} · {t(`attackType.${selected.attackType}`)}
              {selected.flying ? ` · ${t('picker.flies')}` : ''}
            </div>
            <div className="unit-preview-sub">
              {t('picker.initiative')} {selected.stats.initiative} · {t('picker.speed')}{' '}
              {selected.stats.speed}
            </div>
          </div>
        </div>
      )}
      {selected && (selected.abilities?.length ?? 0) > 0 && (
        <details className="unit-abilities">
          <summary>
            {t('picker.abilities')} ({selected.abilities?.length})
          </summary>
          <ul>
            {selected.abilities?.map((ability) => (
              <li key={ability.id}>
                <strong>{abilityName(ability, lang)}</strong>
                {abilityDescription(ability, lang)
                  ? ` — ${abilityDescription(ability, lang)}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
