import { useState } from 'react';
import type { Faction, UnitPreset } from '../units';
import {
  ATTACK_TYPE_LABEL,
  FACTION_LABEL,
  FACTION_ORDER,
  UNITS_BY_ID,
  baseUnits,
  gradesOf,
} from '../units';

interface UnitPickerProps {
  idPrefix: string;
  /** id выбранного юнита; null — ручной ввод */
  selectedId: string | null;
  onSelect: (unit: UnitPreset | null) => void;
}

const GRADE_LABEL = ['База', 'Улучшение I', 'Улучшение II'];

export function UnitPicker({ idPrefix, selectedId, onSelect }: UnitPickerProps) {
  const selected = selectedId ? UNITS_BY_ID.get(selectedId) : undefined;
  const [faction, setFaction] = useState<Faction | ''>(selected?.faction ?? '');

  const units = faction ? baseUnits(faction) : [];
  const grades = selected ? gradesOf(selected) : [];
  const baseId = selected ? (selected.upgradeOf ?? selected.id) : '';

  const pickFaction = (next: string) => {
    setFaction(next as Faction | '');
    const first = next ? baseUnits(next as Faction)[0] : undefined;
    onSelect(first ?? null);
  };

  const pickUnit = (id: string) => {
    onSelect(id ? (UNITS_BY_ID.get(id) ?? null) : null);
  };

  return (
    <div className="unit-picker">
      <div className="unit-picker-row">
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-faction`}>
            Фракция
          </label>
          <select
            id={`${idPrefix}-faction`}
            value={faction}
            onChange={(e) => pickFaction(e.target.value)}
          >
            <option value="">— вручную —</option>
            {FACTION_ORDER.map((f) => (
              <option key={f} value={f}>
                {FACTION_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        {faction && (
          <div className="field">
            <label className="field-label" htmlFor={`${idPrefix}-unit`}>
              Юнит
            </label>
            <select
              id={`${idPrefix}-unit`}
              value={baseId}
              onChange={(e) => pickUnit(e.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {selected && grades.length > 1 && (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-grade`}>
            Грейд
          </label>
          <select
            id={`${idPrefix}-grade`}
            value={selected.id}
            onChange={(e) => pickUnit(e.target.value)}
          >
            {grades.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {GRADE_LABEL[unit.grade] ?? `Улучшение ${unit.grade}`} — {unit.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected && (
        <div className="unit-preview">
          <img
            src={`${import.meta.env.BASE_URL}${selected.image}`}
            alt={selected.name}
            loading="lazy"
          />
          <div className="unit-preview-info">
            <div className="unit-preview-name">{selected.name}</div>
            <div className="unit-preview-sub">{selected.nameEn}</div>
            <div className="unit-preview-sub">
              Тир {selected.tier} · {ATTACK_TYPE_LABEL[selected.attackType]}
              {selected.flying ? ' · летает' : ''}
            </div>
            <div className="unit-preview-sub">
              Инициатива {selected.stats.initiative} · Скорость {selected.stats.speed}
            </div>
          </div>
        </div>
      )}
      {selected && (selected.abilities?.length ?? 0) > 0 && (
        <details className="unit-abilities">
          <summary>Способности ({selected.abilities?.length})</summary>
          <ul>
            {selected.abilities?.map((ability) => (
              <li key={ability.id}>
                <strong>{ability.name}</strong>
                {ability.description ? ` — ${ability.description}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
