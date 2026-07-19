/**
 * Кодек состояния калькулятора для шаринга ссылкой.
 *
 * Все задаваемые пользователем параметры — статы обоих отрядов, условия
 * атаки, режим и выбранные юниты — упаковываются в компактный JSON и
 * кодируются в base64url для query-параметра `s`. Декодер никогда не
 * роняет приложение: битая строка даёт null (вызывающий берёт дефолты),
 * неизвестный юнит сбрасывается в ручной ввод с сохранением статов,
 * недопустимый режим заменяется первым доступным.
 */

import type { AttackAbilities, AttackerStats, DefenderStats } from './formula';
import { attackModesFor } from './abilityEffects';
import { UNITS_BY_ID } from './units';

/** Условия атаки, задаваемые в форме; остальное выводится из режима */
export type AttackParams = Omit<AttackAbilities, 'rangePenalty' | 'modeMultiplier' | 'doubleStrike'>;

/** Всё состояние калькулятора, попадающее в ссылку */
export interface AppUrlState {
  attacker: AttackerStats;
  defender: DefenderStats;
  attack: AttackParams;
  modeId: string;
  attackerUnitId: string | null;
  defenderUnitId: string | null;
}

/** Имя query-параметра с закодированным состоянием */
export const SHARE_PARAM = 's';

/** Порядок статов отряда в массивах wire-формата */
const STAT_KEYS = [
  'count',
  'health',
  'topHealth',
  'damageMin',
  'damageMax',
  'attack',
  'defense',
  'heroAttack',
  'heroDefense',
] as const;

/** Wire-формат версии 1; при изменении набора полей заводится версия 2 */
interface ShareV1 {
  v: 1;
  /** Статы атакующего в порядке STAT_KEYS */
  a: number[];
  /** Статы защитника в порядке STAT_KEYS */
  d: number[];
  /** distance, generalModifiers, typeModifiers, retaliation (0/1) */
  x: [number, number, number, 0 | 1];
  /** id режима атаки */
  m: string;
  /** id юнита атакующего; нет — ручной ввод */
  au?: string;
  /** id юнита защитника; нет — ручной ввод */
  du?: string;
}

/** JSON → base64url: алфавит A-Za-z0-9-_ без набивки, юникод-безопасно */
const toBase64Url = (json: string): string => {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** base64url → JSON; на битой строке бросает исключение */
const fromBase64Url = (encoded: string): string => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Массив статов отряда: ровно 9 конечных чисел */
const isStatsArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === STAT_KEYS.length &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Массив wire-формата → объект статов отряда */
const toStats = (values: number[]): AttackerStats => {
  const stats = {} as AttackerStats;
  STAT_KEYS.forEach((key, index) => {
    stats[key] = values[index];
  });
  return stats;
};

/** id юнита из ссылки: неизвестный или нестроковый — ручной ввод */
const toUnitId = (id: unknown): string | null =>
  typeof id === 'string' && UNITS_BY_ID.has(id) ? id : null;

/**
 * Упаковывает состояние калькулятора в base64url-строку для параметра
 * `s`. Результат содержит только символы `A-Za-z0-9-_` и вставляется в
 * query без экранирования.
 */
export function encodeAppState(state: AppUrlState): string {
  const payload: ShareV1 = {
    v: 1,
    a: STAT_KEYS.map((key) => state.attacker[key]),
    d: STAT_KEYS.map((key) => state.defender[key]),
    x: [
      state.attack.distance,
      state.attack.generalModifiers,
      state.attack.typeModifiers,
      state.attack.retaliation ? 1 : 0,
    ],
    m: state.modeId,
  };
  if (state.attackerUnitId) payload.au = state.attackerUnitId;
  if (state.defenderUnitId) payload.du = state.defenderUnitId;
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Разбирает строку параметра `s` обратно в состояние калькулятора.
 *
 * Повреждённая или структурно неверная строка даёт null. Частично
 * устаревшая ссылка деградирует мягко: пропавший из базы юнит заменяется
 * ручным вводом с сохранением числовых статов, недопустимый для юнита
 * режим — первым из его списка.
 *
 * @param raw значение query-параметра или null, если его нет.
 * @returns восстановленное состояние либо null.
 */
export function decodeAppState(raw: string | null | undefined): AppUrlState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const share = parsed as Partial<ShareV1>;
    if (share.v !== 1 || !isStatsArray(share.a) || !isStatsArray(share.d)) return null;
    if (typeof share.m !== 'string') return null;
    const x: unknown = share.x;
    if (
      !Array.isArray(x) ||
      x.length !== 4 ||
      !x.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      return null;
    }

    const attackerUnitId = toUnitId(share.au);
    const defenderUnitId = toUnitId(share.du);
    const attackerUnit = attackerUnitId ? (UNITS_BY_ID.get(attackerUnitId) ?? null) : null;
    const modes = attackModesFor(attackerUnit);
    const requestedMode = share.m;

    return {
      attacker: toStats(share.a),
      defender: toStats(share.d),
      attack: {
        distance: x[0] as number,
        generalModifiers: x[1] as number,
        typeModifiers: x[2] as number,
        retaliation: x[3] === 1,
      },
      modeId: modes.some((mode) => mode.id === requestedMode) ? requestedMode : modes[0].id,
      attackerUnitId,
      defenderUnitId,
    };
  } catch {
    return null;
  }
}
