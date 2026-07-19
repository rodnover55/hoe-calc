import { useState } from 'react';
import type { SavedUnit } from '../presets';

interface UnitPresetPanelProps {
  idPrefix: string;
  /** Отряды выбранного пресета героя своей стороны */
  units: SavedUnit[];
  /** id выбранного отряда; null — не выбран */
  selectedId: string | null;
  /** Стек в форме отличается от выбранного сохранённого отряда */
  dirty: boolean;
  /** Имя текущего стека для подписи кнопки добавления */
  currentUnitName: string;
  onAdd: () => void;
  onSelect: (unit: SavedUnit | null) => void;
  onUpdate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/**
 * Отряды пресета героя: по умолчанию виден только комбобокс, выбор в
 * котором применяет сохранённый отряд к стеку. Кнопка ✎ разворачивает
 * редактирование — добавление текущего отряда, пересохранение статов,
 * переименование и удаление с подтверждением.
 */
export function UnitPresetPanel({
  idPrefix,
  units,
  selectedId,
  dirty,
  currentUnitName,
  onAdd,
  onSelect,
  onUpdate,
  onRename,
  onDelete,
}: UnitPresetPanelProps) {
  const selected = units.find((unit) => unit.id === selectedId) ?? null;
  const [editing, setEditing] = useState(false);

  const confirmDelete = () => {
    if (!selected) return;
    if (window.confirm(`Удалить отряд «${selected.name}»?`)) onDelete();
  };

  return (
    <>
      <div className="preset-head">
        <div className="field">
          <select
            id={`${idPrefix}-saved-unit`}
            aria-label="Отряд из пресета"
            value={selectedId ?? ''}
            onChange={(e) =>
              onSelect(
                e.target.value ? (units.find((unit) => unit.id === e.target.value) ?? null) : null,
              )
            }
          >
            <option value="">— не выбран —</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.id === selectedId && dirty ? `${unit.name} *` : unit.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={editing ? 'preset-edit-toggle preset-edit-toggle--active' : 'preset-edit-toggle'}
          aria-expanded={editing}
          aria-label="Редактировать отряды пресета"
          title="Редактировать отряды пресета"
          onClick={() => setEditing(!editing)}
        >
          ✎
        </button>
      </div>
      {editing && (
        <>
          <div className="preset-actions">
            <button type="button" onClick={onAdd}>
              Добавить отряд ({currentUnitName})
            </button>
            {selected && (
              <>
                <button type="button" disabled={!dirty} onClick={onUpdate}>
                  Обновить
                </button>
                <button type="button" onClick={confirmDelete}>
                  Удалить
                </button>
              </>
            )}
          </div>
          {selected && (
            <div className="field">
              <label className="field-label" htmlFor={`${idPrefix}-saved-unit-name`}>
                Название
              </label>
              <input
                id={`${idPrefix}-saved-unit-name`}
                type="text"
                value={selected.name}
                onChange={(e) => onRename(e.target.value)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
