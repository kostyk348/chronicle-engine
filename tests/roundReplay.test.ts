/**
 * Кинематографичный реплей — тесты таймлайна и применения кадров.
 */
import { describe, it, expect } from 'vitest';
import { buildReplayTimeline, applyFrame, fastForward, ReplayFrame } from '../src/utils/roundReplay';
import { RoundEvent } from '../src/utils/wegoResolver';
import { Entity } from '../src/types/chronicle';
import { elena, shaman } from './fixtures';

const hero = elena();
const gob = shaman();

const sampleEvents: RoundEvent[] = [
  { kind: 'move', actorId: 'char_wizard_elena', actorName: 'Elena', from: [3, 4], to: [3, 5], path: [[3, 4], [3, 5]], dash: false },
  {
    kind: 'attack', actorId: 'char_wizard_elena', actorName: 'Elena',
    targetId: 'mob_shaman', targetName: 'Goblin', label: 'Quarterstaff',
    d20: 18, bonus: 2, total: 20, ac: 13, hit: true, crit: false, edge: 'none', color: '#8b5cf6',
  },
  {
    kind: 'damage', targetId: 'mob_shaman', targetName: 'Goblin', attackerName: 'Elena',
    amount: 5, dtype: 'урона', hpAfter: 23, maxHp: 28, statusAfter: 'Alive', color: '#ef4444',
  },
  { kind: 'note', icon: '🌀', text: 'уходит в защиту', actorId: 'mob_shaman', actorName: 'Goblin' },
  { kind: 'outcome', status: 'Ongoing' },
];

describe('buildReplayTimeline', () => {
  it('кадр на каждое событие, длительности положительны, подписи непусты', () => {
    const frames = buildReplayTimeline(sampleEvents);
    expect(frames).toHaveLength(sampleEvents.length);
    for (const f of frames) {
      expect(f.durationMs).toBeGreaterThan(0);
      expect(f.caption.length).toBeGreaterThan(0);
    }
    expect(frames.map(f => f.eventIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('кадр движения несёт move, кадр атаки — дугу и попап, кадр урона — состояние', () => {
    const [move, attack, damage] = buildReplayTimeline(sampleEvents);

    expect(move.move).toEqual({ actorId: 'char_wizard_elena', to: [3, 5] });

    expect(attack.arc?.fromId).toBe('char_wizard_elena');
    expect(attack.arc?.toId).toBe('mob_shaman');
    expect(attack.popup?.tone).toBe('info');
    expect(attack.caption).toContain('d20=18');

    expect(damage.popup).toEqual({ entityId: 'mob_shaman', text: '−5', tone: 'damage' });
    expect(damage.state['mob_shaman']).toEqual({ hp: 23, status: 'Alive' });
  });

  it('крит и промах различаются в подписи и тоне попапа', () => {
    const crit: RoundEvent = {
      kind: 'attack', actorId: 'a', actorName: 'A', targetId: 'b', targetName: 'B',
      label: 'Sword', d20: 20, bonus: 5, total: 25, ac: 13, hit: true, crit: true, edge: 'none', color: '#fff',
    };
    const miss: RoundEvent = {
      kind: 'attack', actorId: 'a', actorName: 'A', targetId: 'b', targetName: 'B',
      label: 'Sword', d20: 2, bonus: 5, total: 7, ac: 13, hit: false, crit: false, edge: 'none', color: '#fff',
    };
    const [critF] = buildReplayTimeline([crit]);
    const [missF] = buildReplayTimeline([miss]);
    expect(critF.caption).toContain('КРИТ');
    expect(critF.popup?.tone).toBe('crit');
    expect(missF.popup?.tone).toBe('miss');
    expect(missF.arc?.dashed).toBe(true); // промах рисуется пунктиром
  });

  it('autoHit (Magic Missile) помечен как автопопадание, XP и исход читаемы', () => {
    const events: RoundEvent[] = [
      { kind: 'attack', actorId: 'a', actorName: 'A', targetId: 'b', targetName: 'B', label: 'MM #1', d20: 0, bonus: 0, total: 0, ac: 13, hit: true, crit: false, autoHit: true, edge: 'none', color: '#fff' },
      { kind: 'xp', amount: 121 },
      { kind: 'outcome', status: 'Ended_Victory' },
    ];
    const frames = buildReplayTimeline(events);
    expect(frames[0].caption).toContain('автопопадание');
    expect(frames[1].caption).toContain('121');
    expect(frames[2].caption).toContain('ПОБЕДА');
  });
});

describe('applyFrame / fastForward', () => {
  const frames = buildReplayTimeline(sampleEvents);

  it('кадр двигает токен и зажимает hp в [0, maxHp]', () => {
    const afterMove = applyFrame([hero], frames[0]);
    expect(afterMove[0].pos).toEqual([3, 5]);

    const fatalFrame: ReplayFrame = {
      eventIndex: 0, durationMs: 100, caption: '', state: { 'char_wizard_elena': { hp: -10, status: 'Unconscious' } },
    };
    const out = applyFrame([hero], fatalFrame);
    expect(out[0].hp).toBe(0);
    expect(out[0].status).toBe('Unconscious');
    // исходник не тронут — иммутабельность
    expect(hero.hp).toBe(14);
    expect(hero.pos).toEqual([3, 4]);
  });

  it('кадр без изменений возвращает те же объекты (нет лишних ререндеров)', () => {
    const idleFrame: ReplayFrame = { eventIndex: 0, durationMs: 100, caption: '', state: {} };
    const list = [hero, gob];
    expect(applyFrame(list, idleFrame)).toEqual(list);
  });

  it('незнакомые id пропускаются молча', () => {
    const ghost: ReplayFrame = {
      eventIndex: 0, durationMs: 100, caption: '',
      state: { 'ghost_id': { hp: 0, status: 'Dead' } },
      move: { actorId: 'ghost_id', to: [9, 9] },
    };
    expect(applyFrame([hero], ghost)[0]).toEqual(hero);
  });

  it('fastForward применяет хвост кадров за один вызов', () => {
    let state: Entity[] = [hero, gob];
    state = applyFrame(state, frames[0]);       // Елена сдвинулась
    state = fastForward(state, frames, 1);      // всё остальное разом
    const elenaOut = state.find(e => e.id === 'char_wizard_elena')!;
    expect(elenaOut.pos).toEqual([3, 5]);       // move из frames[0] сохранился
  });
});
