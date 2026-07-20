import { useState } from 'react';
import { useI18n } from '../LangContext';
import type { HeroPreset } from '../presets';

interface HeroPresetPanelProps {
  idPrefix: string;
  /** Общий список пресетов: атакующий и защитник выбирают из одного */
  presets: HeroPreset[];
  /** id выбранного пресета героя; null — без пресета */
  selectedId: string | null;
  /** Статы героя в форме отличаются от сохранённых в пресете */
  dirty: boolean;
  onCreate: () => void;
  onSelect: (preset: HeroPreset | null) => void;
  onUpdate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/**
 * Выбор пресета героя одной стороной из общего списка: по умолчанию
 * виден только комбобокс выбора, кнопка ✎ разворачивает редактирование —
 * сохранение, обновление, переименование и удаление с подтверждением.
 */
export function HeroPresetPanel({
  idPrefix,
  presets,
  selectedId,
  dirty,
  onCreate,
  onSelect,
  onUpdate,
  onRename,
  onDelete,
}: HeroPresetPanelProps) {
  const { t } = useI18n();
  const selected = presets.find((preset) => preset.id === selectedId) ?? null;
  const [editing, setEditing] = useState(false);

  const confirmDelete = () => {
    if (!selected) return;
    if (window.confirm(t('heroPreset.confirmDelete', { name: selected.name }))) onDelete();
  };

  return (
    <div className="group">
      <div className="group-title">{t('heroPreset.title')}</div>
      <div className="preset-head">
        <div className="field">
          <select
            id={`${idPrefix}-hero-preset`}
            aria-label={t('heroPreset.select')}
            value={selectedId ?? ''}
            onChange={(e) =>
              onSelect(
                e.target.value
                  ? (presets.find((preset) => preset.id === e.target.value) ?? null)
                  : null,
              )
            }
          >
            <option value="">{t('heroPreset.none')}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.id === selectedId && dirty ? `${preset.name} *` : preset.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={editing ? 'preset-edit-toggle preset-edit-toggle--active' : 'preset-edit-toggle'}
          aria-expanded={editing}
          aria-label={t('heroPreset.edit')}
          title={t('heroPreset.edit')}
          onClick={() => setEditing(!editing)}
        >
          ✎
        </button>
      </div>
      {editing && (
        <>
          <div className="preset-actions">
            <button type="button" onClick={onCreate}>
              {t('heroPreset.save')}
            </button>
            {selected && (
              <>
                <button type="button" disabled={!dirty} onClick={onUpdate}>
                  {t('common.update')}
                </button>
                <button type="button" onClick={confirmDelete}>
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
          {selected && (
            <div className="field">
              <label className="field-label" htmlFor={`${idPrefix}-hero-preset-name`}>
                {t('common.name')}
              </label>
              <input
                id={`${idPrefix}-hero-preset-name`}
                type="text"
                value={selected.name}
                onChange={(e) => onRename(e.target.value)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
