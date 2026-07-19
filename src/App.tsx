import { Fragment, useMemo, useState } from 'react';
import type { AttackAbilities, AttackerStats, DamageStep, DefenderStats, Luck } from './formula';
import { calculateDamage } from './formula';
import { NumberField } from './components/NumberField';
import { UnitPicker } from './components/UnitPicker';
import type { UnitPreset } from './units';
import './App.css';

const formatNumber = (value: number) => value.toLocaleString('ru');

const formatRange = (min: number, max: number) =>
  min === max ? formatNumber(min) : `${formatNumber(min)} – ${formatNumber(max)}`;

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

export default function App() {
  const [attacker, setAttacker] = useState<AttackerStats>({
    count: 100,
    health: 120,
    topHealth: 120,
    damageMin: 50,
    damageMax: 75,
    attack: 36,
    defense: 20,
    heroAttack: 0,
    heroDefense: 0,
  });
  const [attack, setAttack] = useState<AttackAbilities>({
    distance: 1,
    halfDamage: false,
    generalModifiers: 0,
    typeModifiers: 0,
    retaliation: true,
  });
  const [defender, setDefender] = useState<DefenderStats>({
    count: 100,
    health: 150,
    topHealth: 150,
    damageMin: 30,
    damageMax: 50,
    attack: 30,
    defense: 12,
    heroAttack: 0,
    heroDefense: 0,
  });

  const [attackerUnitId, setAttackerUnitId] = useState<string | null>(null);
  const [defenderUnitId, setDefenderUnitId] = useState<string | null>(null);

  const patchAttacker = (patch: Partial<AttackerStats>) =>
    setAttacker((prev) => ({ ...prev, ...patch }));
  const patchAttack = (patch: Partial<AttackAbilities>) =>
    setAttack((prev) => ({ ...prev, ...patch }));
  const patchDefender = (patch: Partial<DefenderStats>) =>
    setDefender((prev) => ({ ...prev, ...patch }));

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
  };

  const selectDefenderUnit = (unit: UnitPreset | null) => {
    setDefenderUnitId(unit?.id ?? null);
    if (unit) patchDefender(presetStats(unit));
  };

  const result = useMemo(
    () => calculateDamage({ attacker, abilities: attack, defender }),
    [attacker, attack, defender],
  );

  return (
    <main>
      <h1>Калькулятор урона — Heroes of Might and Magic: Olden Era</h1>

      <div className="columns">
        <section className="column">
          <h2>Атакующий</h2>
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
          <NumberField
            id="distance"
            label="Гексы до цели"
            value={attack.distance}
            min={1}
            max={20}
            onChange={(distance) => patchAttack({ distance })}
          />
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
              checked={attack.halfDamage}
              onChange={(e) => patchAttack({ halfDamage: e.target.checked })}
            />
            Половинный урон (стрелок вплотную / через препятствие)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={attack.retaliation}
              onChange={(e) => patchAttack({ retaliation: e.target.checked })}
            />
            Ответный удар
          </label>
        </section>

        <section className="column">
          <h2>Защищающийся</h2>
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
        <div className="card">
          <div className="label">Итоговый урон (средний)</div>
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
                </span>
              </span>
            </div>
          ))}
        </div>
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
          </div>
        )}
      </div>

      <div className="card formula-card">
        <div className="label">Урон</div>
        <Formula steps={result.steps} />
        {attack.retaliation && (
          <>
            <div className="label">Ответный удар</div>
            <Formula steps={result.retaliationSteps} />
          </>
        )}
      </div>

      <p className="note">
        ATK — атака существа плюс атака героя, DEF — защита существа плюс защита героя.
        Типовые бонусы и штрафы
        сначала суммируются; после них должно остаться хотя бы 10% урона. Итог всегда наносит
        минимум 1 урона. Дальнобойная атака теряет 10% за каждый гекс сверх трёх (максимум −50%).
        Погибшие: первым гибнет верхний юнит с неполным здоровьем, дальше урон делится на полное
        здоровье (округление вниз); расчётное число не ограничено размером отряда. Ответный удар: по урону атаки считаются выжившие существа защитника (суммарное здоровье
        минус урон, округление числа существ вверх), затем они бьют по обычной формуле со своим
        уроном и модификатором (20 + ATK защитника) / (20 + DEF атакующего); удача, дальность и
        модификаторы атаки на ответ не влияют. Данные — официальная вики игры; игра в раннем
        доступе, цифры могут меняться.
      </p>
    </main>
  );
}
