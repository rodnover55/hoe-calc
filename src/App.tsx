import { useMemo, useState } from 'react';
import type { AttackParams, AttackerStats, DefenderStats, Luck } from './formula';
import { calculateDamage } from './formula';
import { NumberField } from './components/NumberField';
import './App.css';

const formatNumber = (value: number) => value.toLocaleString('ru');

export default function App() {
  const [attacker, setAttacker] = useState<AttackerStats>({
    count: 100,
    damageMin: 50,
    damageMax: 75,
    attack: 36,
  });
  const [attack, setAttack] = useState<AttackParams>({
    luck: 'normal',
    distance: 1,
    halfDamage: false,
    generalModifiers: 0,
    typeModifiers: 0,
  });
  const [defender, setDefender] = useState<DefenderStats>({
    defense: 12,
  });

  const patchAttacker = (patch: Partial<AttackerStats>) =>
    setAttacker((prev) => ({ ...prev, ...patch }));
  const patchAttack = (patch: Partial<AttackParams>) =>
    setAttack((prev) => ({ ...prev, ...patch }));
  const patchDefender = (patch: Partial<DefenderStats>) =>
    setDefender((prev) => ({ ...prev, ...patch }));

  const result = useMemo(
    () => calculateDamage(attacker, attack, defender),
    [attacker, attack, defender],
  );

  const modifier = result.attackDefenseModifier;

  return (
    <main>
      <h1>Калькулятор урона — Heroes of Might and Magic: Olden Era</h1>

      <div className="columns">
        <section className="column">
          <h2>Атакующий</h2>
          <NumberField
            id="count"
            label="Кол-во существ"
            value={attacker.count}
            min={1}
            onChange={(count) => patchAttacker({ count })}
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
            label="Атака (существо + герой)"
            value={attacker.attack}
            min={0}
            onChange={(attack) => patchAttacker({ attack })}
          />
        </section>

        <section className="column column-attack">
          <h2>Атака</h2>
          <div className="field">
            <label className="field-label" htmlFor="luck">
              Удача
            </label>
            <select
              id="luck"
              value={attack.luck}
              onChange={(e) => patchAttack({ luck: e.target.value as Luck })}
            >
              <option value="normal">Обычный удар</option>
              <option value="lucky">Удачный (×1.5)</option>
              <option value="unlucky">Неудачный (×0.5)</option>
            </select>
          </div>
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
        </section>

        <section className="column">
          <h2>Защищающийся</h2>
          <NumberField
            id="defense"
            label="Защита (существо + герой)"
            value={defender.defense}
            min={0}
            onChange={(defense) => patchDefender({ defense })}
          />
        </section>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Итоговый урон</div>
          <div className="value">
            {result.min === result.max
              ? formatNumber(result.min)
              : `${formatNumber(result.min)} – ${formatNumber(result.max)}`}
          </div>
        </div>
        <div className="card">
          <div className="label">Модификатор АТК/ЗЩТ</div>
          <div className="value">
            {modifier.toFixed(2)} ({modifier >= 1 ? '+' : ''}
            {Math.round((modifier - 1) * 100)}%)
          </div>
        </div>
        <div className="card">
          <div className="label">Средний урон</div>
          <div className="value">{formatNumber(result.average)}</div>
        </div>
      </div>

      <div className="steps">
        Расчёт: {result.steps.map((step) => `${step.text} (${step.label})`).join(' ')}
      </div>

      <p className="note">
        Формула: (кол-во существ) × (урон существа) × ((20 + ATK) / (20 + DEF)) × (общие
        модификаторы) × (типовые модификаторы, минимум 10%) × (удача). Типовые бонусы и штрафы
        сначала суммируются; после них должно остаться хотя бы 10% урона. Итог всегда наносит
        минимум 1 урона. Дальнобойная атака теряет 10% за каждый гекс сверх трёх (максимум −50%).
        Данные — официальная вики игры; игра в раннем доступе, цифры могут меняться.
      </p>
    </main>
  );
}
