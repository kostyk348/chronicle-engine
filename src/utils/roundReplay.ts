/**
 * Кинематографичный реплей раунда — детерминированный таймлайн из событий.
 *
 * buildReplayTimeline превращает RoundEvent[] резолвера в кадры: каждый кадр
 * несёт подпись для тикера, визуальные эффекты (дуга атаки, всплывающий урон,
 * сдвиг токена) и изменения состояния (hp/статус), которые реплей применяет
 * к локальной копии сущностей. applyFrame — единственный способ мутации
 * реплей-состояния: одинаковые события дают побитово одинаковый показ.
 */

import { RoundEvent } from './wegoResolver';
import { Entity } from '../types/chronicle';

export interface ReplayFrame {
  /** индекс события-источника в events[] */
  eventIndex: number;
  /** мс до следующего кадра при скорости ×1 */
  durationMs: number;
  /** строка тикера */
  caption: string;
  move?: { actorId: string; to: [number, number] };
  arc?: { fromId: string; toId: string; color: string; dashed: boolean; label: string; crit: boolean };
  popup?: { entityId: string; text: string; tone: 'damage' | 'heal' | 'crit' | 'miss' | 'info' };
  /** всплеск частиц: entityId — где рвануло, intensity 1..2 (2 = крит/смерть — трясёт стол) */
  burst?: { entityId: string; intensity: number };
  /** изменения состояния, которые надо применить при показе кадра */
  state: Record<string, { hp?: number; status?: Entity['status'] }>;
}

export interface RoundReplayData {
  round: number;
  events: RoundEvent[];
  /** состояние стола ДО раунда — реплей стартует с него */
  startEntities: Entity[];
  log: string[];
  combatStatus: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled';
  xpGained: number;
}

const DURATIONS: Record<RoundEvent['kind'], number> = {
  move: 650,
  attack: 850,
  damage: 600,
  heal: 700,
  note: 950,
  xp: 900,
  outcome: 1300,
};

export function buildReplayTimeline(events: RoundEvent[]): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  events.forEach((ev, i) => {
    const frame: ReplayFrame = { eventIndex: i, durationMs: DURATIONS[ev.kind], caption: '', state: {} };
    switch (ev.kind) {
      case 'move':
        frame.caption = `🚶 ${ev.actorName}: [${ev.from[0]},${ev.from[1]}] → [${ev.to[0]},${ev.to[1]}]${ev.dash ? ' (рывок)' : ''}`;
        frame.move = { actorId: ev.actorId, to: ev.to };
        break;
      case 'attack': {
        frame.arc = {
          fromId: ev.actorId, toId: ev.targetId, color: ev.color,
          dashed: !!ev.autoHit || !ev.hit, label: ev.label, crit: ev.crit,
        };
        if (ev.crit) frame.burst = { entityId: ev.targetId, intensity: 2 };
        if (ev.autoHit) {
          frame.caption = `✨ ${ev.actorName} → ${ev.targetName}: ${ev.label} — автопопадание`;
          frame.popup = { entityId: ev.targetId, text: 'автопопадание', tone: 'info' };
        } else if (ev.hit) {
          frame.caption = `⚔️ ${ev.actorName} → ${ev.targetName} (${ev.label}): d20=${ev.d20}+${ev.bonus}=${ev.total} vs AC ${ev.ac}${ev.crit ? ' — КРИТ!' : ' — попадание'}`;
          frame.popup = { entityId: ev.targetId, text: ev.crit ? 'КРИТ!' : 'попадание', tone: ev.crit ? 'crit' : 'info' };
        } else {
          frame.caption = `⚔️ ${ev.actorName} → ${ev.targetName} (${ev.label}): d20=${ev.d20}+${ev.bonus}=${ev.total} vs AC ${ev.ac} — мимо`;
          frame.popup = { entityId: ev.targetId, text: 'мимо', tone: 'miss' };
        }
        break;
      }
      case 'damage': {
        frame.caption = `💥 ${ev.targetName}: −${ev.amount} ${ev.dtype} (${ev.hpAfter}/${ev.maxHp})`;
        if (ev.statusAfter === 'Dead') frame.caption += ' — пал замертво!';
        else if (ev.statusAfter === 'Unconscious') frame.caption += ' — без сознания!';
        frame.popup = { entityId: ev.targetId, text: `−${ev.amount}`, tone: 'damage' };
        frame.burst = {
          entityId: ev.targetId,
          intensity: ev.statusAfter === 'Dead' || ev.statusAfter === 'Unconscious' ? 2 : ev.amount >= 15 ? 1.6 : 1,
        };
        frame.state[ev.targetId] = { hp: ev.hpAfter, status: ev.statusAfter };
        break;
      }
      case 'heal':
        frame.caption = `🧪 ${ev.actorName}: +${ev.amount} HP (${ev.hpAfter}/${ev.maxHp})`;
        frame.popup = { entityId: ev.actorId, text: `+${ev.amount}`, tone: 'heal' };
        frame.state[ev.actorId] = { hp: ev.hpAfter };
        break;
      case 'note':
        frame.caption = `${ev.icon} ${ev.actorName ? `${ev.actorName} ` : ''}${ev.text}`;
        if (ev.actorId) frame.popup = { entityId: ev.actorId, text: ev.icon, tone: 'info' };
        break;
      case 'xp':
        frame.caption = `⭐ Партия получает ${ev.amount} XP за павших врагов`;
        break;
      case 'outcome':
        frame.caption =
          ev.status === 'Ended_Victory' ? '🏆 ПОБЕДА! Все враги нейтрализованы' :
          ev.status === 'Ended_Defeat' ? '💀 ПАРТИЯ ПАЛА' :
          ev.status === 'Fled' ? '🏃 Партия отступила' :
          '⚔️ Бой продолжается — следующий раунд уже просится в свитки';
        break;
    }
    frames.push(frame);
  });
  return frames;
}

/**
 * Применить кадр к реплей-состоянию: сдвинуть токен, обновить hp/статус.
 * Незнакомые id молча пропускаются — реплей живёт на снапшоте стола.
 */
export function applyFrame(entities: Entity[], frame: ReplayFrame): Entity[] {
  return entities.map(e => {
    const st = frame.state[e.id];
    const move = frame.move?.actorId === e.id ? frame.move : undefined;
    if (!st && !move) return e;
    return {
      ...e,
      pos: move ? [move.to[0], move.to[1]] : e.pos,
      hp: st?.hp !== undefined ? Math.max(0, Math.min(e.maxHp, st.hp)) : e.hp,
      status: st?.status ?? e.status,
    };
  });
}

/** Быстрая перемотка: применить все кадры с index включительно. */
export function fastForward(entities: Entity[], frames: ReplayFrame[], fromIndex: number): Entity[] {
  let out = entities;
  for (let i = Math.max(0, fromIndex); i < frames.length; i++) out = applyFrame(out, frames[i]);
  return out;
}

// ---------------------------------------------------------------- частицы

export interface Particle {
  /** смещение от центра в px */
  dx: number;
  dy: number;
  /** задержка старта, мс */
  delay: number;
  /** размер в px */
  size: number;
}

/** Детерминированный PRNG mulberry32: одинаковый seed — одинаковый фейерверк. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Всплеск частиц для кадра реплея: разлёт от центра, чем выше intensity,
 * тем больше частиц и дальше разлёт. Детерминирован по seed (= номер кадра),
 * чтобы показ раунда совпадал на всех столах побитово.
 */
export function spawnParticles(seed: number, intensity: number, count?: number): Particle[] {
  const n = Math.max(1, count ?? Math.round(8 * intensity + 4));
  const rnd = mulberry32(seed * 2654435761 + Math.round(intensity * 100));
  const particles: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const angle = rnd() * Math.PI * 2;
    const dist = (10 + rnd() * 30) * intensity;
    particles.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      delay: Math.round(rnd() * 120),
      size: 3 + Math.round(rnd() * 4),
    });
  }
  return particles;
}
