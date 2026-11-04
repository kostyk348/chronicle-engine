/**
 * Chronicle Link — чистая логика протокола (зеркало src-tauri/src/link.rs).
 *
 * Здесь живёт всё, что должно быть проверяемо без Tauri:
 *  - канонический JSON (сортировка ключей, побитово совпадает с Rust);
 *  - commit-reveal: sha256(canonical(intent) + "|" + seed) — перекинуть дайс
 *    после публикации коммита невозможно;
 *  - чексумма результата раунда для сверки столов;
 *  - конечный автомат фазы раунда: Lobby → Commit → Reveal → Resolved.
 */

// ---------------------------------------------------------------- canonical json

/**
 * Канонический JSON: ключи объектов отсортированы рекурсивно, без пробелов.
 * Сортировка — по кодовым точкам Unicode (как байтовая сортировка UTF-8 в Rust):
 * дефолтный String.sort в JS сравнивает UTF-16-единицы и для астральных
 * символов (эмодзи) даёт другой порядок — поэтому сравниваем вручную.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(codePointCompare);
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/** Порядок кодовых точек: совпадает с порядком байтов UTF-8 (Rust keys.sort()). */
function codePointCompare(a: string, b: string): number {
  if (a === b) return 0;
  const ca = Array.from(a);
  const cb = Array.from(b);
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const pa = ca[i].codePointAt(0) ?? 0;
    const pb = cb[i].codePointAt(0) ?? 0;
    if (pa !== pb) return pa < pb ? -1 : 1;
  }
  return ca.length - cb.length;
}

// ---------------------------------------------------------------- sha-256

/** SHA-256 в hex. WebCrypto (браузер/Tauri) или Node webcrypto в тестах. */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = getSubtle();
  if (subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('no webcrypto available');
}

function getSubtle(): SubtleCrypto | null {
  const g = globalThis as { crypto?: { subtle?: SubtleCrypto } };
  return g.crypto?.subtle ?? null;
}

/**
 * Коммит интента: sha256(canonical(intent) + "|" + dice_seed).
 * Публикуется ДО раскрытия — по нему нельзя восстановить ни интент, ни сид,
 * но после раскрытия любой стол проверяет честность.
 */
export async function commitIntent(intent: unknown, diceSeed: string): Promise<string> {
  return sha256Hex(`${canonicalJson(intent)}|${diceSeed}`);
}

/** Чексумма результата раунда: одинаковая на всех столах при одинаковом каноне. */
export async function roundChecksum(state: unknown): Promise<string> {
  return sha256Hex(canonicalJson(state));
}

// ---------------------------------------------------------------- message kinds

export const LINK_KINDS = [
  'hello',
  'welcome',
  'roster',
  'intent_commit',
  'intent_reveal',
  'round_result',
  'chat',
  'ping',
  'bye',
  'error',
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export interface LinkEnvelope {
  kind: string;
  from: string;
  seq: number;
  body: unknown;
}

export function isKnownKind(kind: string): kind is LinkKind {
  return (LINK_KINDS as readonly string[]).includes(kind);
}

/** Конверт обязан иметь непустой kind и from — битые кадры отбрасываются. */
export function isValidEnvelope(env: unknown): env is LinkEnvelope {
  if (!env || typeof env !== 'object') return false;
  const e = env as Record<string, unknown>;
  return typeof e.kind === 'string' && e.kind.length > 0 && typeof e.from === 'string' && e.from.length > 0;
}

// ---------------------------------------------------------------- round machine

export type LinkPhase = 'Lobby' | 'Commit' | 'Reveal' | 'Resolved';

export interface CommitEntry {
  from: string;
  commit: string;
}

export interface RevealEntry {
  from: string;
  commit: string;
  intent: unknown;
  diceSeed: string;
  valid: boolean; // commit(intent, seed) === commit
}

export interface RoundOutcome {
  from: string;
  checksum: string;
  state: unknown;
}

export interface LinkRoundState {
  phase: LinkPhase;
  round: number;
  expectedPlayers: string[];
  commits: CommitEntry[];
  reveals: RevealEntry[];
  outcomes: RoundOutcome[];
  /** финальная чексумма, если все столы сошлись */
  agreedChecksum: string | null;
}

export function newRoundState(round: number, expectedPlayers: string[]): LinkRoundState {
  return {
    phase: expectedPlayers.length > 1 ? 'Commit' : 'Reveal',
    round,
    expectedPlayers,
    commits: [],
    reveals: [],
    outcomes: [],
    agreedChecksum: null,
  };
}

export function upsertCommit(state: LinkRoundState, from: string, commit: string): LinkRoundState {
  if (state.phase !== 'Commit' && state.phase !== 'Reveal') return state;
  const commits = [...state.commits.filter(c => c.from !== from), { from, commit }];
  const all = expectedAll(state, commits);
  return { ...state, commits, phase: all ? 'Reveal' : state.phase };
}

export function upsertReveal(
  state: LinkRoundState,
  from: string,
  commit: string,
  intent: unknown,
  diceSeed: string,
  commitOf: (intent: unknown, seed: string) => Promise<string>
): Promise<LinkRoundState> {
  return commitOf(intent, diceSeed).then(computed => {
    const valid = computed === commit;
    const others = state.reveals.filter(r => r.from !== from);
    const reveals = [...others, { from, commit, intent, diceSeed, valid }];
    const all = expectedAll(state, state.commits) && reveals.length >= state.expectedPlayers.length;
    const next: LinkRoundState = { ...state, reveals, phase: all ? 'Resolved' : state.phase };
    return next;
  });
}

/** Все ли ожидаемые игроки закоммитились. */
function expectedAll(state: LinkRoundState, commits: CommitEntry[]): boolean {
  return state.expectedPlayers.every(p => commits.some(c => c.from === p));
}

/**
 * Учитываем round_result: когда все исходы совпали по чексумме — раунд
 * закрыт каноном. Одинаковый канон = одинаковый лог WEGO на всех столах.
 */
export function upsertOutcome(state: LinkRoundState, outcome: RoundOutcome): LinkRoundState {
  if (state.phase !== 'Reveal' && state.phase !== 'Resolved') return state;
  const outcomes = [...state.outcomes.filter(o => o.from !== outcome.from), outcome];
  let agreedChecksum = state.agreedChecksum;
  if (outcomes.length > 0) {
    const first = outcomes[0].checksum;
    const unanimous = outcomes.every(o => o.checksum === first);
    if (unanimous && outcomes.length >= Math.max(1, state.expectedPlayers.length)) {
      agreedChecksum = first;
    } else {
      agreedChecksum = null;
    }
  }
  return { ...state, outcomes, agreedChecksum };
}

/** Расхождение коммита и раскрытия — игрок пытался перекинуть дайс. */
export function cheats(state: LinkRoundState): string[] {
  return state.reveals.filter(r => !r.valid).map(r => r.from);
}
