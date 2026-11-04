/**
 * Канон боя между столами: сверить → показать разницу → применить.
 *
 * Канон — минимальный детерминированный срез сущностей (id, hp, pos, status),
 * ровно то, что производит WEGO-резолвер. Хост и игроки обмениваются им в
 * round_result; этот модуль решает, что изменится у локального стола, если
 * канон применить. Локальные сущности, которых нет в каноне, не трогаются:
 * столы вправе вести разных НПС, а чужих мы не выдумываем.
 */

import { Entity } from '../types/chronicle';

/** Минимальный срез сущности, который ездит по сети в round_result. */
export interface CanonEntity {
  id: string;
  hp: number;
  pos: number[];
  status: string;
}

/** Тело round_result: раунд, срез сущностей, строки журнала боя (опционально). */
export interface CanonState {
  round: number;
  entities: CanonEntity[];
  logs?: string[];
}

export interface CanonDiff {
  /** id сущностей, у которых изменится hp */
  hp: string[];
  /** id сущностей, у которых изменится позиция */
  pos: string[];
  /** id сущностей, у которых изменится статус */
  status: string[];
  /** id из канона, которых нет локально (применение их игнорирует) */
  unknown: string[];
  /** сколько сущностей канона вообще найдено локально */
  matched: number;
}

const samePos = (a: number[], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

const ENTITY_STATUSES: readonly string[] = ['Alive', 'Wounded', 'Unconscious', 'Dead', 'Stunned'];

/** Что изменится локально при применении канона — для превью перед применением. */
export function diffCanon(local: Entity[], canon: CanonEntity[]): CanonDiff {
  const byId = new Map(local.map(e => [e.id, e]));
  const diff: CanonDiff = { hp: [], pos: [], status: [], unknown: [], matched: 0 };
  for (const c of canon) {
    const e = byId.get(c.id);
    if (!e) {
      diff.unknown.push(c.id);
      continue;
    }
    diff.matched += 1;
    if (e.hp !== c.hp) diff.hp.push(c.id);
    if (!samePos(c.pos, e.pos)) diff.pos.push(c.id);
    if (e.status !== c.status) diff.status.push(c.id);
  }
  return diff;
}

/**
 * Применить канон к локальным сущностям: hp зажимается в [0, maxHp], pos и
 * status переносятся как есть. Возвращает новый массив и число изменённых
 * сущностей; локально-уникальные сущности остаются нетронутыми.
 */
export function applyCanon(
  local: Entity[],
  canon: CanonEntity[]
): { entities: Entity[]; changed: number } {
  const byId = new Map(canon.map(c => [c.id, c]));
  let changed = 0;
  const entities = local.map(e => {
    const c = byId.get(e.id);
    if (!c) return e;
    const hp = Math.max(0, Math.min(e.maxHp, c.hp));
    const status = (ENTITY_STATUSES.includes(c.status) ? c.status : e.status) as Entity['status'];
    const next: Entity = {
      ...e,
      hp,
      pos: [c.pos[0], c.pos[1]],
      status,
    };
    if (next.hp !== e.hp || !samePos(next.pos, e.pos) || next.status !== e.status) changed += 1;
    return next;
  });
  return { entities, changed };
}
