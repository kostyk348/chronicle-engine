/**
 * Честные кости Chronicle Link — commit-reveal броски по сети.
 *
 * Схема: игрок выбирает формулу (NdM+K, kh/kl), бросает локально сида-зависимым
 * RNG, публикует в стол ТОЛЬКО коммит sha256(label|seed). Пока сид секретен,
 * результат нельзя подменить задним числом. Раскрытие публикует (label, seed,
 * total, detail) — каждый стол пересчитывает бросок из сида и сверяет с коммитом.
 * Подмена любого поля раскрытия ломает проверку.
 */

import { sha256Hex } from './linkProtocol';

// ---------------------------------------------------------------- формулы

export interface ParsedFormula {
  /** сколько костей бросается (1..20) */
  count: number;
  /** граней на кости (2..1000) */
  sides: number;
  /** аддитивная модификация итога */
  mod: number;
  /** kh — оставить старшие, kl — младшие (преимущество/помеха, 4d6kh3) */
  keep?: 'kh' | 'kl';
  /** сколько костей оставить */
  keepN?: number;
  /** каноническая метка — ровно она участвует в коммите */
  label: string;
}

const FORMULA_RE = /^(\d{1,2})?[dD](\d{1,4})(?:(kh|kl)(\d{1,2}))?([+-]\d{1,3})?$/;

/**
 * Парсер формул: «d20», «2d6+3», «4d6kh3», «2d20kl1-2».
 * Возвращает null для всего, что не формула — бросок не состоится.
 */
export function parseFormula(expr: string): ParsedFormula | null {
  const raw = expr.trim().toLowerCase().replace(/\s+/g, '');
  const m = FORMULA_RE.exec(raw);
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const keep = m[3] as 'kh' | 'kl' | undefined;
  const keepN = m[4] ? parseInt(m[4], 10) : undefined;
  const mod = m[5] ? parseInt(m[5], 10) : 0;
  if (sides < 2 || count < 1 || count > 20) return null;
  if (keep && (!keepN || keepN < 1 || keepN > count)) return null;
  if (Math.abs(mod) > 999) return null;
  const label = `${count}d${sides}${keep ? `${keep}${keepN}` : ''}${mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`;
  return { count, sides, mod, keep, keepN, label };
}

// ---------------------------------------------------------------- детерминированный RNG

/** xmur3: строка → поток 32-битных слов (хеш-сеялка). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32: быстрый статистический ГПСЧ на четырёх 32-битных состояниях. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Детерминированный [0,1)-RNG из сида: одинаковый сид → одинаковая серия бросков. */
export function seedToRng(seed: string): () => number {
  const g = xmur3(seed);
  return sfc32(g(), g(), g(), g());
}

// ---------------------------------------------------------------- бросок

export interface RolledDice {
  /** сумма оставшихся костей + модификатор */
  total: number;
  /** человекочитаемый разбор: «4d6kh3: [2,5,6,3]→[6,5,3]+0=14» */
  detail: string;
  /** все брошенные кости в порядке броска */
  rolls: number[];
}

function multisetDiff(all: number[], kept: number[]): number[] {
  const rest = [...kept];
  return all.filter(v => {
    const i = rest.indexOf(v);
    if (i >= 0) {
      rest.splice(i, 1);
      return false;
    }
    return true;
  });
}

/**
 * Бросок по формуле на заданном RNG. Детерминирован: одна формула + один
 * сид = одинаковые total/detail на любом столе — это и проверяет раскрытие.
 */
export function rollDice(f: ParsedFormula, rng: () => number): RolledDice {
  const rolls: number[] = [];
  for (let i = 0; i < f.count; i++) rolls.push(Math.floor(rng() * f.sides) + 1);

  let kept = rolls;
  if (f.keep) {
    const n = f.keepN ?? f.count;
    const idx = rolls.map((v, i) => [v, i] as const);
    idx.sort((a, b) => (f.keep === 'kh' ? b[0] - a[0] : a[0] - b[0]) || a[1] - b[1]);
    kept = idx.slice(0, n).map(p => p[0]);
  }

  const sum = kept.reduce((a, b) => a + b, 0);
  const total = sum + f.mod;
  const keptPart = f.keep
    ? [...kept].sort((a, b) => (f.keep === 'kh' ? b - a : a - b))
    : rolls;
  const dropped = f.keep ? multisetDiff(rolls, kept) : [];
  const droppedPart = dropped.length ? `, отброшены [${dropped.join(',')}]` : '';
  const modPart = f.mod !== 0 ? (f.mod > 0 ? `+${f.mod}` : `${f.mod}`) : '+0';
  const detail = `${f.label}: [${rolls.join(',')}]→[${keptPart.join(',')}]${modPart}=${total}${droppedPart}`;
  return { total, detail, rolls };
}

// ---------------------------------------------------------------- сетевая машина бросков

export interface DiceCommitBody {
  roll_id: string;
  label: string;
  commit: string;
}

export interface DiceRevealBody {
  roll_id: string;
  label: string;
  commit: string;
  total: number;
  detail: string;
  seed: string;
}

export interface DiceRollEntry {
  rollId: string;
  from: string;
  label: string;
  phase: 'committed' | 'revealed';
  commit: string;
  total?: number;
  detail?: string;
  seed?: string;
  /** true — раскрытие сошлось с коммитом и пересчитанным броском */
  valid?: boolean;
}

export function upsertDiceCommit(
  state: DiceRollEntry[],
  entry: { rollId: string; from: string; label: string; commit: string }
): DiceRollEntry[] {
  const rest = state.filter(r => r.rollId !== entry.rollId);
  return [...rest, { ...entry, phase: 'committed' as const }];
}

/** Синхронное применение раскрытия — валидность считает verifyDiceReveal заранее. */
export function applyDiceReveal(
  state: DiceRollEntry[],
  reveal: DiceRevealBody & { from: string },
  valid: boolean
): DiceRollEntry[] {
  const rest = state.filter(r => r.rollId !== reveal.roll_id);
  return [
    ...rest,
    {
      rollId: reveal.roll_id,
      from: reveal.from,
      label: reveal.label,
      phase: 'revealed' as const,
      commit: reveal.commit,
      total: reveal.total,
      detail: reveal.detail,
      seed: reveal.seed,
      valid,
    },
  ];
}

/** Коммит честного броска: sha256(label|seed) — сид публикуется только в раскрытии. */
export async function diceCommit(label: string, seed: string): Promise<string> {
  return sha256Hex(`${label}|${seed}`);
}

/**
 * Полная проверка раскрытия: (1) коммит из (label, seed) совпадает с
 * опубликованным, (2) бросок, пересчитанный из сида, даёт заявленные
 * total и detail. Ломается при подмене любого поля.
 */
export async function verifyDiceReveal(r: DiceRevealBody): Promise<boolean> {
  const f = parseFormula(r.label);
  if (!f) return false;
  const commit = await diceCommit(r.label, r.seed);
  if (commit !== r.commit) return false;
  const { total, detail } = rollDice(f, seedToRng(r.seed));
  return total === r.total && detail === r.detail;
}
