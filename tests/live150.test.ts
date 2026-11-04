/**
 * 1.5.0 — живая карта (token_move), импорт D&D Beyond, джус реплея.
 */
import { describe, it, expect } from 'vitest';
import { normalizeTokenMove, TABLE_WIDTH, TABLE_HEIGHT } from '../src/utils/linkProtocol';
import { parseDdbSheet, abilityMod, proficiencyBonus } from '../src/utils/ddbImport';
import { buildReplayTimeline, spawnParticles, mulberry32 } from '../src/utils/roundReplay';
import { RoundEvent } from '../src/utils/wegoResolver';

// ---------------------------------------------------------------- token_move

describe('normalizeTokenMove (token_move)', () => {
  it('валидный ход проходит с целыми клетками', () => {
    const mv = normalizeTokenMove({ entity_id: 'mob_shaman', pos: [5, 7], round: 3 });
    expect(mv).toEqual({ entityId: 'mob_shaman', pos: [5, 7], round: 3 });
  });

  it('мусор отбрасывается молча: не объект, нет id, не пара, дробные координаты', () => {
    expect(normalizeTokenMove(null)).toBeNull();
    expect(normalizeTokenMove('x')).toBeNull();
    expect(normalizeTokenMove({ pos: [1, 1] })).toBeNull();            // нет entity_id
    expect(normalizeTokenMove({ entity_id: 'a', pos: [1] })).toBeNull();
    expect(normalizeTokenMove({ entity_id: 'a', pos: [1.5, 2] })).toBeNull();
    expect(normalizeTokenMove({ entity_id: 'a', pos: ['1', 2] })).toBeNull();
  });

  it('подделки за границей поля не проходят', () => {
    expect(normalizeTokenMove({ entity_id: 'a', pos: [-1, 0] })).toBeNull();
    expect(normalizeTokenMove({ entity_id: 'a', pos: [0, TABLE_HEIGHT] })).toBeNull();
    expect(normalizeTokenMove({ entity_id: 'a', pos: [TABLE_WIDTH, 0] })).toBeNull();
    expect(normalizeTokenMove({ entity_id: 'a', pos: [15, 11] })).not.toBeNull(); // край поля — можно
  });

  it('round неизвестен — остаётся 0, ход всё равно валиден', () => {
    const mv = normalizeTokenMove({ entity_id: 'a', pos: [3, 3] });
    expect(mv?.round).toBe(0);
  });
});

// ---------------------------------------------------------------- ddbImport

describe('parseDdbSheet (импорт листов)', () => {
  it('плоский формат: производные считаются, а не копируются', () => {
    const { sheet, warnings } = parseDdbSheet(
      JSON.stringify({
        name: 'Каэль', race: 'Эльф', characterClass: 'Волшебник', level: 5,
        hp: 32, ac: 14, speed: 30, str: 8, dex: 16, con: 14, int: 18, wis: 12, cha: 10, xp: 6500,
      }),
      'test_1'
    );
    expect(sheet.name).toBe('Каэль');
    expect(sheet.level).toBe(5);
    expect(sheet.maxHp).toBe(32);
    expect(sheet.stats.int).toBe(18);
    expect(sheet.initiativeBonus).toBe(3);          // мод от ЛОВ 16
    expect(sheet.proficiencyBonus).toBe(3);          // уровень 5 → +3
    expect(sheet.spellSlots.level1.total).toBe(4);   // полный заклинатель 5 ур.
    expect(sheet.spellSlots.level3.total).toBe(2);
    expect(sheet.nextLevelXp).toBe(14000);
    // единственное ожидаемое предупреждение — про непереносящиеся заклинания/инвентарь
    expect(warnings).toEqual(['Заклинания и инвентарь из экспорта не переносятся — заполните вручную']);
  });

  it('DDB-экспорт: классы/раса объектами, stats по id, HP из base+levelUp', () => {
    const { sheet } = parseDdbSheet(
      JSON.stringify({
        name: 'Torin',
        race: { fullName: 'Горный дварф' },
        classes: [{ definition: { name: 'Fighter' }, level: 4 }],
        baseHitPoints: 38, bonusHitPoints: 0, levelUpHitPoints: 6,
        armorClass: 17,
        stats: [
          { id: 1, value: 16 }, { id: 2, value: 12 }, { id: 3, value: 14 },
          { id: 4, value: 9 }, { id: 5, value: 13 }, { id: 6, value: 10 },
        ],
        speed: { walk: 25 },
      }),
      'test_2'
    );
    expect(sheet.race).toBe('Горный дварф');
    expect(sheet.characterClass).toBe('Fighter');
    expect(sheet.level).toBe(4);
    expect(sheet.maxHp).toBe(44);                    // 38 + 6
    expect(sheet.stats.str).toBe(16);
    expect(sheet.speed).toBe(25);
    expect(sheet.proficiencyBonus).toBe(2);
    // не-заклинатель: ячеек нет, и это не предупреждение
    expect(sheet.spellSlots.level1.total).toBe(0);
  });

  it('не хватает данных — честные предупреждения, а не падение', () => {
    const { sheet, warnings } = parseDdbSheet(JSON.stringify({ name: 'Тень' }), 'test_3');
    expect(sheet.level).toBe(1);
    expect(sheet.maxHp).toBe(8);
    expect(sheet.ac).toBe(10);
    expect(warnings.some(w => w.includes('Уровень'))).toBe(true);
    expect(warnings.some(w => w.includes('HP'))).toBe(true);
    expect(warnings.some(w => w.includes('AC'))).toBe(true);
  });

  it('мусор отвергается с понятной ошибкой', () => {
    expect(() => parseDdbSheet('не json')).toThrow(/не JSON/i);
    expect(() => parseDdbSheet('[1,2,3]')).toThrow(/объект/i);
    expect(() => parseDdbSheet('{"level": 3}')).toThrow(/имени/i);
  });

  it('уровень зажимается в 1..20, мод и бонус мастерства по таблице', () => {
    const hi = parseDdbSheet(JSON.stringify({ name: 'А', level: 99 }), 'test_4');
    expect(hi.sheet.level).toBe(20);
    expect(hi.sheet.proficiencyBonus).toBe(6);
    expect(abilityMod(20)).toBe(5);
    expect(abilityMod(8)).toBe(-1);
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(9)).toBe(4);
  });
});

// ---------------------------------------------------------------- джус реплея

describe('spawnParticles / burst (джус реплея)', () => {
  it('частицы детерминированы: одинаковый seed — одинаковый разлёт', () => {
    const a = spawnParticles(7, 2);
    const b = spawnParticles(7, 2);
    expect(a).toEqual(b);
    // а другой seed — другой фейерверк
    expect(spawnParticles(8, 2)).not.toEqual(a);
  });

  it('mulberry32 стабилен и в диапазоне [0,1)', () => {
    const rnd = mulberry32(42);
    const firstValue = rnd();
    for (let i = 0; i < 100; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // воспроизводимость: свежий PRNG с тем же сидом начинает с того же числа
    expect(mulberry32(42)()).toBe(firstValue);
  });

  it('интенсивность задаёт количество и дальность разлёта', () => {
    const soft = spawnParticles(1, 1);
    const boom = spawnParticles(1, 2);
    expect(boom.length).toBeGreaterThan(soft.length);
    const maxSoft = Math.max(...soft.map(p => Math.hypot(p.dx, p.dy)));
    const maxBoom = Math.max(...boom.map(p => Math.hypot(p.dx, p.dy)));
    expect(maxBoom).toBeGreaterThan(maxSoft);
  });

  it('кадры: крит и смерть дают burst×2, лёгкий урон — ×1', () => {
    const events: RoundEvent[] = [
      {
        kind: 'attack', actorId: 'a', actorName: 'A', targetId: 'b', targetName: 'B',
        label: 'Sword', d20: 20, bonus: 5, total: 25, ac: 13, hit: true, crit: true, edge: 'none', color: '#fff',
      },
      {
        kind: 'damage', targetId: 'b', targetName: 'B', attackerName: 'A',
        amount: 22, dtype: 'рубящий', hpAfter: 6, maxHp: 28, statusAfter: 'Alive', color: '#fff',
      },
      {
        kind: 'damage', targetId: 'b', targetName: 'B', attackerName: 'A',
        amount: 6, dtype: 'рубящий', hpAfter: 0, maxHp: 28, statusAfter: 'Dead', color: '#fff',
      },
    ];
    const frames = buildReplayTimeline(events);
    expect(frames[0].burst).toEqual({ entityId: 'b', intensity: 2 });   // крит
    expect(frames[1].burst).toEqual({ entityId: 'b', intensity: 1.6 }); // урон ≥ 15
    expect(frames[2].burst).toEqual({ entityId: 'b', intensity: 2 });   // смерть
  });
});
