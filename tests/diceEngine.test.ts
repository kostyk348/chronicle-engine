/**
 * Честные кости — тесты формул, детерминизма и commit-reveal машины.
 */
import { describe, it, expect } from 'vitest';
import {
  parseFormula, seedToRng, rollDice,
  upsertDiceCommit, applyDiceReveal, diceCommit, verifyDiceReveal,
  DiceRollEntry, DiceRevealBody,
} from '../src/utils/diceEngine';

describe('parseFormula', () => {
  it('разбирает базовые формулы и канонизирует метку', () => {
    expect(parseFormula('d20')).toMatchObject({ count: 1, sides: 20, mod: 0, label: '1d20' });
    expect(parseFormula('2d6+3')).toMatchObject({ count: 2, sides: 6, mod: 3, label: '2d6+3' });
    expect(parseFormula(' 3D8 ')).toMatchObject({ count: 3, sides: 8, mod: 0, label: '3d8' });
    expect(parseFormula('2d20kl1')).toMatchObject({ count: 2, sides: 20, keep: 'kl', keepN: 1 });
    expect(parseFormula('4d6kh3-2')).toMatchObject({ keep: 'kh', keepN: 3, mod: -2 });
  });

  it('отклоняет мусор и недопустимые параметры', () => {
    expect(parseFormula('')).toBeNull();
    expect(parseFormula('2d')).toBeNull();
    expect(parseFormula('d')).toBeNull();
    expect(parseFormula('2d6x')).toBeNull();
    expect(parseFormula('1d6+3d4')).toBeNull();
    expect(parseFormula('0d6')).toBeNull();
    expect(parseFormula('25d6')).toBeNull(); // больше 20 костей
    expect(parseFormula('d1')).toBeNull();   // монетка не по правилам
    expect(parseFormula('4d6kh9')).toBeNull(); // оставить больше, чем брошено
    expect(parseFormula('4d6kh0')).toBeNull();
  });
});

describe('rollDice + seedToRng', () => {
  it('одинаковый сид даёт одинаковый бросок, разные — разные', () => {
    const f = parseFormula('6d6')!;
    const a = rollDice(f, seedToRng('seed-А'));
    const b = rollDice(f, seedToRng('seed-А'));
    const c = rollDice(f, seedToRng('seed-Б'));
    expect(a).toEqual(b);
    expect(a.rolls).not.toEqual(c.rolls);
  });

  it('кости в пределах граней, модификатор в итоге', () => {
    const f = parseFormula('4d6+3')!;
    const r = rollDice(f, seedToRng('x'));
    expect(r.rolls).toHaveLength(4);
    for (const v of r.rolls) expect(v).toBeGreaterThanOrEqual(1);
    for (const v of r.rolls) expect(v).toBeLessThanOrEqual(6);
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) + 3);
    expect(r.detail).toBe(`4d6+3: [${r.rolls.join(',')}]→[${r.rolls.join(',')}]+3=${r.total}`);
  });

  it('kh оставляет старшие кости, kl — младшие', () => {
    const rng = () => 0; // все кости = 1
    const kh = rollDice(parseFormula('4d6kh2')!, rng);
    expect(kh.total).toBe(2); // две единицы из четырёх
    expect(kh.detail).toContain('отброшены [1,1]');
    const kl = rollDice(parseFormula('2d20kl1')!, () => 0.9999999); // все = 20
    expect(kl.total).toBe(20);
    //kh detail keeps sorted desc
    const mk = rollDice(parseFormula('3d6kh1')!, () => 0.5); // кость = floor(0.5*6)+1 = 4
    expect(mk.detail).toContain('→[4]');
  });

  it('крит и провал d20 достижимы детерминированно', () => {
    expect(rollDice(parseFormula('1d20')!, () => 0.9999999).total).toBe(20);
    expect(rollDice(parseFormula('1d20')!, () => 0).total).toBe(1);
  });
});

describe('машина бросков commit-reveal', () => {
  const honest = async (label: string, seed: string): Promise<{ body: DiceRevealBody; total: number }> => {
    const f = parseFormula(label)!;
    const r = rollDice(f, seedToRng(seed));
    const body: DiceRevealBody = {
      roll_id: 'r1', label: f.label, commit: await diceCommit(f.label, seed),
      total: r.total, detail: r.detail, seed,
    };
    return { body, total: r.total };
  };

  it('честное раскрытие проходит проверку: пересчёт из сида совпадает', async () => {
    const { body, total } = await honest('2d6+3', 'dice_abc');
    expect(await verifyDiceReveal(body)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(15);
  });

  it('подмена результата, сида или коммита ломает проверку', async () => {
    const { body } = await honest('1d20', 'dice_x');
    expect(await verifyDiceReveal({ ...body, total: 20 })).toBe(false); // перекинул результат
    expect(await verifyDiceReveal({ ...body, seed: 'dice_y' })).toBe(false); // подменил сид
    expect(await verifyDiceReveal({ ...body, commit: 'f'.repeat(64) })).toBe(false);
    expect(await verifyDiceReveal({ ...body, detail: '1d20: [1]→[1]+0=1' })).toBe(false);
    expect(await verifyDiceReveal({ ...body, label: '1d100' })).toBe(false); // формула != канон коммита
  });

  it('раскрытие неизвестной формулы отклоняется', async () => {
    const { body } = await honest('1d20', 's');
    expect(await verifyDiceReveal({ ...body, label: 'абракадабра' })).toBe(false);
  });

  it('коммит/раскрытие апсертятся по rollId без дублей', async () => {
    let rolls: DiceRollEntry[] = [];
    rolls = upsertDiceCommit(rolls, { rollId: 'a', from: 'Elena', label: '1d20', commit: 'c1' });
    rolls = upsertDiceCommit(rolls, { rollId: 'b', from: 'Torin', label: '1d20', commit: 'c2' });
    rolls = upsertDiceCommit(rolls, { rollId: 'a', from: 'Elena', label: '1d20', commit: 'c1' }); // ретрейн
    expect(rolls).toHaveLength(2);

    const { body } = await honest('1d20', 'dice_r1');
    rolls = applyDiceReveal(rolls, { ...body, roll_id: 'a', from: 'Elena' }, true);
    expect(rolls).toHaveLength(2);
    const a = rolls.find(r => r.rollId === 'a')!;
    expect(a.phase).toBe('revealed');
    expect(a.valid).toBe(true);
    expect(a.total).toBe(body.total);
    expect(rolls.find(r => r.rollId === 'b')!.phase).toBe('committed');
  });
});
