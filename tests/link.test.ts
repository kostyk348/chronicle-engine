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

  it('астральные ключи сортируются по кодовым точкам, а не по UTF-16', () => {
    // U+FFFF (65535) < U+1F600 «😀» (128512); дефолтный String.sort в JS
    // (UTF-16-единицы) поставил бы «😀» (0xD83D…) ПЕРЕД \uFFFF — а Rust
    // сортирует байты UTF-8, то есть по кодовым точкам. Порядок должен совпасть.
    // (U+FFFF не эскейпится ни JSON.stringify, ни serde_json — паритет.)
    expect(canonicalJson({ '\uFFFF': 1, '😀': 2 })).toBe('{"\uFFFF":1,"😀":2}');
    expect(canonicalJson({ '😀': 2, '\uFFFF': 1 })).toBe('{"\uFFFF":1,"😀":2}');
    // обычная кириллица после латиницы
    expect(canonicalJson({ ж: 1, a: 2 })).toBe('{"a":2,"ж":1}');
  });

  it('вложенные объекты в массивах тоже канонизируются', () => {
    expect(canonicalJson([{ z: 1, a: [true, null] }, 'ы']))
      .toBe('[{"a":[true,null],"z":1},"ы"]');
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

  it('фаза не откатывается назад: поздние коммиты не будят закрытый раунд', async () => {
    let s = fresh();
    s = upsertCommit(s, 'Elena', 'a'.repeat(64));
    s = upsertCommit(s, 'Torin', 'b'.repeat(64));
    s = { ...s, phase: 'Resolved' as const };
    // коммит после Resolved игнорируется целиком — состояние заморожено
    expect(upsertCommit(s, 'Elena', 'c'.repeat(64))).toBe(s);
  });

  it('канон в фазе Commit не учитывается — исходы ждут раскрытий', () => {
    let s = fresh();
    s = upsertOutcome(s, { from: 'Elena', checksum: 'aa', state: {} });
    expect(s.outcomes).toHaveLength(0);
    expect(s.agreedChecksum).toBeNull();
  });

  it('из трёх столов двое сошлись, один против — консенсуса нет', async () => {
    const trio = newRoundState(7, ['Elena', 'Torin', 'Bran']);
    let s = upsertCommit(trio, 'Elena', 'a'.repeat(64));
    s = upsertCommit(s, 'Torin', 'b'.repeat(64));
    s = upsertCommit(s, 'Bran', 'c'.repeat(64));
    s = { ...s, reveals: s.expectedPlayers.map(p => ({ from: p, commit: '', intent: {}, diceSeed: '', valid: true })), phase: 'Resolved' as const };

    const canonical = { round: 7, log: [] };
    const good = await roundChecksum(canonical);
    s = upsertOutcome(s, { from: 'Elena', checksum: good, state: canonical });
    s = upsertOutcome(s, { from: 'Torin', checksum: good, state: canonical });
    expect(s.agreedChecksum).toBeNull(); // двое из трёх — ещё не единогласие
    s = upsertOutcome(s, { from: 'Bran', checksum: 'abad1dea', state: {} });
    expect(s.agreedChecksum).toBeNull(); // меньшинство ломает канон — split-brain
    s = upsertOutcome(s, { from: 'Bran', checksum: good, state: canonical });
    expect(s.agreedChecksum).toBe(good); // переслал верный — единогласно
  });
});
