import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { AttackerStats, DamageStep, DefenderStats, Luck } from './formula';
import { calculateAbilityDamage, calculateDamage } from './formula';
import type { AttackMode } from './abilityEffects';
import { attackModesFor, damageReduction, defaultRetaliation, doubleStrikeFor } from './abilityEffects';
import { HeroPresetPanel } from './components/HeroPresetPanel';
import { NumberField } from './components/NumberField';
import { UnitPicker } from './components/UnitPicker';
import { UnitPresetPanel } from './components/UnitPresetPanel';
import type { HeroPreset, PresetSelection, PresetStore, SavedUnit } from './presets';
import {
  EMPTY_SELECTION,
  EMPTY_STORE,
  addHero,
  addUnit,
  createHeroPreset,
  createSavedUnit,
  defaultUnitName,
  patchHero,
  patchUnit,
  removeHero,
  removeUnit,
  sameSnapshot,
  snapshotOf,
} from './presets';
import type { UnitPreset } from './units';
import { UNITS_BY_ID } from './units';
import type { AttackParams } from './urlState';
import { SHARE_PARAM, decodeAppState, encodeAppState } from './urlState';
import './App.css';

const formatNumber = (value: number) => value.toLocaleString('ru');

const formatRange = (min: number, max: number) =>
  min === max ? formatNumber(min) : `${formatNumber(min)} – ${formatNumber(max)}`;

/** Склонение слова «удар» после числительного: 1 удар, 2 удара, 5 ударов */
const strikesWord = (n: number) => {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod10 === 1 && mod100 !== 11) return 'удар';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'удара';
  return 'ударов';
};

/** «за 3 удара», «за 2–4 удара»; без верхней границы — «минимум за 3 удара» */
const formatStrikes = (min: number, max: number | null) =>
  max === null
    ? `минимум за ${formatNumber(min)} ${strikesWord(min)}`
    : min === max
      ? `за ${formatNumber(min)} ${strikesWord(min)}`
      : `за ${formatNumber(min)}–${formatNumber(max)} ${strikesWord(max)}`;

const LUCK_LABEL: Record<Luck, string> = {
  unlucky: 'Неудача',
  normal: 'Обычный',
  lucky: 'Удача',
};

function Formula({ steps }: { steps: DamageStep[] }) {
  return (
    <div className="formula">
      {steps.map((step, index) => (
        <Fragment key={step.label}>
          {index > 0 && <span className="formula-op">×</span>}
          <span className="formula-part">
            <span className="formula-value">{step.text}</span>
            <span className="formula-label">{step.label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

const DEFAULT_ATTACKER: AttackerStats = {
  count: 100,
  health: 120,
  topHealth: 120,
  damageMin: 50,
  damageMax: 75,
  attack: 36,
  defense: 20,
  heroAttack: 0,
  heroDefense: 0,
};

const DEFAULT_ATTACK: AttackParams = {
  distance: 1,
  generalModifiers: 0,
  typeModifiers: 0,
  retaliation: true,
};

const DEFAULT_DEFENDER: DefenderStats = {
  count: 100,
  health: 150,
  topHealth: 150,
  damageMin: 30,
  damageMax: 50,
  attack: 30,
  defense: 12,
  heroAttack: 0,
  heroDefense: 0,
};

// Состояние из ссылки читается один раз при загрузке страницы.
const restored = decodeAppState(new URLSearchParams(window.location.search).get(SHARE_PARAM));

export default function App() {
  const [attacker, setAttacker] = useState<AttackerStats>(restored?.attacker ?? DEFAULT_ATTACKER);
  const [attack, setAttack] = useState<AttackParams>(restored?.attack ?? DEFAULT_ATTACK);
  const [modeId, setModeId] = useState(restored?.modeId ?? 'base');
  const [defender, setDefender] = useState<DefenderStats>(restored?.defender ?? DEFAULT_DEFENDER);

  const [attackerUnitId, setAttackerUnitId] = useState<string | null>(
    restored?.attackerUnitId ?? null,
  );
  const [defenderUnitId, setDefenderUnitId] = useState<string | null>(
    restored?.defenderUnitId ?? null,
  );

  const [presets, setPresets] = useState<PresetStore>(restored?.presets ?? EMPTY_STORE);
  const [presetSel, setPresetSel] = useState<PresetSelection>(
    restored?.presetSelection ?? EMPTY_SELECTION,
  );

  const patchAttacker = (patch: Partial<AttackerStats>) =>
    setAttacker((prev) => ({ ...prev, ...patch }));
  const patchAttack = (patch: Partial<AttackParams>) =>
    setAttack((prev) => ({ ...prev, ...patch }));
  const patchDefender = (patch: Partial<DefenderStats>) =>
    setDefender((prev) => ({ ...prev, ...patch }));

  const encodedState = useMemo(
    () =>
      encodeAppState({
        attacker,
        attack,
        modeId,
        defender,
        attackerUnitId,
        defenderUnitId,
        presets,
        presetSelection: presetSel,
      }),
    [attacker, attack, modeId, defender, attackerUnitId, defenderUnitId, presets, presetSel],
  );

  // Адресная строка всегда отражает текущее состояние; дебаунс укладывает
  // зажатый спиннер числового поля в лимит replaceState Safari (~100/30 с).
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set(SHARE_PARAM, encodedState);
      try {
        window.history.replaceState(null, '', url);
      } catch {
        // Превышен лимит replaceState: адрес обновит следующее изменение.
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [encodedState]);

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number>(undefined);

  // Ссылка строится из текущего состояния, а не адресной строки: та может
  // отставать на окно дебаунса.
  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_PARAM, encodedState);
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      // Не-secure контекст или старый браузер: копирование через выделение.
      const textarea = document.createElement('textarea');
      textarea.value = url.toString();
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const attackerUnit = attackerUnitId ? (UNITS_BY_ID.get(attackerUnitId) ?? null) : null;
  const defenderUnit = defenderUnitId ? (UNITS_BY_ID.get(defenderUnitId) ?? null) : null;
  const modes = useMemo(() => attackModesFor(attackerUnit), [attackerUnit]);
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  const doubleStrike = doubleStrikeFor(attackerUnit, mode);
  const reduction = damageReduction(defenderUnit, mode);

  // Смена режима заново проставляет ответный удар; дальше он правится вручную.
  const selectMode = (next: AttackMode, unit: UnitPreset | null) => {
    setModeId(next.id);
    patchAttack({ retaliation: defaultRetaliation(unit, next) });
  };

  const presetStats = (unit: UnitPreset) => ({
    health: unit.stats.health,
    topHealth: unit.stats.health,
    damageMin: unit.stats.damageMin,
    damageMax: unit.stats.damageMax,
    attack: unit.stats.attack,
    defense: unit.stats.defense,
  });

  const selectAttackerUnit = (unit: UnitPreset | null) => {
    setAttackerUnitId(unit?.id ?? null);
    if (unit) patchAttacker(presetStats(unit));
    selectMode(attackModesFor(unit)[0], unit);
    // Стек больше не соответствует сохранённому отряду; пресет героя
    // остаётся выбранным — в него можно добавить новый отряд.
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: null }));
  };

  const selectDefenderUnit = (unit: UnitPreset | null) => {
    setDefenderUnitId(unit?.id ?? null);
    if (unit) patchDefender(presetStats(unit));
    setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: null }));
  };

  // Режим атаки принадлежит атакующему, поэтому после обмена он строится
  // заново по способностям нового атакующего, как при выборе юнита.
  // Списки пресетов к сторонам привязаны и не переезжают, поэтому выбор
  // пресетов сбрасывается: стеки больше не соответствуют своим спискам.
  const swapSides = () => {
    const nextAttackerUnit = defenderUnitId ? (UNITS_BY_ID.get(defenderUnitId) ?? null) : null;
    setAttacker(defender);
    setDefender(attacker);
    setAttackerUnitId(defenderUnitId);
    setDefenderUnitId(attackerUnitId);
    selectMode(attackModesFor(nextAttackerUnit)[0], nextAttackerUnit);
    setPresetSel(EMPTY_SELECTION);
  };

  // Сохранённый отряд применяется в обход selectAttackerUnit: статы
  // берутся из снапшота пресета, а не из базы юнитов.
  const applyAttackerSavedUnit = (saved: SavedUnit) => {
    const unit = saved.unitId ? (UNITS_BY_ID.get(saved.unitId) ?? null) : null;
    setAttackerUnitId(unit?.id ?? null);
    patchAttacker(saved.stats);
    selectMode(attackModesFor(unit)[0], unit);
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: saved.id }));
  };

  const applyDefenderSavedUnit = (saved: SavedUnit) => {
    const unit = saved.unitId ? (UNITS_BY_ID.get(saved.unitId) ?? null) : null;
    setDefenderUnitId(unit?.id ?? null);
    patchDefender(saved.stats);
    setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: saved.id }));
  };

  // Выбор пресета героя применяет только его статы; первый отряд
  // автоматически не применяется — это отдельный клик по списку.
  const selectAttackerHeroPreset = (preset: HeroPreset | null) => {
    if (preset) patchAttacker({ heroAttack: preset.heroAttack, heroDefense: preset.heroDefense });
    setPresetSel((sel) => ({
      ...sel,
      attackerHeroId: preset?.id ?? null,
      attackerSavedUnitId: null,
    }));
  };

  const selectDefenderHeroPreset = (preset: HeroPreset | null) => {
    if (preset) patchDefender({ heroAttack: preset.heroAttack, heroDefense: preset.heroDefense });
    setPresetSel((sel) => ({
      ...sel,
      defenderHeroId: preset?.id ?? null,
      defenderSavedUnitId: null,
    }));
  };

  const createAttackerHeroPreset = () => {
    const preset = createHeroPreset(attacker, attackerUnitId);
    setPresets((prev) => ({ ...prev, attacker: addHero(prev.attacker, preset) }));
    setPresetSel((sel) => ({
      ...sel,
      attackerHeroId: preset.id,
      attackerSavedUnitId: preset.units[0].id,
    }));
  };

  const createDefenderHeroPreset = () => {
    const preset = createHeroPreset(defender, defenderUnitId);
    setPresets((prev) => ({ ...prev, defender: addHero(prev.defender, preset) }));
    setPresetSel((sel) => ({
      ...sel,
      defenderHeroId: preset.id,
      defenderSavedUnitId: preset.units[0].id,
    }));
  };

  const updateAttackerHeroPreset = () => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    setPresets((prev) => ({
      ...prev,
      attacker: patchHero(prev.attacker, heroId, {
        heroAttack: attacker.heroAttack,
        heroDefense: attacker.heroDefense,
      }),
    }));
  };

  const updateDefenderHeroPreset = () => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    setPresets((prev) => ({
      ...prev,
      defender: patchHero(prev.defender, heroId, {
        heroAttack: defender.heroAttack,
        heroDefense: defender.heroDefense,
      }),
    }));
  };

  const renameAttackerHeroPreset = (name: string) => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    setPresets((prev) => ({ ...prev, attacker: patchHero(prev.attacker, heroId, { name }) }));
  };

  const renameDefenderHeroPreset = (name: string) => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    setPresets((prev) => ({ ...prev, defender: patchHero(prev.defender, heroId, { name }) }));
  };

  // Удаление снимает выбор; текущие статы в форме остаются как есть.
  const deleteAttackerHeroPreset = () => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    setPresets((prev) => ({ ...prev, attacker: removeHero(prev.attacker, heroId) }));
    setPresetSel((sel) => ({ ...sel, attackerHeroId: null, attackerSavedUnitId: null }));
  };

  const deleteDefenderHeroPreset = () => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    setPresets((prev) => ({ ...prev, defender: removeHero(prev.defender, heroId) }));
    setPresetSel((sel) => ({ ...sel, defenderHeroId: null, defenderSavedUnitId: null }));
  };

  const addAttackerSavedUnit = () => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    const saved = createSavedUnit(attacker, attackerUnitId);
    setPresets((prev) => ({ ...prev, attacker: addUnit(prev.attacker, heroId, saved) }));
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: saved.id }));
  };

  const addDefenderSavedUnit = () => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    const saved = createSavedUnit(defender, defenderUnitId);
    setPresets((prev) => ({ ...prev, defender: addUnit(prev.defender, heroId, saved) }));
    setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: saved.id }));
  };

  // Пересохранение отряда обновляет юнит и статы; имя остаётся авторским.
  const updateAttackerSavedUnit = (savedUnitId: string) => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    setPresets((prev) => ({
      ...prev,
      attacker: patchUnit(prev.attacker, heroId, savedUnitId, {
        unitId: attackerUnitId,
        stats: snapshotOf(attacker),
      }),
    }));
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: savedUnitId }));
  };

  const updateDefenderSavedUnit = (savedUnitId: string) => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    setPresets((prev) => ({
      ...prev,
      defender: patchUnit(prev.defender, heroId, savedUnitId, {
        unitId: defenderUnitId,
        stats: snapshotOf(defender),
      }),
    }));
    setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: savedUnitId }));
  };

  const renameAttackerSavedUnit = (savedUnitId: string, name: string) => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    setPresets((prev) => ({
      ...prev,
      attacker: patchUnit(prev.attacker, heroId, savedUnitId, { name }),
    }));
  };

  const renameDefenderSavedUnit = (savedUnitId: string, name: string) => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    setPresets((prev) => ({
      ...prev,
      defender: patchUnit(prev.defender, heroId, savedUnitId, { name }),
    }));
  };

  const deleteAttackerSavedUnit = (savedUnitId: string) => {
    const heroId = presetSel.attackerHeroId;
    if (!heroId) return;
    setPresets((prev) => ({ ...prev, attacker: removeUnit(prev.attacker, heroId, savedUnitId) }));
    setPresetSel((sel) =>
      sel.attackerSavedUnitId === savedUnitId ? { ...sel, attackerSavedUnitId: null } : sel,
    );
  };

  const deleteDefenderSavedUnit = (savedUnitId: string) => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    setPresets((prev) => ({ ...prev, defender: removeUnit(prev.defender, heroId, savedUnitId) }));
    setPresetSel((sel) =>
      sel.defenderSavedUnitId === savedUnitId ? { ...sel, defenderSavedUnitId: null } : sel,
    );
  };

  const attackerHeroPreset =
    presets.attacker.find((preset) => preset.id === presetSel.attackerHeroId) ?? null;
  const defenderHeroPreset =
    presets.defender.find((preset) => preset.id === presetSel.defenderHeroId) ?? null;
  const attackerSavedUnit =
    attackerHeroPreset?.units.find((unit) => unit.id === presetSel.attackerSavedUnitId) ?? null;
  const defenderSavedUnit =
    defenderHeroPreset?.units.find((unit) => unit.id === presetSel.defenderSavedUnitId) ?? null;

  const attackerHeroDirty =
    attackerHeroPreset !== null &&
    (attackerHeroPreset.heroAttack !== attacker.heroAttack ||
      attackerHeroPreset.heroDefense !== attacker.heroDefense);
  const defenderHeroDirty =
    defenderHeroPreset !== null &&
    (defenderHeroPreset.heroAttack !== defender.heroAttack ||
      defenderHeroPreset.heroDefense !== defender.heroDefense);
  const attackerUnitDirty =
    attackerSavedUnit !== null &&
    (attackerSavedUnit.unitId !== attackerUnitId ||
      !sameSnapshot(attackerSavedUnit.stats, snapshotOf(attacker)));
  const defenderUnitDirty =
    defenderSavedUnit !== null &&
    (defenderSavedUnit.unitId !== defenderUnitId ||
      !sameSnapshot(defenderSavedUnit.stats, snapshotOf(defender)));

  const result = useMemo(
    () =>
      calculateDamage({
        attacker,
        abilities: {
          ...attack,
          typeModifiers: attack.typeModifiers + (mode.special ? 0 : (reduction?.percent ?? 0)),
          rangePenalty: mode.rangePenalty,
          modeMultiplier: mode.multiplier,
          doubleStrike,
        },
        defender,
      }),
    [attacker, attack, defender, mode, doubleStrike, reduction],
  );

  // Способности с собственным уроном считаются отдельной формулой.
  const special = mode.special;
  const specialResult = useMemo(
    () =>
      special
        ? calculateAbilityDamage({
            count: attacker.count,
            damageMin: attacker.damageMin,
            damageMax: attacker.damageMax,
            factor: special.factor,
            attackModifier: special.ignoreDefense
              ? (20 + Math.max(0, attacker.attack) + Math.max(0, attacker.heroAttack)) / 20
              : 1,
            base: special.base,
            perUnit: special.perUnit,
            reduction: reduction?.percent,
            defender: {
              count: defender.count,
              health: defender.health,
              topHealth: defender.topHealth,
            },
          })
        : null,
    [special, attacker, defender, reduction],
  );

  return (
    <main>
      <header className="page-header">
        <h1>Калькулятор урона — Heroes of Might and Magic: Olden Era</h1>
        <div className="header-actions">
          <button type="button" className="swap-button" onClick={swapSides}>
            ⇄ Поменять местами
          </button>
          <button
            type="button"
            className={copied ? 'share-button share-button--copied' : 'share-button'}
            onClick={copyLink}
          >
            {copied ? 'Скопировано' : 'Скопировать ссылку'}
          </button>
        </div>
      </header>

      <div className="columns">
        <section className="column">
          <h2>Атакующий</h2>
          <HeroPresetPanel
            idPrefix="attacker"
            presets={presets.attacker}
            selectedId={presetSel.attackerHeroId}
            dirty={attackerHeroDirty}
            onCreate={createAttackerHeroPreset}
            onSelect={selectAttackerHeroPreset}
            onUpdate={updateAttackerHeroPreset}
            onRename={renameAttackerHeroPreset}
            onDelete={deleteAttackerHeroPreset}
          />
          <div className="group">
            <div className="group-title">Герой</div>
            <NumberField
              id="attacker-hero-attack"
              label="Атака"
              value={attacker.heroAttack}
              min={0}
              onChange={(heroAttack) => patchAttacker({ heroAttack })}
            />
            <NumberField
              id="attacker-hero-defense"
              label="Защита"
              value={attacker.heroDefense}
              min={0}
              onChange={(heroDefense) => patchAttacker({ heroDefense })}
            />
          </div>
          <div className="group">
            <div className="group-title">Юнит</div>
            {attackerHeroPreset && (
              <UnitPresetPanel
                idPrefix="attacker"
                units={attackerHeroPreset.units}
                selectedId={presetSel.attackerSavedUnitId}
                dirty={attackerUnitDirty}
                currentUnitName={defaultUnitName(attackerUnitId, attacker.count)}
                onAdd={addAttackerSavedUnit}
                onSelect={(unit) =>
                  unit
                    ? applyAttackerSavedUnit(unit)
                    : setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: null }))
                }
                onUpdate={() => updateAttackerSavedUnit(presetSel.attackerSavedUnitId ?? '')}
                onRename={(name) =>
                  renameAttackerSavedUnit(presetSel.attackerSavedUnitId ?? '', name)
                }
                onDelete={() => deleteAttackerSavedUnit(presetSel.attackerSavedUnitId ?? '')}
              />
            )}
            <UnitPicker
              idPrefix="attacker"
              selectedId={attackerUnitId}
              onSelect={selectAttackerUnit}
            />
            <NumberField
              id="count"
              label="Кол-во существ"
              value={attacker.count}
              min={1}
              onChange={(count) => patchAttacker({ count })}
            />
            <NumberField
              id="attacker-health"
              label="Здоровье существа"
              value={attacker.health}
              min={1}
              onChange={(health) => patchAttacker({ health })}
            />
            <NumberField
              id="attacker-top-health"
              label="Неполное здоровье юнита"
              value={attacker.topHealth}
              min={1}
              max={attacker.health}
              onChange={(topHealth) => patchAttacker({ topHealth })}
            />
            <NumberField
              id="damage-min"
              label="Урон мин"
              value={attacker.damageMin}
              min={0}
              onChange={(damageMin) => patchAttacker({ damageMin })}
            />
            <NumberField
              id="damage-max"
              label="Урон макс"
              value={attacker.damageMax}
              min={0}
              onChange={(damageMax) => patchAttacker({ damageMax })}
            />
            <NumberField
              id="attack"
              label="Атака существа"
              value={attacker.attack}
              min={0}
              onChange={(attack) => patchAttacker({ attack })}
            />
            <NumberField
              id="attacker-defense"
              label="Защита существа"
              value={attacker.defense}
              min={0}
              onChange={(defense) => patchAttacker({ defense })}
            />
          </div>
        </section>

        <section className="column">
          <h2>Атака</h2>
          <div className="mode-group">
            <div className="group-title">Режим атаки</div>
            {modes.map((m) => (
              <label className="radio" key={m.id}>
                <input
                  type="radio"
                  name="attack-mode"
                  checked={m.id === mode.id}
                  onChange={() => selectMode(m, attackerUnit)}
                />
                {m.label}
              </label>
            ))}
          </div>
          {mode.rangePenalty && (
            <NumberField
              id="distance"
              label="Гексы до цели"
              value={attack.distance}
              min={1}
              max={20}
              onChange={(distance) => patchAttack({ distance })}
            />
          )}
          {!mode.special && (
            <>
              <NumberField
                id="general-modifiers"
                label="Общие модификаторы, % (сумма)"
                value={attack.generalModifiers}
                step={5}
                onChange={(generalModifiers) => patchAttack({ generalModifiers })}
              />
              <NumberField
                id="type-modifiers"
                label="Типовые модификаторы, % (сумма)"
                value={attack.typeModifiers}
                step={5}
                onChange={(typeModifiers) => patchAttack({ typeModifiers })}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={attack.retaliation}
                  onChange={(e) => patchAttack({ retaliation: e.target.checked })}
                />
                Ответный удар
              </label>
            </>
          )}
          {mode.special && (
            <p className="mode-note">
              Урон способности не зависит от АТК/ЗЩТ, модификаторов, дальности и удачи и не
              провоцирует ответный удар.
            </p>
          )}
          {reduction && (
            <p className="mode-note">
              Защита цели: {reduction.percent}% ({reduction.source}) — учтено автоматически.
            </p>
          )}
        </section>

        <section className="column">
          <h2>Защищающийся</h2>
          <HeroPresetPanel
            idPrefix="defender"
            presets={presets.defender}
            selectedId={presetSel.defenderHeroId}
            dirty={defenderHeroDirty}
            onCreate={createDefenderHeroPreset}
            onSelect={selectDefenderHeroPreset}
            onUpdate={updateDefenderHeroPreset}
            onRename={renameDefenderHeroPreset}
            onDelete={deleteDefenderHeroPreset}
          />
          <div className="group">
            <div className="group-title">Герой</div>
            <NumberField
              id="defender-hero-attack"
              label="Атака"
              value={defender.heroAttack}
              min={0}
              onChange={(heroAttack) => patchDefender({ heroAttack })}
            />
            <NumberField
              id="defender-hero-defense"
              label="Защита"
              value={defender.heroDefense}
              min={0}
              onChange={(heroDefense) => patchDefender({ heroDefense })}
            />
          </div>
          <div className="group">
            <div className="group-title">Юнит</div>
            {defenderHeroPreset && (
              <UnitPresetPanel
                idPrefix="defender"
                units={defenderHeroPreset.units}
                selectedId={presetSel.defenderSavedUnitId}
                dirty={defenderUnitDirty}
                currentUnitName={defaultUnitName(defenderUnitId, defender.count)}
                onAdd={addDefenderSavedUnit}
                onSelect={(unit) =>
                  unit
                    ? applyDefenderSavedUnit(unit)
                    : setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: null }))
                }
                onUpdate={() => updateDefenderSavedUnit(presetSel.defenderSavedUnitId ?? '')}
                onRename={(name) =>
                  renameDefenderSavedUnit(presetSel.defenderSavedUnitId ?? '', name)
                }
                onDelete={() => deleteDefenderSavedUnit(presetSel.defenderSavedUnitId ?? '')}
              />
            )}
            <UnitPicker
              idPrefix="defender"
              selectedId={defenderUnitId}
              onSelect={selectDefenderUnit}
            />
            <NumberField
              id="defender-count"
              label="Кол-во существ (до удара)"
              value={defender.count}
              min={1}
              onChange={(count) => patchDefender({ count })}
            />
            <NumberField
              id="defender-health"
              label="Здоровье существа"
              value={defender.health}
              min={1}
              onChange={(health) => patchDefender({ health })}
            />
            <NumberField
              id="defender-top-health"
              label="Неполное здоровье юнита"
              value={defender.topHealth}
              min={1}
              max={defender.health}
              onChange={(topHealth) => patchDefender({ topHealth })}
            />
            <NumberField
              id="defender-damage-min"
              label="Урон мин"
              value={defender.damageMin}
              min={0}
              onChange={(damageMin) => patchDefender({ damageMin })}
            />
            <NumberField
              id="defender-damage-max"
              label="Урон макс"
              value={defender.damageMax}
              min={0}
              onChange={(damageMax) => patchDefender({ damageMax })}
            />
            <NumberField
              id="defender-attack"
              label="Атака существа"
              value={defender.attack}
              min={0}
              onChange={(attack) => patchDefender({ attack })}
            />
            <NumberField
              id="defense"
              label="Защита существа"
              value={defender.defense}
              min={0}
              onChange={(defense) => patchDefender({ defense })}
            />
          </div>
        </section>
      </div>

      <div className="cards">
        {specialResult && (
          <div className="card">
            <div className="label">Урон способности</div>
            <div className="damage-row">
              <span className="damage-luck">{mode.label}</span>
              <span className="damage-value">
                {formatRange(specialResult.min, specialResult.max)}{' '}
                <span className="damage-avg">({formatNumber(specialResult.average)})</span>
                <span className="damage-sub">
                  умрёт:{' '}
                  {specialResult.killsMin === specialResult.killsMax
                    ? formatNumber(specialResult.killsMin)
                    : `${formatNumber(specialResult.killsMin)}–${formatNumber(specialResult.killsMax)}`}
                  {specialResult.strikesMin !== null &&
                    ` · весь отряд: ${formatStrikes(specialResult.strikesMin, specialResult.strikesMax)}`}
                </span>
              </span>
            </div>
            <Formula steps={specialResult.steps} />
          </div>
        )}
        {!specialResult && (
          <div className="card">
            <div className="label">Удар атакующего (средний)</div>
            {result.byLuck.map((row) => (
              <div className={`damage-row damage-row--${row.luck}`} key={row.luck}>
                <span className="damage-luck">{LUCK_LABEL[row.luck]}</span>
                <span className="damage-value">
                  {formatRange(row.min, row.max)}{' '}
                  <span className="damage-avg">({formatNumber(row.average)})</span>
                  <span className="damage-sub">
                    умрёт:{' '}
                    {row.killsMin === row.killsMax
                      ? formatNumber(row.killsMin)
                      : `${formatNumber(row.killsMin)}–${formatNumber(row.killsMax)}`}
                    {` · весь отряд: ${formatStrikes(row.strikesMin, row.strikesMax)}`}
                  </span>
                </span>
              </div>
            ))}
            <Formula steps={result.steps} />
          </div>
        )}
        {attack.retaliation && (
          <div className="card">
            <div className="label">Ответный удар (средний)</div>
            {result.byLuck.map((row) => {
              const retaliation = row.retaliation;
              if (!retaliation) return null;
              return (
                <div className={`damage-row damage-row--${row.luck}`} key={row.luck}>
                  <span className="damage-luck">{LUCK_LABEL[row.luck]}</span>
                  {retaliation.survivorsMax > 0 ? (
                    <span className="damage-value damage-value--retaliation">
                      {formatRange(retaliation.min, retaliation.max)}{' '}
                      <span className="damage-avg">({formatNumber(retaliation.average)})</span>
                      <span className="damage-sub">
                        умрёт:{' '}
                        {retaliation.killsMin === retaliation.killsMax
                          ? formatNumber(retaliation.killsMin)
                          : `${formatNumber(retaliation.killsMin)}–${formatNumber(retaliation.killsMax)}`}
                      </span>
                    </span>
                  ) : (
                    <span className="damage-avg">отряд уничтожен</span>
                  )}
                </div>
              );
            })}
            <Formula steps={result.retaliationSteps} />
          </div>
        )}
        {doubleStrike && (
          <div className="card">
            <div className="label">Второй удар (средний)</div>
            {result.byLuck.map((row) => {
              const second = row.secondStrike;
              if (!second) return null;
              return (
                <div className={`damage-row damage-row--${row.luck}`} key={row.luck}>
                  <span className="damage-luck">{LUCK_LABEL[row.luck]}</span>
                  {second.attackersMax > 0 ? (
                    <span className="damage-value">
                      {formatRange(second.min, second.max)}{' '}
                      <span className="damage-avg">({formatNumber(second.average)})</span>
                      <span className="damage-sub">
                        бьют:{' '}
                        {second.attackersMin === second.attackersMax
                          ? formatNumber(second.attackersMin)
                          : `${formatNumber(second.attackersMin)}–${formatNumber(second.attackersMax)}`}{' '}
                        · умрёт:{' '}
                        {second.killsMin === second.killsMax
                          ? formatNumber(second.killsMin)
                          : `${formatNumber(second.killsMin)}–${formatNumber(second.killsMax)}`}
                      </span>
                    </span>
                  ) : (
                    <span className="damage-avg">отряд уничтожен — второго удара нет</span>
                  )}
                </div>
              );
            })}
            <Formula steps={result.secondStrikeSteps} />
          </div>
        )}
      </div>

      <p className="note">
        ATK — атака существа плюс атака героя, DEF — защита существа плюс защита героя.
        Типовые бонусы и штрафы
        сначала суммируются; после них должно остаться хотя бы 10% урона. Итог всегда наносит
        минимум 1 урона. Режимы атаки строятся по способностям выбранного юнита: у стрелка
        дальняя атака теряет 10% за каждый гекс сверх трёх (максимум −50%; «Снайпер» стреляет
        без штрафа), ближняя атака идёт с половинным уроном (кроме «Дуэлянта»), боевые стойки
        дают ×0.5. Активные способности с собственным уроном (чистым или магическим) считаются
        по формуле из описания: АТК/ЗЩТ, модификаторы, дальность и удача на них не действуют;
        магический урон снижает «Защита от магии» цели, чистый не снижается ничем. Постоянные
        защитные способности цели («Защита от выстрелов», «Защита в ближнем бою», «Презрение»)
        уменьшают урон соответствующего типа атаки автоматически.
        Ответный удар проставляется автоматически: дальняя атака, атака через гекс и
        «Стремительный удар» ответа не провоцируют, галочку можно переключить вручную.
        Погибшие: первым гибнет верхний юнит с неполным здоровьем, дальше урон делится на полное
        здоровье (округление вниз); расчётное число не ограничено размером отряда.
        «Весь отряд: за N ударов» — сколько ударов с уроном строки нужно, чтобы выбить
        суммарное здоровье отряда защитника (границы — по максимальному и минимальному урону). Ответный удар: по урону атаки считаются выжившие существа защитника (суммарное здоровье
        минус урон, округление числа существ вверх), затем они бьют по обычной формуле со своим
        уроном и модификатором (20 + ATK защитника) / (20 + DEF атакующего); удача, дальность и
        модификаторы атаки на ответ не влияют. Второй удар («Двойной удар», при стрельбе —
        «Двойной выстрел») наносят выжившие после ответа атакующие по остатку отряда защитника;
        удача действует на оба удара одинаково, хотя в игре она выпадает на каждый удар отдельно.
        Данные — официальная вики игры; игра в раннем
        доступе, цифры могут меняться.
      </p>
    </main>
  );
}
