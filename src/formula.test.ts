/**
 * Тесты контракта `calculateDamage`.
 *
 * Покрывают уже учтённые калькулятором варианты расчёта: базовую формулу
 * урона, вклад характеристик героев, удачу, общие и типовые модификаторы,
 * штраф дальности и множитель режима атаки, подсчёт погибших, число
 * ударов до гибели отряда защитника, ответный удар выживших, второй удар
 * после ответа, приведение некорректного входа и формулу с подставленными
 * значениями.
 */

import { describe, expect, it } from 'vitest';
import type {
  AttackAbilities,
  AttackerStats,
  DamageResult,
  DamageStep,
  DefenderStats,
  LuckDamage,
} from './formula';
import { calculateAbilityDamage, calculateDamage } from './formula';

/** Отряд с нейтральными характеристиками: против такого же отряда все модификаторы равны 1 */
const unit = (over: Partial<AttackerStats & DefenderStats> = {}): AttackerStats & DefenderStats => ({
  count: 10,
  health: 10,
  topHealth: 10,
  damageMin: 10,
  damageMax: 10,
  attack: 10,
  defense: 10,
  heroAttack: 0,
  heroDefense: 0,
  ...over,
});

/** Атака вплотную без модификаторов и без ответного удара */
const noAbilities = (over: Partial<AttackAbilities> = {}): AttackAbilities => ({
  distance: 1,
  rangePenalty: true,
  modeMultiplier: 1,
  generalModifiers: 0,
  typeModifiers: 0,
  retaliation: false,
  doubleStrike: false,
  ...over,
});

interface CalcOverrides {
  attacker?: Partial<AttackerStats>;
  abilities?: Partial<AttackAbilities>;
  defender?: Partial<DefenderStats>;
}

/**
 * Расчёт от нейтральной базы: 10 существ бьют 10 существ уроном 10–10,
 * обычный урон без переопределений равен ровно 100.
 */
const calc = ({ attacker, abilities, defender }: CalcOverrides = {}): DamageResult =>
  calculateDamage({
    attacker: unit(attacker),
    abilities: noAbilities(abilities),
    defender: unit(defender),
  });

/** Строка обычной удачи из результата */
const normal = (result: DamageResult): LuckDamage => result.byLuck[1];

/** Числовая строка бакета: тексты токенов подряд */
const stepText = (step?: DamageStep): string | undefined =>
  step?.tokens.map((token) => token.text).join('');

describe('базовая формула', () => {
  /**
   * При равных суммарных атаке и защите модификатор АТК/ЗЩТ равен 1 и
   * урон равен произведению числа существ на урон существа.
   *
   * Условия: 10 существ с уроном 10–10 против отряда с защитой, равной
   * атаке нападающих, абилок нет.
   *
   * Ожидание: обычный урон ровно 100–100, модификатор АТК/ЗЩТ равен 1.
   */
  it('без перевеса атаки урон равен отряд × урон существа', () => {
    const result = calc();
    expect(normal(result).min).toBe(100);
    expect(normal(result).max).toBe(100);
    expect(result.attackDefenseModifier).toBe(1);
  });

  /**
   * Разброс урона существа даёт диапазон итогового урона, средний —
   * середина диапазона.
   *
   * Условия: 10 существ с уроном 10–30.
   *
   * Ожидание: обычный урон 100–300, средний 200.
   */
  it('разброс урона существа переносится на итоговый диапазон', () => {
    const result = calc({ attacker: { damageMin: 10, damageMax: 30 } });
    expect(normal(result).min).toBe(100);
    expect(normal(result).max).toBe(300);
    expect(normal(result).average).toBe(200);
  });

  /**
   * Перевес атаки над защитой умножает урон на (20 + АТК) / (20 + ЗЩТ).
   *
   * Условия: атака атакующего 30 против защиты 10, база 100 урона.
   *
   * Ожидание: модификатор 50/30 ≈ 1.67, урон 100 × 50/30 ≈ 166.7,
   * после округления 167.
   */
  it('перевес атаки усиливает урон по формуле (20 + АТК) / (20 + ЗЩТ)', () => {
    const result = calc({ attacker: { attack: 30 } });
    expect(result.attackDefenseModifier).toBeCloseTo(50 / 30);
    expect(normal(result).min).toBe(167);
    expect(normal(result).max).toBe(167);
  });

  /**
   * Дробный урон округляется до ближайшего целого, ровно 0.5 — вверх.
   *
   * Условия: одно существо против защиты 20 — модификатор АТК/ЗЩТ 0.75,
   * урон существа 2 даёт 1.5, урон 3 даёт 2.25.
   *
   * Ожидание: 1.5 округляется до 2, а 2.25 — до 2.
   */
  it('урон округляется до ближайшего целого, половина — вверх', () => {
    const half = calc({
      attacker: { count: 1, damageMin: 2, damageMax: 2 },
      defender: { defense: 20 },
    });
    expect(normal(half).min).toBe(2);

    const below = calc({
      attacker: { count: 1, damageMin: 3, damageMax: 3 },
      defender: { defense: 20 },
    });
    expect(normal(below).min).toBe(2);
  });
});

describe('характеристики героя', () => {
  /**
   * Атака героя атакующей стороны прибавляется к атаке существа.
   *
   * Условия: существо с атакой 10 и герой с атакой 20 против отряда
   * с защитой 10.
   *
   * Ожидание: результат совпадает с расчётом без героя, где у существа
   * атака 30.
   */
  it('атака героя складывается с атакой существа', () => {
    const withHero = calc({ attacker: { attack: 10, heroAttack: 20 } });
    const merged = calc({ attacker: { attack: 30 } });
    expect(withHero.byLuck).toEqual(merged.byLuck);
    expect(withHero.attackDefenseModifier).toBe(merged.attackDefenseModifier);
  });

  /**
   * Защита героя защищающейся стороны прибавляется к защите существа.
   *
   * Условия: атака нападающих 30, у защитника существо с защитой 10 и
   * герой с защитой 20.
   *
   * Ожидание: результат совпадает с расчётом без героя, где у существа
   * защита 30, то есть перевес атаки полностью погашен.
   */
  it('защита героя складывается с защитой существа', () => {
    const withHero = calc({
      attacker: { attack: 30 },
      defender: { defense: 10, heroDefense: 20 },
    });
    const merged = calc({ attacker: { attack: 30 }, defender: { defense: 30 } });
    expect(withHero.byLuck).toEqual(merged.byLuck);
    expect(normal(withHero).min).toBe(100);
  });
});

describe('удача', () => {
  /**
   * Результат содержит три строки в порядке неудача, обычный, удача:
   * неудача даёт половину обычного урона, удача — полтора обычного.
   *
   * Условия: база с обычным уроном 100.
   *
   * Ожидание: строки 50, 100 и 150 в указанном порядке.
   */
  it('неудача даёт ×0.5, удача — ×1.5 обычного урона', () => {
    const result = calc();
    expect(result.byLuck.map((row) => row.luck)).toEqual(['unlucky', 'normal', 'lucky']);
    expect(result.byLuck.map((row) => row.min)).toEqual([50, 100, 150]);
  });
});

describe('общие и типовые модификаторы', () => {
  /**
   * Сумма общих модификаторов прибавляется к 100% урона, отрицательная —
   * вычитается.
   *
   * Условия: база с обычным уроном 100, общие модификаторы +50% и −25%.
   *
   * Ожидание: урон 150 и 75 соответственно.
   */
  it('общие модификаторы смещают урон на свой процент', () => {
    expect(normal(calc({ abilities: { generalModifiers: 50 } })).min).toBe(150);
    expect(normal(calc({ abilities: { generalModifiers: -25 } })).min).toBe(75);
  });

  /**
   * Типовые штрафы не могут срезать больше 90% урона: после них остаётся
   * минимум 10%.
   *
   * Условия: база с обычным уроном 100, типовые модификаторы −95%.
   *
   * Ожидание: урон 10 (а не 5), взведён признак ограничения.
   */
  it('типовые штрафы ограничены порогом в 10% урона', () => {
    const result = calc({ abilities: { typeModifiers: -95 } });
    expect(normal(result).min).toBe(10);
    expect(result.typeCapped).toBe(true);
  });

  /**
   * Типовые штрафы выше порога применяются как есть, без ограничения.
   *
   * Условия: база с обычным уроном 100, типовые модификаторы −50%.
   *
   * Ожидание: урон 50, признак ограничения не взведён.
   */
  it('типовые штрафы до порога применяются полностью', () => {
    const result = calc({ abilities: { typeModifiers: -50 } });
    expect(normal(result).min).toBe(50);
    expect(result.typeCapped).toBe(false);
  });

  /**
   * Какими бы ни были штрафы, удар наносит хотя бы 1 урона.
   *
   * Условия: одно существо с уроном 1, типовые штрафы срезают урон
   * до 0.1.
   *
   * Ожидание: итоговый урон равен 1.
   */
  it('удар всегда наносит минимум 1 урона', () => {
    const result = calc({
      attacker: { count: 1, damageMin: 1, damageMax: 1 },
      abilities: { typeModifiers: -95 },
    });
    expect(normal(result).min).toBe(1);
    expect(normal(result).max).toBe(1);
  });

  /**
   * У общих штрафов нет нижнего порога: множитель уходит в минус, но
   * урон не становится отрицательным благодаря минимуму в 1.
   *
   * Условия: общие модификаторы −150%.
   *
   * Ожидание: срабатывает минимум — урон 1.
   */
  it('общие штрафы ниже −100% оставляют минимум в 1 урона', () => {
    const result = calc({ abilities: { generalModifiers: -150 } });
    expect(normal(result).min).toBe(1);
  });
});

describe('дальность и режим атаки', () => {
  /**
   * Стрельба на дистанцию до трёх гексов включительно идёт без штрафа.
   *
   * Условия: база с обычным уроном 100, цель в трёх гексах.
   *
   * Ожидание: урон 100 без изменений.
   */
  it('до трёх гексов штрафа за дальность нет', () => {
    expect(normal(calc({ abilities: { distance: 3 } })).min).toBe(100);
  });

  /**
   * Каждый гекс сверх третьего отнимает 10% урона.
   *
   * Условия: база с обычным уроном 100, цель в шести гексах — три гекса
   * сверх бесплатных.
   *
   * Ожидание: урон 70.
   */
  it('каждый гекс сверх трёх отнимает 10% урона', () => {
    expect(normal(calc({ abilities: { distance: 6 } })).min).toBe(70);
  });

  /**
   * Штраф за дальность не превышает половины урона даже на предельной
   * дистанции.
   *
   * Условия: база с обычным уроном 100, цель в двадцати гексах — без
   * ограничения штраф составил бы 170%.
   *
   * Ожидание: урон 50.
   */
  it('штраф за дальность ограничен −50%', () => {
    expect(normal(calc({ abilities: { distance: 20 } })).min).toBe(50);
  });

  /**
   * Множитель режима атаки режет итог и перемножается со штрафом
   * дальности.
   *
   * Условия: база с обычным уроном 100: один расчёт только с режимом
   * ×0.5, второй — с режимом ×0.5 и целью в шести гексах.
   *
   * Ожидание: урон 50 в первом случае и 100 × 0.7 × 0.5 = 35 во втором.
   */
  it('множитель режима перемножается со штрафом дальности', () => {
    expect(normal(calc({ abilities: { modeMultiplier: 0.5 } })).min).toBe(50);
    expect(normal(calc({ abilities: { modeMultiplier: 0.5, distance: 6 } })).min).toBe(35);
  });

  /**
   * Без штрафа дальности («Снайпер») дистанция не влияет на урон.
   *
   * Условия: база с обычным уроном 100, цель в двадцати гексах, штраф
   * дальности выключен.
   *
   * Ожидание: урон 100 без изменений.
   */
  it('без штрафа дальности дистанция не влияет на урон', () => {
    expect(normal(calc({ abilities: { rangePenalty: false, distance: 20 } })).min).toBe(100);
  });

  /**
   * Режим ближнего боя стрелка не зависит от дистанции: множитель режима
   * применяется, а штраф дальности выключен.
   *
   * Условия: база с обычным уроном 100, режим ×0.5 без штрафа дальности,
   * цель в шести гексах.
   *
   * Ожидание: урон 50 — дистанция игнорируется.
   */
  it('режим без штрафа дальности игнорирует дистанцию', () => {
    const result = calc({
      abilities: { modeMultiplier: 0.5, rangePenalty: false, distance: 6 },
    });
    expect(normal(result).min).toBe(50);
  });
});

describe('погибшие защитника', () => {
  /**
   * Первым гибнет верхний юнит с неполным здоровьем, затем урон делится
   * на полное здоровье существа с округлением вниз.
   *
   * Условия: у защитника существа по 10 здоровья, верхний юнит ранен
   * до 4. Три удара: на 3, на 13 и на 24 урона.
   *
   * Ожидание: удар на 3 не убивает никого, удар на 13 убивает только
   * верхнего (остаток 9 меньше полного здоровья), удар на 24 убивает
   * верхнего и двух целых.
   */
  it('первым гибнет раненый верхний юнит, дальше — по полному здоровью', () => {
    const defender = { count: 5, health: 10, topHealth: 4 };
    const hit = (damage: number) =>
      normal(calc({ attacker: { count: 1, damageMin: damage, damageMax: damage }, defender }));
    expect(hit(3).killsMin).toBe(0);
    expect(hit(13).killsMin).toBe(1);
    expect(hit(24).killsMin).toBe(3);
  });

  /**
   * Расчётное число погибших не ограничивается размером отряда: избыток
   * урона продолжает делиться на здоровье существа.
   *
   * Условия: удар на 1000 урона по отряду из 2 существ с 10 здоровья.
   *
   * Ожидание: расчётные потери 100 существ, хотя в отряде только 2.
   */
  it('число погибших не ограничено размером отряда', () => {
    const result = calc({
      attacker: { damageMin: 100, damageMax: 100 },
      defender: { count: 2 },
    });
    expect(normal(result).killsMax).toBe(100);
  });
});

describe('ударов до гибели отряда', () => {
  /**
   * Число ударов — суммарное здоровье отряда защитника, делённое на урон
   * строки с округлением вверх; границы диапазона считаются по
   * максимальному (быстрее всего) и минимальному урону.
   *
   * Условия: нейтральная база с уроном существа 3–5 → урон отряда 30–50,
   * здоровье защитника 10 × 10 = 100.
   *
   * Ожидание: от ⌈100/50⌉ = 2 до ⌈100/30⌉ = 4 ударов.
   */
  it('диапазон ударов считается по максимальному и минимальному урону', () => {
    const result = calc({ attacker: { damageMin: 3, damageMax: 5 } });
    expect(normal(result).strikesMin).toBe(2);
    expect(normal(result).strikesMax).toBe(4);
  });

  /**
   * Неполное здоровье верхнего юнита уменьшает суммарное здоровье отряда
   * и может сократить число ударов.
   *
   * Условия: удар на 13 урона по 3 существам с 10 здоровья; верхний юнит
   * ранен до 5 → суммарно 25 здоровья вместо 30.
   *
   * Ожидание: ⌈25/13⌉ = 2 удара вместо ⌈30/13⌉ = 3 при полном здоровье.
   */
  it('неполное здоровье верхнего юнита сокращает число ударов', () => {
    const attacker = { count: 1, damageMin: 13, damageMax: 13 };
    const wounded = calc({ attacker, defender: { count: 3, topHealth: 5 } });
    const full = calc({ attacker, defender: { count: 3 } });
    expect(normal(wounded).strikesMax).toBe(2);
    expect(normal(full).strikesMax).toBe(3);
  });

  /**
   * Число ударов считается по урону своей строки удачи.
   *
   * Условия: нейтральная база — неудача 50, обычный 100, удача 150;
   * здоровье отряда защитника 100.
   *
   * Ожидание: неудача — 2 удара, обычный и удача — 1.
   */
  it('удача учитывается в числе ударов', () => {
    const result = calc();
    expect(result.byLuck[0].strikesMax).toBe(2);
    expect(normal(result).strikesMax).toBe(1);
    expect(result.byLuck[2].strikesMin).toBe(1);
  });
});

describe('ответный удар', () => {
  /**
   * Без ответного удара расчёт ответа не выполняется.
   *
   * Условия: база, ответный удар выключен.
   *
   * Ожидание: во всех строках удачи ответ отсутствует.
   */
  it('при выключенном ответном ударе ответа нет', () => {
    const result = calc();
    for (const row of result.byLuck) expect(row.retaliation).toBeNull();
  });

  /**
   * Выжившие после удара существа защитника отвечают своим уроном со
   * своим модификатором АТК/ЗЩТ, а их потери считаются по здоровью
   * атакующего.
   *
   * Условия: 4 существа бьют на 40 урона отряд из 10 существ по 10
   * здоровья (суммарно 100), урон защитника 5–5, модификаторы обеих
   * сторон равны 1.
   *
   * Ожидание: выживает 6 существ, ответ 30 урона, от него гибнут 3
   * атакующих с 10 здоровья.
   */
  it('выжившие отвечают своим уроном со своим модификатором', () => {
    const result = calc({
      attacker: { count: 4 },
      defender: { damageMin: 5, damageMax: 5 },
      abilities: { retaliation: true },
    });
    const retaliation = normal(result).retaliation;
    expect(retaliation?.survivorsMax).toBe(6);
    expect(retaliation?.min).toBe(30);
    expect(retaliation?.max).toBe(30);
    expect(retaliation?.killsMax).toBe(3);
  });

  /**
   * Диапазон ответа строится от худшего и лучшего исхода атаки: после
   * максимального урона выживших меньше, после минимального — больше.
   *
   * Условия: 4 существа бьют на 40–80 урона отряд с суммарным здоровьем
   * 100 по 10 на существо, урон защитника 3–5.
   *
   * Ожидание: после максимального удара выживают 2 существа и отвечают
   * минимум на 6, после минимального выживают 6 и отвечают максимум
   * на 30.
   */
  it('диапазон ответа считается от мин и макс урона атаки', () => {
    const result = calc({
      attacker: { count: 4, damageMin: 10, damageMax: 20 },
      defender: { damageMin: 3, damageMax: 5 },
      abilities: { retaliation: true },
    });
    const retaliation = normal(result).retaliation;
    expect(retaliation?.survivorsMin).toBe(2);
    expect(retaliation?.survivorsMax).toBe(6);
    expect(retaliation?.min).toBe(6);
    expect(retaliation?.max).toBe(30);
  });

  /**
   * Число выживших округляется вверх: существо с остатком здоровья
   * участвует в ответе.
   *
   * Условия: удар на 45 урона по отряду с суммарным здоровьем 100 по 10
   * на существо — остаётся 55 здоровья, то есть 5 целых существ и одно
   * раненое.
   *
   * Ожидание: в ответе участвуют 6 существ.
   */
  it('раненое существо участвует в ответном ударе', () => {
    const result = calc({
      attacker: { count: 1, damageMin: 45, damageMax: 45 },
      abilities: { retaliation: true },
    });
    expect(normal(result).retaliation?.survivorsMax).toBe(6);
  });

  /**
   * Удача, общие и типовые модификаторы, дальность и половинный урон не
   * входят в ставку ответа — они влияют лишь на урон атаки и через него
   * на число выживших.
   *
   * Условия: атака с общими модификаторами +100%, дистанцией 6 гексов и
   * режимом ×0.5 по отряду с большим запасом здоровья, чтобы при
   * любой удаче выжили все 10 существ защитника с уроном 5–5.
   *
   * Ожидание: во всех строках удачи ответ одинаков и равен
   * 10 × 5 × 1 = 50.
   */
  it('модификаторы атаки и удача не влияют на ставку ответа', () => {
    const result = calc({
      attacker: { count: 4 },
      defender: { count: 10, health: 1000, topHealth: 1000, damageMin: 5, damageMax: 5 },
      abilities: { retaliation: true, generalModifiers: 100, distance: 6, modeMultiplier: 0.5 },
    });
    for (const row of result.byLuck) {
      expect(row.retaliation?.min).toBe(50);
      expect(row.retaliation?.max).toBe(50);
    }
  });

  /**
   * Модификатор ответа складывает атаку существа и героя защитника
   * против защиты существа и героя атакующего.
   *
   * Условия: у защитника атака 10 и герой с атакой 15, у атакующего
   * защита 10 и герой с защитой 5, в ответе участвуют все 10 существ
   * защитника с уроном 5–5.
   *
   * Ожидание: модификатор ответа 45/35, ответ 50 × 45/35 ≈ 64.3, после
   * округления 64.
   */
  it('модификатор ответа учитывает героев обеих сторон', () => {
    const result = calc({
      attacker: { count: 4, defense: 10, heroDefense: 5 },
      defender: { health: 1000, topHealth: 1000, damageMin: 5, damageMax: 5, heroAttack: 15 },
      abilities: { retaliation: true },
    });
    expect(result.retaliationModifier).toBeCloseTo(45 / 35);
    expect(normal(result).retaliation?.min).toBe(64);
  });

  /**
   * Если атака уничтожает отряд целиком, отвечать некому.
   *
   * Условия: удар на 100 урона по отряду с суммарным здоровьем ровно 100.
   *
   * Ожидание: выживших нет, урон ответа равен 0.
   */
  it('уничтоженный отряд не отвечает', () => {
    const result = calc({ abilities: { retaliation: true } });
    const retaliation = normal(result).retaliation;
    expect(retaliation?.survivorsMax).toBe(0);
    expect(retaliation?.max).toBe(0);
  });

  /**
   * Пока есть хотя бы один выживший, ответ наносит минимум 1 урона.
   *
   * Условия: выживает одно существо с уроном 1 против атакующего с
   * защитой 100 — расчётный ответ 0.25 урона.
   *
   * Ожидание: ответ равен 1.
   */
  it('ответ выживших наносит минимум 1 урона', () => {
    const result = calc({
      attacker: { count: 4, defense: 100 },
      defender: { count: 1, health: 100, topHealth: 100, damageMin: 1, damageMax: 1 },
      abilities: { retaliation: true },
    });
    expect(normal(result).retaliation?.min).toBe(1);
  });
});

describe('второй удар', () => {
  /**
   * Без двойного удара второй удар не считается.
   *
   * Условия: база, doubleStrike выключен.
   *
   * Ожидание: во всех строках удачи второй удар отсутствует.
   */
  it('без двойного удара второго удара нет', () => {
    const result = calc();
    for (const row of result.byLuck) expect(row.secondStrike).toBeNull();
  });

  /**
   * Без ответного удара второй удар наносит весь отряд, а погибшие
   * считаются по остатку отряда защитника после первого удара.
   *
   * Условия: 10 существ бьют на 100 урона отряд из 10 существ по 100
   * здоровья, ответный удар выключен.
   *
   * Ожидание: первый удар убивает 1 существо; во втором ударе участвуют
   * все 10 атакующих, урон снова 100 и убивает ещё 1 существо.
   */
  it('без ответа второй удар равен первому и бьёт по остатку', () => {
    const result = calc({
      defender: { health: 100, topHealth: 100 },
      abilities: { doubleStrike: true },
    });
    const second = normal(result).secondStrike;
    expect(normal(result).killsMin).toBe(1);
    expect(second?.attackersMin).toBe(10);
    expect(second?.attackersMax).toBe(10);
    expect(second?.min).toBe(100);
    expect(second?.max).toBe(100);
    expect(second?.killsMin).toBe(1);
  });

  /**
   * С ответным ударом второй удар наносят только выжившие атакующие.
   *
   * Условия: 4 существа по 10 здоровья бьют на 40 урона отряд из 10
   * существ по 10 здоровья с уроном 5–5, ответный удар включён.
   *
   * Ожидание: выживает 6 защитников, ответ 30 урона оставляет из
   * атакующих одно существо; второй удар 1 × 10 = 10 и убивает 1
   * защитника из оставшихся.
   */
  it('второй удар наносят выжившие после ответа', () => {
    const result = calc({
      attacker: { count: 4 },
      defender: { damageMin: 5, damageMax: 5 },
      abilities: { retaliation: true, doubleStrike: true },
    });
    const second = normal(result).secondStrike;
    expect(normal(result).retaliation?.max).toBe(30);
    expect(second?.attackersMin).toBe(1);
    expect(second?.attackersMax).toBe(1);
    expect(second?.min).toBe(10);
    expect(second?.max).toBe(10);
    expect(second?.killsMin).toBe(1);
  });

  /**
   * Если ответ уничтожает атакующий отряд, второго удара нет.
   *
   * Условия: 4 существа по 10 здоровья бьют на 40 урона отряд с уроном
   * 10–10 — 6 выживших отвечают на 60 по отряду с суммарным здоровьем 40.
   *
   * Ожидание: атакующих не осталось, урон второго удара равен 0.
   */
  it('уничтоженный ответом отряд не бьёт второй раз', () => {
    const result = calc({
      attacker: { count: 4 },
      abilities: { retaliation: true, doubleStrike: true },
    });
    const second = normal(result).secondStrike;
    expect(second?.attackersMin).toBe(0);
    expect(second?.attackersMax).toBe(0);
    expect(second?.min).toBe(0);
    expect(second?.max).toBe(0);
  });

  /**
   * Удача действует одинаково на оба удара: строка удачи умножает и
   * первый, и второй удар на свой множитель.
   *
   * Условия: база против отряда с большим запасом здоровья, двойной удар
   * без ответа.
   *
   * Ожидание: второй удар в строках неудачи, обычной и удачи равен
   * 50, 100 и 150 — как и первый.
   */
  it('удача действует на оба удара одинаково', () => {
    const result = calc({
      defender: { health: 1000, topHealth: 1000 },
      abilities: { doubleStrike: true },
    });
    expect(result.byLuck.map((row) => row.secondStrike?.min)).toEqual([50, 100, 150]);
    expect(result.byLuck.map((row) => row.min)).toEqual([50, 100, 150]);
  });

  /**
   * Пока есть хотя бы один выживший атакующий, второй удар наносит
   * минимум 1 урона.
   *
   * Условия: одно существо с уроном 1 и типовыми штрафами до 10% урона,
   * двойной удар без ответа.
   *
   * Ожидание: второй удар равен 1.
   */
  it('второй удар наносит минимум 1 урона', () => {
    const result = calc({
      attacker: { count: 1, damageMin: 1, damageMax: 1 },
      abilities: { typeModifiers: -95, doubleStrike: true },
    });
    expect(normal(result).secondStrike?.min).toBe(1);
  });
});

describe('приведение некорректного входа', () => {
  /**
   * Некорректные значения не ломают расчёт, а приводятся к допустимым.
   *
   * Условия: отряд из 0 существ с отрицательной атакой и максимальным
   * уроном меньше минимального (10–5) против защиты 10.
   *
   * Ожидание: считается 1 существо с уроном 10–10 и атакой 0 — урон
   * 10 × 20/30 ≈ 6.7, после округления 7 и для минимума, и для
   * максимума.
   */
  it('количество, атака и диапазон урона приводятся к допустимым', () => {
    const result = calc({
      attacker: { count: 0, attack: -5, damageMin: 10, damageMax: 5 },
    });
    expect(normal(result).min).toBe(7);
    expect(normal(result).max).toBe(7);
  });

  /**
   * Неполное здоровье верхнего юнита не может превышать полное здоровье
   * существа.
   *
   * Условия: у защитника существа по 10 здоровья, а неполное здоровье
   * указано как 50. Удар на 10 урона.
   *
   * Ожидание: верхний юнит считается со здоровьем 10 и погибает.
   */
  it('неполное здоровье ограничивается полным', () => {
    const result = calc({
      attacker: { count: 1 },
      defender: { count: 5, health: 10, topHealth: 50 },
    });
    expect(normal(result).killsMax).toBe(1);
  });
});

describe('урон способности', () => {
  const defender = { count: 10, health: 10, topHealth: 10 };

  /**
   * Доля урона обычной атаки: урон равен отряд × урон × доля, без
   * АТК/ЗЩТ и удачи.
   *
   * Условия: 10 существ с уроном 10–20, доля 0.5.
   *
   * Ожидание: урон 50–100, средний 75, погибших 5–10 при здоровье 10.
   */
  it('доля урона обычной атаки считается без АТК/ЗЩТ', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 10,
      damageMax: 20,
      factor: 0.5,
      defender,
    });
    expect(result.min).toBe(50);
    expect(result.max).toBe(100);
    expect(result.average).toBe(75);
    expect(result.killsMin).toBe(5);
    expect(result.killsMax).toBe(10);
  });

  /**
   * Способность, игнорирующая защиту, усиливается модификатором
   * (20 + атака юнита + атака героя) / 20, и он раскрыт бакетом формулы.
   *
   * Условия: 10 существ с уроном 10–10, доля 1, атака юнита 8 и героя 2 —
   * модификатор (20 + 8 + 2) / 20 = 1.5.
   *
   * Ожидание: урон 150; в формуле бакет «(20 + 8 + 2) / 20» с легендой из
   * названий атак.
   */
  it('модификатор атаки усиливает способность без защиты', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 10,
      damageMax: 10,
      factor: 1,
      attack: { unit: 8, hero: 2 },
      defender,
    });
    expect(result.min).toBe(150);
    const step = result.steps.find((s) => s.formula.endsWith('/ 20'));
    expect(stepText(step)).toBe('(20 + 8 + 2) / 20');
    expect(step?.formula).toBe('(20 + атака юнита + атака героя) / 20');
  });

  /**
   * Фиксированная формула: урон равен base + perUnit × количество, без
   * разброса.
   *
   * Условия: формула 15 + 3 × 10 существ.
   *
   * Ожидание: урон ровно 45, погибших 4.
   */
  it('фиксированная формула не зависит от урона существа', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 999,
      damageMax: 999,
      base: 15,
      perUnit: 3,
      defender,
    });
    expect(result.min).toBe(45);
    expect(result.max).toBe(45);
    expect(result.killsMin).toBe(4);
  });

  /**
   * Фиксированная формула без множителя количества — удар героя: урон
   * равен base, а шаг формулы показывает только базу без «+ 0 × 1».
   *
   * Условия: формула 66 + 0 × 1.
   *
   * Ожидание: урон 66, текст шага «66».
   */
  it('фиксированная формула без perUnit показывает только базу', () => {
    const result = calculateAbilityDamage({
      count: 1,
      damageMin: 0,
      damageMax: 0,
      base: 66,
      perUnit: 0,
      defender,
    });
    expect(result.min).toBe(66);
    expect(result.max).toBe(66);
    expect(stepText(result.steps[0])).toBe('66');
  });

  /**
   * Снижение урона защитой цели уменьшает урон способности на свой
   * процент.
   *
   * Условия: формула 6 × 10 = 60 магического урона, защита от магии −60%.
   *
   * Ожидание: урон 24.
   */
  it('защита цели снижает урон способности', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 0,
      damageMax: 0,
      base: 0,
      perUnit: 6,
      reduction: -60,
      defender,
    });
    expect(result.min).toBe(24);
  });

  /**
   * Нулевая формула даёт нулевой урон: минимум в 1 урона на способности
   * не распространяется.
   *
   * Условия: формула 0 × количество.
   *
   * Ожидание: урон 0, погибших нет.
   */
  it('нулевая формула наносит 0 урона', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 5,
      damageMax: 5,
      base: 0,
      perUnit: 0,
      defender,
    });
    expect(result.min).toBe(0);
    expect(result.killsMin).toBe(0);
  });

  /**
   * Число ударов способности до гибели отряда считается как у обычной
   * атаки: суммарное здоровье, делённое на урон с округлением вверх.
   *
   * Условия: доля 0.5 от 10 × (10–20) → урон 50–100, у защитника
   * 10 × 10 = 100 здоровья.
   *
   * Ожидание: от ⌈100/100⌉ = 1 до ⌈100/50⌉ = 2 ударов.
   */
  it('способность считает удары до гибели отряда', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 10,
      damageMax: 20,
      factor: 0.5,
      defender,
    });
    expect(result.strikesMin).toBe(1);
    expect(result.strikesMax).toBe(2);
  });

  /**
   * Нулевой урон не убивает отряд, поэтому вместо числа ударов
   * возвращается null; при нулевом только минимальном уроне нет верхней
   * границы, но нижняя считается по максимальному урону.
   *
   * Условия: формула 0 × количество; доля 1 от 10 × (0–20) → урон 0–200.
   *
   * Ожидание: у нулевой формулы обе границы null; при уроне 0–200 нижняя
   * граница ⌈100/200⌉ = 1, верхняя null.
   */
  it('нулевой урон даёт null вместо числа ударов', () => {
    const zero = calculateAbilityDamage({
      count: 10,
      damageMin: 5,
      damageMax: 5,
      base: 0,
      perUnit: 0,
      defender,
    });
    expect(zero.strikesMin).toBeNull();
    expect(zero.strikesMax).toBeNull();

    const noMin = calculateAbilityDamage({
      count: 10,
      damageMin: 0,
      damageMax: 20,
      factor: 1,
      defender,
    });
    expect(noMin.strikesMin).toBe(1);
    expect(noMin.strikesMax).toBeNull();
  });

  /**
   * Формула способности раскрывается по бакетам: отряд × урон и доля,
   * числа несут названия параметров, легенда повторяет выражение.
   *
   * Условия: 10 существ с уроном 10–20, доля 0.5.
   *
   * Ожидание: первый бакет «10 × (10–20)» с подписью «урон отряда» и
   * легендой из названий количества и урона, второй — «0.5» с подписью
   * «доля от обычной атаки»; у числа 10 параметр «существа в отряде».
   */
  it('формула способности раскрыта по бакетам', () => {
    const result = calculateAbilityDamage({
      count: 10,
      damageMin: 10,
      damageMax: 20,
      factor: 0.5,
      defender,
    });
    expect(result.steps[0].label).toBe('урон отряда');
    expect(stepText(result.steps[0])).toBe('10 × (10–20)');
    expect(result.steps[0].formula).toBe('существа в отряде × (минимальный урон – максимальный урон)');
    expect(result.steps[0].tokens[0].param).toBe('существа в отряде');
    expect(result.steps[1].label).toBe('доля от обычной атаки');
    expect(stepText(result.steps[1])).toBe('0.5');
    expect(result.steps[1].formula).toBe('доля урона');
  });
});

describe('формула с подставленными значениями', () => {
  /**
   * Множитель АТК/ЗЩТ раскрывается по слагаемым: константа 20, атака
   * юнита и атака героя против константы 20, защиты юнита и защиты
   * героя; легенда повторяет выражение названиями параметров, у каждого
   * числа — свой параметр для подсказки.
   *
   * Условия: атака существа 30 и героя 5 против защиты существа 12 и
   * героя 3.
   *
   * Ожидание: бакет «(20 + 30 + 5) / (20 + 12 + 3)» с подписью
   * «соотношение атаки и защиты» и легендой «(20 + атака юнита + атака
   * героя) / (20 + защита юнита + защита героя)»; у числа 5 параметр
   * «атака героя», константа 20 без параметра.
   */
  it('множитель АТК/ЗЩТ раскрыт по слагаемым', () => {
    const result = calc({
      attacker: { attack: 30, heroAttack: 5 },
      defender: { defense: 12, heroDefense: 3 },
    });
    const step = result.steps.find((s) => s.label === 'соотношение атаки и защиты');
    expect(stepText(step)).toBe('(20 + 30 + 5) / (20 + 12 + 3)');
    expect(step?.formula).toBe(
      '(20 + атака юнита + атака героя) / (20 + защита юнита + защита героя)',
    );
    expect(step?.tokens.find((token) => token.text === '5')?.param).toBe('атака героя');
    expect(step?.tokens[0].param).toBeUndefined();
  });

  /**
   * Сработавшее ограничение типовых модификаторов видно в формуле как
   * взятие максимума с порогом 0.1 — и в числах, и в легенде.
   *
   * Условия: типовые модификаторы −95%.
   *
   * Ожидание: бакет «max(0.1; 1 − 95/100)» с легендой
   * «max(0.1; 1 + типовые модификаторы/100)».
   */
  it('ограничение типовых модификаторов видно в формуле', () => {
    const result = calc({ abilities: { typeModifiers: -95 } });
    const step = result.steps.find((s) => s.label === 'типовые модификаторы');
    expect(stepText(step)).toBe('max(0.1; 1 − 95/100)');
    expect(step?.formula).toBe('max(0.1; 1 + типовые модификаторы/100)');
  });

  /**
   * Штраф дальности раскрывается в формуле по гексам сверх бесплатных, а
   * без действующего штрафа бакета дальности в формуле нет.
   *
   * Условия: два расчёта — цель в шести гексах и вплотную.
   *
   * Ожидание: в первом бакет «1 − 0.1×(6−3)» с легендой из дистанции; во
   * втором бакета дальности нет.
   */
  it('штраф дальности раскрыт по гексам', () => {
    const result = calc({ abilities: { distance: 6 } });
    const step = result.steps.find((s) => s.label === 'штраф дальности');
    expect(stepText(step)).toBe('1 − 0.1×(6−3)');
    expect(step?.formula).toBe('1 − 0.1×(дистанция в гексах − 3)');
    expect(step?.tokens.find((token) => token.text === '6')?.param).toBe('дистанция в гексах');

    const close = calc();
    expect(close.steps.find((s) => s.label === 'штраф дальности')).toBeUndefined();
  });

  /**
   * Множитель режима атаки попадает в формулу отдельным бакетом только
   * когда он отличен от единицы.
   *
   * Условия: два расчёта — с режимом ×0.5 и с режимом ×1.
   *
   * Ожидание: в первом есть бакет «0.5» с легендой «множитель режима
   * атаки», во втором такого бакета нет.
   */
  it('множитель режима виден в формуле только при отличии от единицы', () => {
    const half = calc({ abilities: { modeMultiplier: 0.5 } });
    const step = half.steps.find((s) => s.label === 'режим атаки');
    expect(stepText(step)).toBe('0.5');
    expect(step?.formula).toBe('множитель режима атаки');

    const base = calc();
    expect(base.steps.find((s) => s.label === 'режим атаки')).toBeUndefined();
  });

  /**
   * Формула второго удара строится от выживших атакующих и повторяет
   * множители первого удара.
   *
   * Условия: нейтральная база с уроном существа 10–10.
   *
   * Ожидание: первый бакет — «выжившие атакующие × (10–10)», остальные
   * совпадают с множителями первого удара без его первого бакета.
   */
  it('формула второго удара строится от выживших атакующих', () => {
    const result = calc();
    expect(stepText(result.secondStrikeSteps[0])).toBe('выжившие атакующие × (10–10)');
    expect(result.secondStrikeSteps[0]?.formula).toBe(
      'выжившие атакующие × (минимальный урон – максимальный урон)',
    );
    expect(result.secondStrikeSteps.slice(1)).toEqual(result.steps.slice(1));
  });

  /**
   * Формула ответного удара раскрывает модификатор по слагаемым сторон:
   * атака существа и героя защитника против защиты существа и героя
   * атакующего.
   *
   * Условия: нейтральная база — атака защитника 10 без героя, защита
   * атакующего 10 без героя.
   *
   * Ожидание: в формуле ответа бакет «(20 + 10 + 0) / (20 + 10 + 0)» с
   * легендой из названий атак и защит.
   */
  it('формула ответа раскрывает модификатор по слагаемым', () => {
    const result = calc();
    const step = result.retaliationSteps.find((s) => s.formula.startsWith('(20'));
    expect(stepText(step)).toBe('(20 + 10 + 0) / (20 + 10 + 0)');
    expect(step?.formula).toBe(
      '(20 + атака юнита + атака героя) / (20 + защита юнита + защита героя)',
    );
  });
});
