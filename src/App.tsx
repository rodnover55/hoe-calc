import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { AttackerStats, DamageStep, DefenderStats } from './formula';
import { calculateAbilityDamage, calculateDamage } from './formula';
import type { AttackMode } from './abilityEffects';
import { attackModesFor, damageReduction, defaultRetaliation, doubleStrikeFor } from './abilityEffects';
import type { HeroPick } from './heroEffects';
import {
  EMPTY_HERO_PICK,
  HERO_STRIKE_MODE_ID,
  heroBonuses,
  heroStrikeMode,
  heroStrikeSteps,
  sameHeroPick,
} from './heroEffects';
import type { GameHero } from './heroes';
import { HEROES_BY_ID } from './heroes';
import { LANGUAGES, numberLocale, pluralWord } from './i18n';
import { useI18n } from './LangContext';
import { HeroPicker } from './components/HeroPicker';
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

function Formula({ steps }: { steps: DamageStep[] }) {
  // Цвет связывает бакет числовой строки со строкой легенды под ней.
  const bucket = (index: number) => `formula-bucket-${index % 7}`;
  return (
    <div className="formula">
      <div className="formula-row">
        {steps.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && <span className="formula-op">{step.op ?? '×'}</span>}
            {/* Подпись рисуется псевдоэлементом из data-label, чтобы не
                попадать в выделение при копировании формулы. */}
            <span className={`formula-part ${bucket(index)}`} data-label={step.label}>
              {step.tokens.map((token, i) =>
                token.param ? (
                  <span className="formula-num" key={i} title={token.param}>
                    {token.text}
                  </span>
                ) : (
                  <Fragment key={i}>{token.text}</Fragment>
                ),
              )}
            </span>
          </Fragment>
        ))}
      </div>
      <div className="formula-legend">
        {steps.map((step, index) => (
          <div className={bucket(index)} key={index}>
            {step.formula}
          </div>
        ))}
      </div>
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
  const { lang, setLang, t } = useI18n();

  const formatNumber = (value: number) => value.toLocaleString(numberLocale(lang));

  const formatRange = (min: number, max: number) =>
    min === max ? formatNumber(min) : `${formatNumber(min)} – ${formatNumber(max)}`;

  /** «за 3 удара», «за 2–4 удара»; без верхней границы — «минимум за 3 удара» */
  const formatStrikes = (min: number, max: number | null) =>
    max === null
      ? t('strikes.atLeast', { n: formatNumber(min), word: pluralWord(lang, 'strikes.word', min) })
      : min === max
        ? t('strikes.exact', { n: formatNumber(min), word: pluralWord(lang, 'strikes.word', min) })
        : t('strikes.range', {
            min: formatNumber(min),
            max: formatNumber(max),
            word: pluralWord(lang, 'strikes.word', max),
          });

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

  const [attackerHero, setAttackerHero] = useState<HeroPick>(
    restored?.attackerHero ?? EMPTY_HERO_PICK,
  );
  const [defenderHero, setDefenderHero] = useState<HeroPick>(
    restored?.defenderHero ?? EMPTY_HERO_PICK,
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
        attackerHero,
        defenderHero,
        presets,
        presetSelection: presetSel,
      }),
    [
      attacker,
      attack,
      modeId,
      defender,
      attackerUnitId,
      defenderUnitId,
      attackerHero,
      defenderHero,
      presets,
      presetSel,
    ],
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
  const attackerGameHero = attackerHero.heroId
    ? (HEROES_BY_ID.get(attackerHero.heroId) ?? null)
    : null;
  const defenderGameHero = defenderHero.heroId
    ? (HEROES_BY_ID.get(defenderHero.heroId) ?? null)
    : null;
  // «Удар героя» — дополнительный режим атаки при выбранном герое; при
  // сбросе героя выбор режима сам падает на первый из списка юнита.
  const modes = useMemo(() => {
    const list = attackModesFor(attackerUnit, lang);
    if (attackerGameHero) list.push(heroStrikeMode(attackerGameHero, attackerHero.level, lang));
    return list;
  }, [attackerUnit, attackerGameHero, attackerHero.level, lang]);
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  const doubleStrike = doubleStrikeFor(attackerUnit, mode);
  const reduction = damageReduction(defenderUnit, mode, lang);

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
    selectMode(attackModesFor(unit, lang)[0], unit);
    // Стек больше не соответствует сохранённому отряду; пресет героя
    // остаётся выбранным — в него можно добавить новый отряд.
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: null }));
  };

  const selectDefenderUnit = (unit: UnitPreset | null) => {
    setDefenderUnitId(unit?.id ?? null);
    if (unit) patchDefender(presetStats(unit));
    setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: null }));
  };

  // Выбор игрового героя один раз заполняет атаку/защиту его стартовыми
  // статами; дальше они правятся вручную, как статы юнита.
  const selectAttackerGameHero = (hero: GameHero | null) => {
    setAttackerHero((prev) => ({ heroId: hero?.id ?? null, level: prev.level }));
    if (hero) patchAttacker({ heroAttack: hero.stats.attack, heroDefense: hero.stats.defense });
  };

  const selectDefenderGameHero = (hero: GameHero | null) => {
    setDefenderHero((prev) => ({ heroId: hero?.id ?? null, level: prev.level }));
    if (hero) patchDefender({ heroAttack: hero.stats.attack, heroDefense: hero.stats.defense });
  };

  const setAttackerHeroLevel = (level: number) => {
    setAttackerHero((prev) => ({ ...prev, level }));
  };

  const setDefenderHeroLevel = (level: number) => {
    setDefenderHero((prev) => ({ ...prev, level }));
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
    setAttackerHero(defenderHero);
    setDefenderHero(attackerHero);
    selectMode(attackModesFor(nextAttackerUnit, lang)[0], nextAttackerUnit);
    setPresetSel(EMPTY_SELECTION);
  };

  // Сохранённый отряд применяется в обход selectAttackerUnit: статы
  // берутся из снапшота пресета, а не из базы юнитов.
  const applyAttackerSavedUnit = (saved: SavedUnit) => {
    const unit = saved.unitId ? (UNITS_BY_ID.get(saved.unitId) ?? null) : null;
    setAttackerUnitId(unit?.id ?? null);
    patchAttacker(saved.stats);
    selectMode(attackModesFor(unit, lang)[0], unit);
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: saved.id }));
  };

  const applyDefenderSavedUnit = (saved: SavedUnit) => {
    const unit = saved.unitId ? (UNITS_BY_ID.get(saved.unitId) ?? null) : null;
    setDefenderUnitId(unit?.id ?? null);
    patchDefender(saved.stats);
    setPresetSel((sel) => ({ ...sel, defenderSavedUnitId: saved.id }));
  };

  // Выбор пресета героя применяет его статы и игрового героя; первый
  // отряд автоматически не применяется — это отдельный клик по списку.
  const selectAttackerHeroPreset = (preset: HeroPreset | null) => {
    if (preset) {
      patchAttacker({ heroAttack: preset.heroAttack, heroDefense: preset.heroDefense });
      setAttackerHero(preset.hero);
    }
    setPresetSel((sel) => ({
      ...sel,
      attackerHeroId: preset?.id ?? null,
      attackerSavedUnitId: null,
    }));
  };

  const selectDefenderHeroPreset = (preset: HeroPreset | null) => {
    if (preset) {
      patchDefender({ heroAttack: preset.heroAttack, heroDefense: preset.heroDefense });
      setDefenderHero(preset.hero);
    }
    setPresetSel((sel) => ({
      ...sel,
      defenderHeroId: preset?.id ?? null,
      defenderSavedUnitId: null,
    }));
  };

  const createAttackerHeroPreset = () => {
    const preset = createHeroPreset(attacker, attackerUnitId, lang, attackerHero);
    setPresets((prev) => ({ ...prev, attacker: addHero(prev.attacker, preset) }));
    setPresetSel((sel) => ({
      ...sel,
      attackerHeroId: preset.id,
      attackerSavedUnitId: preset.units[0].id,
    }));
  };

  const createDefenderHeroPreset = () => {
    const preset = createHeroPreset(defender, defenderUnitId, lang, defenderHero);
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
        hero: attackerHero,
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
        hero: defenderHero,
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
    const saved = createSavedUnit(attacker, attackerUnitId, lang);
    setPresets((prev) => ({ ...prev, attacker: addUnit(prev.attacker, heroId, saved) }));
    setPresetSel((sel) => ({ ...sel, attackerSavedUnitId: saved.id }));
  };

  const addDefenderSavedUnit = () => {
    const heroId = presetSel.defenderHeroId;
    if (!heroId) return;
    const saved = createSavedUnit(defender, defenderUnitId, lang);
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
      attackerHeroPreset.heroDefense !== attacker.heroDefense ||
      !sameHeroPick(attackerHeroPreset.hero, attackerHero));
  const defenderHeroDirty =
    defenderHeroPreset !== null &&
    (defenderHeroPreset.heroAttack !== defender.heroAttack ||
      defenderHeroPreset.heroDefense !== defender.heroDefense ||
      !sameHeroPick(defenderHeroPreset.hero, defenderHero));
  const attackerUnitDirty =
    attackerSavedUnit !== null &&
    (attackerSavedUnit.unitId !== attackerUnitId ||
      !sameSnapshot(attackerSavedUnit.stats, snapshotOf(attacker)));
  const defenderUnitDirty =
    defenderSavedUnit !== null &&
    (defenderSavedUnit.unitId !== defenderUnitId ||
      !sameSnapshot(defenderSavedUnit.stats, snapshotOf(defender)));

  const attBonus = useMemo(
    () =>
      heroBonuses(
        {
          hero: attackerGameHero,
          level: attackerHero.level,
          unit: attackerUnit,
          enemyUnit: defenderUnit,
          heroAttack: attacker.heroAttack,
          heroDefense: attacker.heroDefense,
          mode,
          side: 'attacker',
        },
        lang,
      ),
    [attackerGameHero, attackerHero.level, attackerUnit, defenderUnit, attacker, mode, lang],
  );
  const defBonus = useMemo(
    () =>
      heroBonuses(
        {
          hero: defenderGameHero,
          level: defenderHero.level,
          unit: defenderUnit,
          enemyUnit: attackerUnit,
          heroAttack: defender.heroAttack,
          heroDefense: defender.heroDefense,
          mode,
          side: 'defender',
        },
        lang,
      ),
    [defenderGameHero, defenderHero.level, defenderUnit, attackerUnit, defender, mode, lang],
  );

  // Бонусы героев складываются с полями формы в момент расчёта и не
  // перезаписывают введённые вручную значения: свои — в атаку/защиту
  // героя, штрафы специализаций противника — в статы юнита (формула сама
  // ограничивает их нулём снизу).
  const effectiveAttacker = useMemo(
    () => ({
      ...attacker,
      attack: attacker.attack + defBonus.enemyAttack,
      defense: attacker.defense + defBonus.enemyDefense,
      heroAttack: attacker.heroAttack + attBonus.attack,
      heroDefense: attacker.heroDefense + attBonus.defense,
    }),
    [attacker, attBonus, defBonus],
  );
  const effectiveDefender = useMemo(
    () => ({
      ...defender,
      attack: defender.attack + attBonus.enemyAttack,
      defense: defender.defense + attBonus.enemyDefense,
      heroAttack: defender.heroAttack + defBonus.attack,
      heroDefense: defender.heroDefense + defBonus.defense,
    }),
    [defender, attBonus, defBonus],
  );

  const result = useMemo(
    () =>
      calculateDamage(
        {
          attacker: effectiveAttacker,
          abilities: {
            ...attack,
            // Процентные бонусы героев уже занулены внутри heroBonuses
            // для способностей с собственным уроном.
            typeModifiers:
              attack.typeModifiers +
              (mode.special ? 0 : (reduction?.percent ?? 0)) +
              attBonus.typeModifiers +
              defBonus.typeModifiers,
            rangePenalty: mode.rangePenalty,
            modeMultiplier: mode.multiplier,
            doubleStrike,
          },
          defender: effectiveDefender,
        },
        lang,
      ),
    [effectiveAttacker, attack, effectiveDefender, mode, doubleStrike, reduction, attBonus, defBonus, lang],
  );

  // Способности с собственным уроном считаются отдельной формулой.
  const special = mode.special;
  const specialResult = useMemo(() => {
    if (!special) return null;
    const result = calculateAbilityDamage(
      {
        count: effectiveAttacker.count,
        damageMin: effectiveAttacker.damageMin,
        damageMax: effectiveAttacker.damageMax,
        factor: special.factor,
        attack: special.ignoreDefense
          ? { unit: effectiveAttacker.attack, hero: effectiveAttacker.heroAttack }
          : undefined,
        base: special.base,
        perUnit: special.perUnit,
        // «Сопротивление» героя защитника складывается с защитой
        // цели от магии; на чистый урон оба не действуют.
        reduction: (reduction?.percent ?? 0) + defBonus.magicReduction || undefined,
        defender: {
          count: defender.count,
          health: defender.health,
          topHealth: defender.topHealth,
        },
      },
      lang,
    );
    // У удара героя вместо «фиксированного урона» — его собственная
    // формула с подставленными уровнем и бонусом специализации.
    return mode.id === HERO_STRIKE_MODE_ID && attackerGameHero
      ? { ...result, steps: heroStrikeSteps(attackerGameHero, attackerHero.level, lang) }
      : result;
  }, [
    special,
    mode.id,
    attackerGameHero,
    attackerHero.level,
    effectiveAttacker,
    defender,
    reduction,
    defBonus,
    lang,
  ]);

  return (
    <main>
      <header className="page-header">
        <div className="page-header-row">
          <h1>{t('app.title')}</h1>
          <div className="header-actions">
            <select
              className="lang-select"
              aria-label={t('app.langSwitch')}
              title={t('app.langSwitch')}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={copied ? 'share-button share-button--copied' : 'share-button'}
              onClick={copyLink}
            >
              {copied ? t('app.copied') : t('app.copyLink')}
            </button>
          </div>
        </div>
        <button type="button" className="swap-button" onClick={swapSides}>
          ⇄ {t('app.swap')}
        </button>
      </header>

      <div className="columns">
        <section className="column">
          <h2>{t('app.attacker')}</h2>
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
            <div className="group-title">{t('app.hero')}</div>
            <HeroPicker
              idPrefix="attacker"
              selectedId={attackerHero.heroId}
              level={attackerHero.level}
              notes={attBonus.notes}
              onSelect={selectAttackerGameHero}
              onLevelChange={setAttackerHeroLevel}
            />
            <NumberField
              id="attacker-hero-attack"
              label={t('fields.heroAttack')}
              value={attacker.heroAttack}
              min={0}
              onChange={(heroAttack) => patchAttacker({ heroAttack })}
            />
            <NumberField
              id="attacker-hero-defense"
              label={t('fields.heroDefense')}
              value={attacker.heroDefense}
              min={0}
              onChange={(heroDefense) => patchAttacker({ heroDefense })}
            />
          </div>
          <div className="group">
            <div className="group-title">{t('app.unit')}</div>
            {attackerHeroPreset && (
              <UnitPresetPanel
                idPrefix="attacker"
                units={attackerHeroPreset.units}
                selectedId={presetSel.attackerSavedUnitId}
                dirty={attackerUnitDirty}
                currentUnitName={defaultUnitName(attackerUnitId, attacker.count, lang)}
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
              label={t('fields.count')}
              value={attacker.count}
              min={1}
              onChange={(count) => patchAttacker({ count })}
            />
            <NumberField
              id="attacker-health"
              label={t('fields.health')}
              value={attacker.health}
              min={1}
              onChange={(health) => patchAttacker({ health })}
            />
            <NumberField
              id="attacker-top-health"
              label={t('fields.topHealth')}
              value={attacker.topHealth}
              min={1}
              max={attacker.health}
              onChange={(topHealth) => patchAttacker({ topHealth })}
            />
            <NumberField
              id="damage-min"
              label={t('fields.damageMin')}
              value={attacker.damageMin}
              min={0}
              onChange={(damageMin) => patchAttacker({ damageMin })}
            />
            <NumberField
              id="damage-max"
              label={t('fields.damageMax')}
              value={attacker.damageMax}
              min={0}
              onChange={(damageMax) => patchAttacker({ damageMax })}
            />
            <NumberField
              id="attack"
              label={t('fields.attack')}
              value={attacker.attack}
              min={0}
              onChange={(attack) => patchAttacker({ attack })}
            />
            <NumberField
              id="attacker-defense"
              label={t('fields.defense')}
              value={attacker.defense}
              min={0}
              onChange={(defense) => patchAttacker({ defense })}
            />
          </div>
        </section>

        <section className="column">
          <h2>{t('app.attack')}</h2>
          <div className="mode-group">
            <div className="group-title">{t('app.attackMode')}</div>
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
              label={t('fields.distance')}
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
                label={t('fields.generalModifiers')}
                value={attack.generalModifiers}
                step={5}
                onChange={(generalModifiers) => patchAttack({ generalModifiers })}
              />
              <NumberField
                id="type-modifiers"
                label={t('fields.typeModifiers')}
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
                {t('fields.retaliation')}
              </label>
            </>
          )}
          {mode.special && <p className="mode-note">{t('modeNote.special')}</p>}
          {reduction && (
            <p className="mode-note">
              {t('modeNote.reduction', { percent: reduction.percent, source: reduction.source })}
            </p>
          )}
        </section>

        <section className="column">
          <h2>{t('app.defender')}</h2>
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
            <div className="group-title">{t('app.hero')}</div>
            <HeroPicker
              idPrefix="defender"
              selectedId={defenderHero.heroId}
              level={defenderHero.level}
              notes={defBonus.notes}
              onSelect={selectDefenderGameHero}
              onLevelChange={setDefenderHeroLevel}
            />
            <NumberField
              id="defender-hero-attack"
              label={t('fields.heroAttack')}
              value={defender.heroAttack}
              min={0}
              onChange={(heroAttack) => patchDefender({ heroAttack })}
            />
            <NumberField
              id="defender-hero-defense"
              label={t('fields.heroDefense')}
              value={defender.heroDefense}
              min={0}
              onChange={(heroDefense) => patchDefender({ heroDefense })}
            />
          </div>
          <div className="group">
            <div className="group-title">{t('app.unit')}</div>
            {defenderHeroPreset && (
              <UnitPresetPanel
                idPrefix="defender"
                units={defenderHeroPreset.units}
                selectedId={presetSel.defenderSavedUnitId}
                dirty={defenderUnitDirty}
                currentUnitName={defaultUnitName(defenderUnitId, defender.count, lang)}
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
              label={t('fields.countBefore')}
              value={defender.count}
              min={1}
              onChange={(count) => patchDefender({ count })}
            />
            <NumberField
              id="defender-health"
              label={t('fields.health')}
              value={defender.health}
              min={1}
              onChange={(health) => patchDefender({ health })}
            />
            <NumberField
              id="defender-top-health"
              label={t('fields.topHealth')}
              value={defender.topHealth}
              min={1}
              max={defender.health}
              onChange={(topHealth) => patchDefender({ topHealth })}
            />
            <NumberField
              id="defender-damage-min"
              label={t('fields.damageMin')}
              value={defender.damageMin}
              min={0}
              onChange={(damageMin) => patchDefender({ damageMin })}
            />
            <NumberField
              id="defender-damage-max"
              label={t('fields.damageMax')}
              value={defender.damageMax}
              min={0}
              onChange={(damageMax) => patchDefender({ damageMax })}
            />
            <NumberField
              id="defender-attack"
              label={t('fields.attack')}
              value={defender.attack}
              min={0}
              onChange={(attack) => patchDefender({ attack })}
            />
            <NumberField
              id="defense"
              label={t('fields.defense')}
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
            <div className="label">{t('cards.ability')}</div>
            <div className="damage-row">
              <span className="damage-luck">{mode.label}</span>
              <span className="damage-value">
                {formatRange(specialResult.min, specialResult.max)}{' '}
                <span className="damage-avg">({formatNumber(specialResult.average)})</span>
                <span className="damage-sub">
                  {t('cards.dies')}{' '}
                  {specialResult.killsMin === specialResult.killsMax
                    ? formatNumber(specialResult.killsMin)
                    : `${formatNumber(specialResult.killsMin)}–${formatNumber(specialResult.killsMax)}`}
                  {specialResult.strikesMin !== null &&
                    ` · ${t('cards.wholeStack')} ${formatStrikes(specialResult.strikesMin, specialResult.strikesMax)}`}
                </span>
              </span>
            </div>
            <Formula steps={specialResult.steps} />
          </div>
        )}
        {!specialResult && (
          <div className="card">
            <div className="label">{t('cards.attack')}</div>
            {result.byLuck.map((row) => (
              <div className={`damage-row damage-row--${row.luck}`} key={row.luck}>
                <span className="damage-luck">{t(`luck.${row.luck}`)}</span>
                <span className="damage-value">
                  {formatRange(row.min, row.max)}{' '}
                  <span className="damage-avg">({formatNumber(row.average)})</span>
                  <span className="damage-sub">
                    {t('cards.dies')}{' '}
                    {row.killsMin === row.killsMax
                      ? formatNumber(row.killsMin)
                      : `${formatNumber(row.killsMin)}–${formatNumber(row.killsMax)}`}
                    {` · ${t('cards.wholeStack')} ${formatStrikes(row.strikesMin, row.strikesMax)}`}
                  </span>
                </span>
              </div>
            ))}
            <Formula steps={result.steps} />
          </div>
        )}
        {attack.retaliation && (
          <div className="card">
            <div className="label">{t('cards.retaliation')}</div>
            {result.byLuck.map((row) => {
              const retaliation = row.retaliation;
              if (!retaliation) return null;
              return (
                <div className={`damage-row damage-row--${row.luck}`} key={row.luck}>
                  <span className="damage-luck">{t(`luck.${row.luck}`)}</span>
                  {retaliation.survivorsMax > 0 ? (
                    <span className="damage-value damage-value--retaliation">
                      {formatRange(retaliation.min, retaliation.max)}{' '}
                      <span className="damage-avg">({formatNumber(retaliation.average)})</span>
                      <span className="damage-sub">
                        {t('cards.dies')}{' '}
                        {retaliation.killsMin === retaliation.killsMax
                          ? formatNumber(retaliation.killsMin)
                          : `${formatNumber(retaliation.killsMin)}–${formatNumber(retaliation.killsMax)}`}
                      </span>
                    </span>
                  ) : (
                    <span className="damage-avg">{t('cards.destroyed')}</span>
                  )}
                </div>
              );
            })}
            <Formula steps={result.retaliationSteps} />
          </div>
        )}
        {doubleStrike && (
          <div className="card">
            <div className="label">{t('cards.second')}</div>
            {result.byLuck.map((row) => {
              const second = row.secondStrike;
              if (!second) return null;
              return (
                <div className={`damage-row damage-row--${row.luck}`} key={row.luck}>
                  <span className="damage-luck">{t(`luck.${row.luck}`)}</span>
                  {second.attackersMax > 0 ? (
                    <span className="damage-value">
                      {formatRange(second.min, second.max)}{' '}
                      <span className="damage-avg">({formatNumber(second.average)})</span>
                      <span className="damage-sub">
                        {t('cards.striking')}{' '}
                        {second.attackersMin === second.attackersMax
                          ? formatNumber(second.attackersMin)
                          : `${formatNumber(second.attackersMin)}–${formatNumber(second.attackersMax)}`}{' '}
                        · {t('cards.dies')}{' '}
                        {second.killsMin === second.killsMax
                          ? formatNumber(second.killsMin)
                          : `${formatNumber(second.killsMin)}–${formatNumber(second.killsMax)}`}
                      </span>
                    </span>
                  ) : (
                    <span className="damage-avg">{t('cards.destroyedNoSecond')}</span>
                  )}
                </div>
              );
            })}
            <Formula steps={result.secondStrikeSteps} />
          </div>
        )}
      </div>

      <p className="note">{t('note')}</p>
    </main>
  );
}
