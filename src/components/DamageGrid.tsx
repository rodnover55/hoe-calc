import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { Luck } from '../formula';
import { useI18n } from '../LangContext';

/** Строка таблицы: подпись слева и одна ячейка на колонку */
export interface DamageGridRow<T> {
  label: string;
  render: (data: T) => ReactNode;
}

/**
 * Колонка таблицы. `data === null` — считать нечего (отряд уничтожен
 * предыдущим ударом), вместо значений выводится `note`.
 */
export interface DamageGridColumn<T> {
  key: string;
  /** Степень удачи; null — колонка без иконки (урон способности) */
  luck: Luck | null;
  /** Подпись вместо иконки — режим атаки у карточки способности */
  label?: string;
  data: T | null;
  note?: string;
}

interface DamageGridProps<T> {
  columns: DamageGridColumn<T>[];
  rows: DamageGridRow<T>[];
}

/** Иконка удачи: клевер с olden-era.com, у неудачи — обесцвеченный */
function LuckIcon({ luck }: { luck: Luck }) {
  const { t } = useI18n();
  const name = t(`luck.${luck}`);
  const icon = luck === 'normal' ? 'attack' : 'luck';
  return (
    <img
      className={`damage-icon damage-icon--${luck}`}
      src={`${import.meta.env.BASE_URL}stats/${icon}.webp`}
      alt={name}
      title={name}
      loading="lazy"
    />
  );
}

/**
 * Показатели удара таблицей: колонки — варианты удачи, строки — урон,
 * погибшие и прочее. Колонки общие на всю карточку, поэтому значения
 * одной строки читаются в сравнении друг с другом.
 */
export function DamageGrid<T>({ columns, rows }: DamageGridProps<T>) {
  return (
    <div
      className="damage-grid"
      style={{ gridTemplateColumns: `auto repeat(${columns.length}, 1fr)` }}
    >
      <div />
      {columns.map((column) => (
        <div className="damage-grid-head" key={column.key}>
          {column.luck ? <LuckIcon luck={column.luck} /> : column.label}
        </div>
      ))}
      {rows.map((row, index) => (
        <Fragment key={row.label}>
          <div className="damage-grid-label">{row.label}</div>
          {columns.map((column) => (
            <div
              className={
                `damage-grid-cell damage-grid-cell--${column.luck ?? 'plain'}` +
                // Первая строка карточки — урон, она крупнее остальных.
                (index === 0 ? ' damage-grid-cell--main' : '')
              }
              key={column.key}
            >
              {column.data !== null ? (
                row.render(column.data)
              ) : index === 0 ? (
                // Уничтоженный отряд объясняется один раз, дальше прочерки.
                <span className="damage-grid-note">{column.note}</span>
              ) : (
                '—'
              )}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
