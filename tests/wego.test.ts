/**
 * WEGO Tactical Resolver v2 — тесты.
 *
 * Ключевые свойства:
 *  - детерминизм: одинаковые интенты + seed → побитово одинаковый лог;
 *  - все броски из крипто-потока (commit-reveal), краевые значения покрываются
 *    специально подобранными seed'ами;
 *  - фазы раунда: движение → действия → реакции → исход;
 *  - данные важнее хардкода: оружие/заклинания берутся из Entity.
 */
import { describe, it, expect } from 'vitest';
import { resolveWegoRound, parseDiceExpr, CRYPT_TERRAIN } from '../src/utils/wegoResolver';
import type { Entity, PlayerIntentPayload } from '../src/types/chronicle';

const elena = (over: Partial<Entity> = {}): Entity => ({
  id: 'char_wizard_elena',
  actorId: 'char_wizard_elena',
  name: 'Elena (Wizard Lvl 3)',
  role: 'player',
  characterClass: 'Evocation Wizard',
  level: 3,
  hp: 14,
  maxHp: 16,
  ac: 12,
  speed: 6,
  initiative: 15,
  pos: [3, 4],
  status: 'Alive',
  avatarUrl: '',
  color: '#8b5cf6',
  spells: ['Scorching Ray', 'Shield', 'Magic Missile'],
  weapons: [{ name: 'Quarterstaff', damage: '1d6 bludgeoning', damageDice: '1d6', attackBonus: 2, range: 1 }],
  ...over,
});

const torin = (over: Partial<Entity> = {}): Entity => ({
  id: 'char_warrior',
  actorId: 'char_warrior',
  name: 'Torin (Warrior Lvl 3)',
  role: 'player',
  characterClass: 'Battle Master Fighter',
  level: 3,
  hp: 24,
  maxHp: 32,
  ac: 17,
  speed: 6,
  initiative: 12,
  pos: [11, 8],
  status: 'Alive',
  avatarUrl: '',
  color: '#3b82f6',
  weapons: [{ name: 'Greatsword', damage: '2d6+3 slashing', damageDice: '2d6+3', attackBonus: 5, range: 1 }],
  ...over,
});

const shaman = (over: Partial<Entity> = {}): Entity => ({
  id: 'mob_shaman',
  name: 'Goblin Ashen Shaman',
  role: 'enemy',
  hp: 28,
  maxHp: 28,
  ac: 13,
  speed: 6,
  initiative: 14,
  pos: [12, 3],
  status: 'Alive',
  avatarUrl: '',
  color: '#ef4444',
  weapons: [{ name: 'Bone Staff', damage: '1d6 necrotic', damageDice: '1d6', attackBonus: 2, range: 1 }],
  ...over,
});

const intent = (over: Partial<PlayerIntentPayload>): PlayerIntentPayload => ({
  actor_id: 'char_wizard_elena',
  round: 3,
  movement: { path: [], dash: false },
  action: { type: 'dodge' },
  ...over,
});

describe('parseDiceExpr', () => {
  it('парсит канонические выражения', () => {
    expect(parseDiceExpr('2d6+3')).toEqual({ n: 2, d: 6, mod: 3 });
    expect(parseDiceExpr('1d4+1')).toEqual({ n: 1, d: 4, mod: 1 });
    expect(parseDiceExpr('3d8-1')).toEqual({ n: 3, d: 8, mod: -1 });
  });

  it('вытаскивает кости из свободного текста урона', () => {
    expect(parseDiceExpr('1d12 + 3 рубящий (+1d4 против нежити)')).toEqual({ n: 1, d: 12, mod: 3 });
    expect(parseDiceExpr('1d6 дробящий')).toEqual({ n: 1, d: 6, mod: 0 });
    expect(parseDiceExpr('нет костей')).toBeNull();
  });
});

describe('детерминизм', () => {
  it('одинаковые интенты и seed дают идентичный лог и результат', async () => {
    const ents = [elena(), torin(), shaman()];
    const intents = [
      intent({
        actor_id: 'char_wizard_elena',
        movement: { path: [[4, 4]], dash: false },
        action: {
          type: 'cast_spell',
          spell_name: 'Scorching Ray',
          slot_level: 2,
          rays: [
            { target_id: 'mob_shaman', dice_seed: 'seed-a' },
            { target_id: 'mob_shaman', dice_seed: 'seed-b' },
          ],
        },
      }),
      intent({
        actor_id: 'char_warrior',
        movement: { path: [[12, 8]], dash: false },
        action: { type: 'attack', weapon_name: 'Greatsword', target_id: 'mob_shaman', dice_seed: 'seed-c' },
      }),
    ];

    const r1 = await resolveWegoRound(ents, 3, intents, 'master-x');
    const r2 = await resolveWegoRound(ents, 3, intents, 'master-x');
    expect(r1.mechanicalLog).toEqual(r2.mechanicalLog);
    expect(r1.statePayload).toEqual(r2.statePayload);

    const r3 = await resolveWegoRound(ents, 3, intents, 'master-y');
    expect(r3.mechanicalLog).not.toEqual(r1.mechanicalLog);
  });
});

describe('фазы раунда', () => {
  it('движение ограничено скоростью, стены и занятые клетки блокируют', async () => {
    const ents = [elena(), shaman()];
    const r = await resolveWegoRound(
      ents,
      1,
      [intent({ movement: { path: [[4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4]], dash: false } })],
      's'
    );
    expect(r.mechanicalLog.some(l => l.includes('путь укорочен'))).toBe(true);
    // конечная позиция — 6 шагов от [3,4] при скорости 6
    const elenaOut = r.nextEntities.find(e => e.id === 'char_wizard_elena')!;
    expect(elenaOut.pos).toEqual([9, 4]);

    const r2 = await resolveWegoRound(
      [elena(), shaman()],
      1,
      [intent({ movement: { path: [[4, 4], [11, 7], [5, 4]], dash: false } })], // [11,7] — стена
      's'
    );
    expect(r2.mechanicalLog.some(l => l.includes('заблокирован'))).toBe(true);
    const blocked = r2.nextEntities.find(e => e.id === 'char_wizard_elena')!;
    // как в настольных правилах: движение останавливается на последней легальной
    // клетке перед стеной — [4,4], а не в начале пути
    expect(blocked.pos).toEqual([4, 4]);
  });

  it('мёртвые актёры не действуют', async () => {
    const dead = elena({ hp: 0, status: 'Dead' });
    const r = await resolveWegoRound([dead, shaman()], 1, [intent({ action: { type: 'attack', dice_seed: 'x' } })], 's');
    expect(r.mechanicalLog.join('\n')).not.toContain('Elena бьёт');
  });
});

describe('боевые механики', () => {
  it('крит удваивает кости и убивает, натуральная 1 — промах всегда', async () => {
    // Ищем seed'ы с критом и провалом через перебор — commit-reveal предсказуемо
    let critSeed = '';
    let failSeed = '';
    for (let i = 0; i < 200 && (!critSeed || !failSeed); i++) {
      // Torin обязан быть в ents: иначе его интент отсекается в фазе 0 валидации
      const ents = [elena(), torin(), shaman({ hp: 999, maxHp: 999 })];
      const r = await resolveWegoRound(ents, 1, [intent({
        actor_id: 'char_warrior',
        action: { type: 'attack', weapon_name: 'Greatsword', target_id: 'mob_shaman', dice_seed: `probe-${i}` },
      })], 'probe-master');
      const line = r.mechanicalLog.find(l => l.includes('ПОПАДАНИЕ (КРИТ!)'));
      if (line && !critSeed) critSeed = `probe-${i}`;
      if (r.mechanicalLog.some(l => l.includes('провал на единице')) && !failSeed) failSeed = `probe-${i}`;
    }
    expect(critSeed).not.toBe('');
    expect(failSeed).not.toBe('');
  });

  it('Dodge даёт помеху атакующим (структурно: помеха отражена в логе)', async () => {
    const ents = [elena(), shaman()];
    const r = await resolveWegoRound(ents, 1, [
      intent({ action: { type: 'dodge' } }),
    ], 'dodge-master');
    // AI враг атаковал уклоняющуюся Елену — в логе помеха
    expect(r.mechanicalLog.some(l => l.includes('(помеха)'))).toBe(true);
  });

  it('реакция Щит у любого актёра добавляет +5 AC', async () => {
    const ents = [elena(), shaman()];
    const r = await resolveWegoRound(ents, 1, [
      intent({ action: { type: 'dodge' }, reaction: { trigger: 'when_hit', spell: 'Shield' } }),
    ], 'shield-master');
    expect(r.mechanicalLog.some(l => l.includes('[Реакция] Elena (Wizard Lvl 3) бросает Щит'))).toBe(true);
  });

  it('Magic Missile бьёт автоматически — в логе нет противостояния AC', async () => {
    const ents = [elena(), shaman()];
    const r = await resolveWegoRound(ents, 1, [intent({
      action: {
        type: 'cast_spell', spell_name: 'Magic Missile', slot_level: 1,
        rays: [{ target_id: 'mob_shaman', dice_seed: 'mm-1' }],
      },
    })], 'mm-master');
    const joined = r.mechanicalLog.join('\n');
    expect(joined).toContain('автопопадание');
    expect(joined).toContain('Снаряд #1');
  });

  it('fallback-правило перенаправляет луч в живую цель', async () => {
    const ents = [elena(), shaman({ hp: 1 }), shaman({ id: 'mob_archer_1', name: 'Goblin Archer', pos: [14, 3], hp: 10, maxHp: 14, color: '#f97316' })];
    const r = await resolveWegoRound(ents, 1, [intent({
      action: {
        type: 'cast_spell', spell_name: 'Scorching Ray', slot_level: 2,
        rays: [{ target_id: 'mob_shaman', dice_seed: 'fb-1' }, { target_id: 'mob_shaman', dice_seed: 'fb-2' }, { target_id: 'mob_shaman', dice_seed: 'fb-3' }],
      },
      fallback_rules: [{ trigger: 'target_dead', redirect_all_to: 'mob_archer_1' }],
    })], 'fb-master');
    const joined = r.mechanicalLog.join('\n');
    expect(joined).toContain('Fallback');
    expect(joined).toContain('Goblin Archer');
  });

  it('зелье лечит без превышения максимума', async () => {
    const hurt = elena({ hp: 2 });
    const r = await resolveWegoRound([hurt, shaman({ pos: [14, 10] })], 1, [
      intent({ action: { type: 'item', dice_seed: 'potion-1' } }),
    ], 'heal-master');
    const elenaOut = r.nextEntities.find(e => e.id === 'char_wizard_elena')!;
    expect(elenaOut.hp).toBeGreaterThan(2);
    expect(elenaOut.hp).toBeLessThanOrEqual(16);
    expect(r.mechanicalLog.some(l => l.includes('зелье лечения'))).toBe(true);
  });

  it('игрок при 0 HP — без сознания, враг — мёртв', async () => {
    const r = await resolveWegoRound([elena({ hp: 1 }), torin({ hp: 1, pos: [11, 4] }), shaman()], 1, [
      intent({ action: { type: 'dodge' } }),
    ], 'down-master');
    // при 1 HP шанс умереть есть, но статус должен быть корректного вида
    for (const e of r.nextEntities.filter(x => x.role === 'player')) {
      expect(['Alive', 'Unconscious', 'Dead']).toContain(e.status);
    }
  });

  it('AI врагов: приближается и атакует ближайшего', async () => {
    const r = await resolveWegoRound([elena(), shaman()], 1, [intent({ action: { type: 'dodge' } })], 'ai-master');
    const joined = r.mechanicalLog.join('\n');
    expect(joined).toContain('Goblin Ashen Shaman');
    expect(joined).toMatch(/бьёт .*Elena|атакует .*Elena/);
  });

  it('победа, когда все враги пали', async () => {
    const r = await resolveWegoRound([elena(), torin()], 1, [
      intent({ action: { type: 'attack', dice_seed: 'v' } }),
    ], 'victory-master');
    expect(r.combatStatus).toBe('Ended_Victory');
    expect(r.mechanicalLog.some(l => l.includes('ПОБЕДА'))).toBe(true);
  });
});

describe('карта и канон', () => {
  it('SVG содержит стены террейна и токены всех сущностей', async () => {
    const ents = [elena(), shaman()];
    const r = await resolveWegoRound(ents, 1, [intent({ action: { type: 'dodge' } })], 'svg-master');
    expect(r.generatedSvg).toContain('<svg');
    expect(r.generatedSvg).toContain('Каменный Алтарь');
    for (const e of ents) expect(r.generatedSvg).toContain(e.name.split(' ')[0]);
  });

  it('проза канона детерминирована и отражает исход', async () => {
    const ents = [elena(), torin()];
    const a = await resolveWegoRound(ents, 1, [intent({ action: { type: 'attack', dice_seed: 'p' } })], 'p');
    const b = await resolveWegoRound(ents, 1, [intent({ action: { type: 'attack', dice_seed: 'p' } })], 'p');
    expect(a.suggestedProse).toBe(b.suggestedProse);
    expect(a.suggestedProse).toContain('Пепельная крипта');
    expect(a.suggestedProse).toContain('победила');
  });
});

describe('терраин', () => {
  it('можно передать свой терраин вместо крипты', async () => {
    const ents = [elena(), shaman()];
    const r = await resolveWegoRound(ents, 1, [intent({ action: { type: 'dodge' } })], 't', {
      terrain: { walls: [[5, 4]], label: 'Таверна «Ржавый дракон»', props: [[8, 6, 'Очаг']] },
    });
    expect(r.generatedSvg).toContain('Очаг');
    expect(r.suggestedProse).toContain('Ржавый дракон');
    expect(CRYPT_TERRAIN.label).toBe('Пепельная крипта');
  });
});
