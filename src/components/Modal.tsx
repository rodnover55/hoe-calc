import { useEffect, useRef } from 'react';
import { useI18n } from '../LangContext';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Модальное окно на нативном <dialog>: showModal даёт ловушку фокуса,
 * закрытие по Esc и подложку ::backdrop без сторонних зависимостей.
 * Клик по подложке тоже закрывает: цель такого клика — сам dialog,
 * потому что содержимое перехватывает клики раньше.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  // showModal ставит фокус сам, поэтому реактовский autoFocus детей не
  // срабатывает: после открытия фокус переводится на [data-autofocus].
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div className="group-title">{title}</div>
        <button
          type="button"
          className="unit-search-toggle"
          aria-label={t('modal.close')}
          title={t('modal.close')}
          onClick={onClose}
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
      {children}
    </dialog>
  );
}
