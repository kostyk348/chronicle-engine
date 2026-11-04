/**
 * Chronicle Link — тесты чистой логики протокола.
 * Rust-сторона покрыта своими тестами (src-tauri/src/link.rs); здесь —
 * зеркальная TS-логика: канонический JSON, commit-reveal, автомат фаз.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  commitIntent,
  roundChecksum,
  isValidEnvelope,
  isKnownKind,
  newRoundState,
  upsertCommit,
  upsertReveal,
  upsertOutcome,
  cheats,
  LinkRoundState,
} from '../src/utils/linkProtocol';

describe('canonicalJson', () => {
  it('сортирует ключи рекурсивно — совпадает с Rust-реализацией', () => {
    const a = canonicalJson({ b: 1, a: { z: true, y: [2, 1] } });
    const b = canonicalJson({ a: { y: [2, 1], z: true }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"y":[2,1],"z":true},"b":1}');
  });

  it('различает значения и сохраняет типы', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: '1' }));
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson([1, 2])).toBe('[1,2]');
  });
});

describe('commit-reveal', () => {
  it('коммит детерминирован, чувствителен к сиду и интенту', async () => {
    const intent = { type: 'attack', target: 'mob_1' };
    const c1 = await commitIntent(intent, 'seed-1');
    const c2 = await commitIntent({ target: 'mob_1', type: 'attack' }, 'seed-1'); // другой порядок ключей
    const c3 = await commitIntent(intent, 'seed-2');
    expect(c1).toBe(c2); // порядок ключей не влияет — канон
    expect(c1).not.toBe(c3);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('чексумма раунда одинакова для одинакового состояния', async () => {
    const state = { round: 3, entities: [{ id: 'e1', hp: 10 }] };
    expect(await roundChecksum(state)).toBe(await roundChecksum({ entities: [{ hp: 10, id: 'e1' }], round: 3 }));
    expect(await roundChecksum(state)).not.toBe(await roundChecksum({ ...state, round: 4 }));
  });
});

describe('конверты', () => {
  it('валидные конверты проходят, битые отбрасываются', () => {
    expect(isValidEnvelope({ kind: 'chat', from: 'Elena', seq: 1, body: {} })).toBe(true);
    expect(isValidEnvelope({ kind: '', from: 'Elena', seq: 1, body: {} })).toBe(false);
    expect(isValidEnvelope({ kind: 'chat', seq: 1, body: {} })).toBe(false);
    expect(isValidEnvelope(null)).toBe(false);
    expect(isKnownKind('intent_commit')).toBe(true);
    expect(isKnownKind('нет такого')).toBe(false);
  });
});

describe('автомат фаз раунда', () => {
  const players = ['Elena', 'Torin'];

  function fresh(): LinkRoundState {
    return newRoundState(3, players);
  }

  it('стартует в Commit и переходит в Reveal, когда закоммитились все', async () => {
    let s = fresh();
    expect(s.phase).toBe('Commit');
    s = upsertCommit(s, 'Elena', 'a'.repeat(64));
    expect(s.phase).toBe('Commit'); // один коммит — ждём остальных
    s = upsertCommit(s, 'Torin', 'b'.repeat(64));
    expect(s.phase).toBe('Reveal');
    // повторный коммит не дублируется
    s = upsertCommit(s, 'Torin', 'b'.repeat(64));
    expect(s.commits).toHaveLength(2);
  });

  it('раскрытия собираются, валидность сверяется с коммитом', async () => {
    let s = fresh();
    const intent = { type: 'attack', target_id: 'mob_shaman' };
    const seed = 'dice-seed-1';
    const commit = await commitIntent(intent, seed);

    s = upsertCommit(s, 'Elena', commit);
    s = upsertCommit(s, 'Torin', 'b'.repeat(64));
    expect(s.phase).toBe('Reveal');

    s = await upsertReveal(s, 'Elena', commit, intent, seed, commitIntent);
    expect(s.phase).toBe('Reveal'); // Торин ещё не раскрылся
    expect(cheats(s)).toHaveLength(0);

    // Торин публикует раскрытие, НЕ совпадающее с его коммитом — жульничество
    s = await upsertReveal(s, 'Torin', 'b'.repeat(64), { type: 'flee' }, 'other-seed', commitIntent);
    expect(s.phase).toBe('Resolved'); // все раскрылись
    expect(cheats(s)).toEqual(['Torin']);
  });

  it('исход раунда фиксируется только при единогласной чексумме', async () => {
    let s = fresh();
    s = upsertCommit(s, 'Elena', 'a'.repeat(64));
    s = upsertCommit(s, 'Torin', 'b'.repeat(64));
    s = { ...s, reveals: s.expectedPlayers.map(p => ({ from: p, commit: '', intent: {}, diceSeed: '', valid: true })), phase: 'Resolved' };

    const canonical = { round: 3, log: ['⚔️ ...'] };
    const good = await roundChecksum(canonical);
    s = upsertOutcome(s, { from: 'Elena', checksum: good, state: canonical });
    expect(s.agreedChecksum).toBeNull(); // один голос — ещё не консенсус

    // Торин прислал ДРУГУЮ чексумму — расхождение, канона нет
    s = upsertOutcome(s, { from: 'Torin', checksum: 'deadbeef', state: {} });
    expect(s.agreedChecksum).toBeNull();

    // переслал правильную — единогласно
    s = upsertOutcome(s, { from: 'Torin', checksum: good, state: canonical });
    expect(s.agreedChecksum).toBe(good);
  });

  it('одиночный стол закрывает исход сам', async () => {
    const solo = newRoundState(1, ['Мастер']);
    expect(solo.phase).toBe('Reveal');
    let s = upsertOutcome(solo, { from: 'Мастер', checksum: 'aa', state: {} });
    expect(s.agreedChecksum).toBe('aa');
  });
});
