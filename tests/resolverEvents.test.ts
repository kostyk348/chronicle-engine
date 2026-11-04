/**
 * Структурные события раунда — тесты эмиссии и XP.
 * Реплей живёт на этих событиях, поэтому их состав и порядок критичны.
 */
import { describe, it, expect } from 'vitest';
import { resolveWegoRound, RoundEvent } from '../src/utils/wegoResolver';
import type { Entity, PlayerIntentPayload } from '../src/types/chronicle';
import { elena, torin, shaman, archer, intent } from './fixtures';

describe('resolveWegoRound: события раунда', () => {
  it('выдаёт move → attack → damage → outcome в порядке фаз', async () => {
    const res = await resolveWegoRound(
      [elena(), shaman()],
      3,
      [
        intent({
          actor_id: 'char_wizard_elena',
          movement: { path: [[3, 5]], dash: false },
          action: {
            type: 'attack',
            weapon_name: 'Quarterstaff',
            target_id: 'mob_shaman',
            dice_seed: 'seed-events-1',
          },
        }),
      ],
      'master-seed-events'
    );

    const kinds = res.events.map(e => e.kind);
    expect(kinds[0]).toBe('move');
    expect(kinds).toContain('attack');
    expect(kinds).toContain('damage');
    expect(kinds[kinds.length - 1]).toBe('outcome');

    const move = res.events[0] as Extract<RoundEvent, { kind: 'move' }>;
    expect(move.actorId).toBe('char_wizard_elena');
    expect(move.from).toEqual([3, 4]);
    expect(move.to).toEqual([3, 5]);

    const attack = res.events.find(e => e.kind === 'attack') as Extract<RoundEvent, { kind: 'attack' }>;
    expect(attack.actorId).toBe('char_wizard_elena');
    expect(attack.targetId).toBe('mob_shaman');
    expect(attack.label).toBe('Quarterstaff');
    expect(attack.d20).toBeGreaterThanOrEqual(1);
    expect(attack.d20).toBeLessThanOrEqual(20);
    expect(attack.total).toBe(attack.d20 + attack.bonus);

    const dmg = res.events.find(e => e.kind === 'damage') as Extract<RoundEvent, { kind: 'damage' }>;
    expect(dmg.targetId).toBe('mob_shaman');
    expect(dmg.amount).toBeGreaterThan(0);
    expect(dmg.hpAfter).toBe(dmg.maxHp - dmg.amount);
  });

  it('события детерминированы: одинаковые сиды — побитово одинаковый список', async () => {
    const intents: PlayerIntentPayload[] = [
      intent({
        actor_id: 'char_wizard_elena',
        action: {
          type: 'cast_spell',
          spell_name: 'Scorching Ray',
          slot_level: 2,
          rays: [
            { target_id: 'mob_shaman', dice_seed: 'ray-1' },
            { target_id: 'mob_shaman', dice_seed: 'ray-2' },
          ],
          dice_seed: 'seed-det',
        },
      }),
    ];
    const a = await resolveWegoRound([elena(), shaman()], 3, intents, 'ms');
    const b = await resolveWegoRound([elena(), shaman()], 3, intents, 'ms');
    expect(a.events).toEqual(b.events);
  });

  it('autoHit для Magic Missile: попадание без броска, несколько снарядов', async () => {
    const res = await resolveWegoRound(
      [elena(), shaman()],
      3,
      [
        intent({
          actor_id: 'char_wizard_elena',
          action: {
            type: 'cast_spell',
            spell_name: 'Magic Missile',
            slot_level: 2,
            rays: [{ target_id: 'mob_shaman', dice_seed: 'mm-1' }],
            dice_seed: 'seed-mm',
          },
        }),
      ],
      'master-seed-mm'
    );
    const attacks = res.events.filter(e => e.kind === 'attack') as Extract<RoundEvent, { kind: 'attack' }>[];
    // AI шамана контратакует оружием — отделяем снаряды Magic Missile
    const missiles = attacks.filter(a => a.autoHit);
    expect(missiles.length).toBeGreaterThanOrEqual(1); // минимум 1 снаряд, ячейка 2 даёт 3
    expect(attacks.some(a => !a.autoHit)).toBe(true);  // контратака AI — обычный бросок
    for (const a of missiles) {
      expect(a.hit).toBe(true);
      expect(a.d20).toBe(0);
    }
  });

  it('dodge/help/flee/heal порождают читаемые note/heal события', async () => {
    const res = await resolveWegoRound(
      [elena(), torin(), shaman()],
      3,
      [
        intent({ actor_id: 'char_wizard_elena', action: { type: 'dodge' } }),
        intent({
          actor_id: 'char_warrior',
          action: { type: 'item', dice_seed: 'seed-potion' },
        }),
      ],
      'master-seed-notes'
    );
    const notes = res.events.filter(e => e.kind === 'note') as Extract<RoundEvent, { kind: 'note' }>[];
    expect(notes.some(n => n.text.includes('защит') || n.icon === '🌀')).toBe(true);
    const heals = res.events.filter(e => e.kind === 'heal');
    expect(heals.length).toBe(1);
    expect((heals[0] as any).amount).toBeGreaterThan(0);
  });

  it('щит-реакция отмечается note-событием', async () => {
    const res = await resolveWegoRound(
      [elena(), torin(), shaman()],
      3,
      [
        intent({
          actor_id: 'char_wizard_elena',
          action: { type: 'dodge' },
          reaction: { trigger: 'hit_by_melee_attack', spell: 'Shield' },
        }),
        // шаман обязан атаковать кого-то из живых; атака по Елене встретит Щит
        intent({
          actor_id: 'mob_shaman',
          action: { type: 'attack', weapon_name: 'Bone Staff', target_id: 'char_wizard_elena', dice_seed: 'seed-ai' },
        }),
      ],
      'master-seed-shield'
    );
    const shieldNotes = (res.events.filter(e => e.kind === 'note') as Extract<RoundEvent, { kind: 'note' }>[])
      .filter(n => n.icon === '🛡️');
    expect(shieldNotes.length).toBeGreaterThanOrEqual(1);
  });

  it('XP начисляется за павших врагов: xpValue из данных важнее оценки', async () => {
    const dead = shaman({ hp: 0, status: 'Dead', xpValue: 200 });
    const res1 = await resolveWegoRound([elena(), dead], 3, [intent({ action: { type: 'dodge' } })], 'ms-xp');
    expect(res1.xpGained).toBe(200);
    expect(res1.events.some(e => e.kind === 'xp' && (e as any).amount === 200)).toBe(true);

    // без xpValue — оценка maxHp*2 + AC*5
    const est = shaman(); // 28*2 + 13*5 = 121
    const res2 = await resolveWegoRound([elena(), { ...est, hp: 0, status: 'Dead' }], 3, [intent({ action: { type: 'dodge' } })], 'ms-xp2');
    expect(res2.xpGained).toBe(28 * 2 + 13 * 5);
  });

  it('живые враги не дают XP', async () => {
    const res = await resolveWegoRound(
      [elena(), shaman()],
      3,
      [intent({ action: { type: 'dodge' } })],
      'ms-xp3'
    );
    // шаман жив (никто не атаковал); AI врагов атакует Елену, но не умирает сам
    expect(res.events.some(e => e.kind === 'xp')).toBe(false);
  });
});
