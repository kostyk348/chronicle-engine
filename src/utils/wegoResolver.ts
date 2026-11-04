/**
 * Chronicle Engine — WEGO Tactical Resolver v2.
 *
 * Одновременное разрешение хода (We GO — все планируют, затем всё
 * разрешается). Движок полностью детерминирован: одинаковые интенты
 * + одинаковый мастер-seed дают побитово одинаковый лог на любой машине.
 * Все броски — commit-reveal: d20 = HMAC(seed_actor, seed_master + контекст),
 * игрок не может перекинуть, мастер не может подсмотреть заранее.
 *
 * Фазы раунда (строгий порядок):
 *   0. Валидация интентов — мёртвые актёры и недостижимые позиции отсекаются.
 *   1. Перемещение — все одновременно, с лимитом скорости (dash ×2),
 *      стены и занятые клетки блокируют шаг.
 *   2. Действия — игроки в порядке интентов, затем AI врагов (тоже интент).
 *   3. Реакции — Щит (+5 AC) срабатывает при входящем ударе у любого актёра.
 *   4. Смерти — враги Dead, игроки Unconscious (спасброски от смерти — дальше).
 *   5. Итог раунда — Victory / Defeat / Fled / Ongoing.
 *
 * Advantage/Disadvantage: две d20 с разными солями, берём большую/меньшую.
 * Крит: натуральная 20 — удвоенные кости урона; натуральная 1 — промах всегда.
 */

import {
  Entity,
  PlayerIntentPayload,
  MasterStatePayload,
  WeaponSpec,
} from '../types/chronicle';
import {
  calculateCommitRevealD20,
  deriveUint32Stream,
  deriveD20,
} from './cryptoDice';

export interface TerrainSpec {
  /** непроходимые клетки [x,y] */
  walls: [number, number][];
  /** подпись арены для SVG и прозы */
  label: string;
  /** подписи-якоря на карте: [x, y, текст] */
  props?: [number, number, string][];
}

/** Крипта по умолчанию: алтарь и стены — как в кампании «Пепельная крипта». */
export const CRYPT_TERRAIN: TerrainSpec = {
  walls: [
    [11, 7], [12, 7], [13, 7], [11, 10], [12, 10], [13, 10],
    [0, 0], [0, 1], [15, 11],
  ],
  label: 'Пепельная крипта',
  props: [[13, 9, 'Каменный Алтарь']],
};

export interface ResolutionOptions {
  terrain?: TerrainSpec;
}

export interface ResolutionResult {
  nextEntities: Entity[];
  combatStatus: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled';
  mechanicalLog: string[];
  generatedSvg: string;
  suggestedProse: string;
  statePayload: MasterStatePayload;
}

// ---------------------------------------------------------------- dice math

interface DiceExpr {
  n: number;
  d: number;
  mod: number;
}

/** «2d6+3», «1d4+1», «3d8-1», «1d12 + 3 рубящий (… )» → {n,d,mod}. */
export function parseDiceExpr(raw: string): DiceExpr | null {
  const m = /(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?/i.exec(raw);
  if (!m) return null;
  return {
    n: Math.min(parseInt(m[1], 10) || 1, 20),
    d: parseInt(m[2], 10),
    mod: m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0,
  };
}

/** Бросок XdY±Z из детерминированного потока uint32. */
async function rollDice(expr: DiceExpr, key: string, msg: string): Promise<number> {
  const need = expr.n + 10; // запас на отбраковку смещения модуля
  const stream = await deriveUint32Stream(key, msg, need);
  let used = 0;
  let sum = 0;
  const rolls: number[] = [];
  for (let i = 0; i < expr.n; i++) {
    let v = 0;
    while (used < stream.length) {
      const u = stream[used++];
      if (u < 4294967296 - (4294967296 % expr.d)) {
        v = (u % expr.d) + 1;
        break;
      }
    }
    if (v === 0) v = ((stream[used % stream.length] % expr.d) + 1);
    rolls.push(v);
    sum += v;
  }
  void rolls;
  return sum + expr.mod;
}

/** d20 с преимуществом/помехой: 2 броска, берём нужный. */
async function rollD20(
  key: string,
  msg: string,
  edge: 'none' | 'advantage' | 'disadvantage'
): Promise<number> {
  if (edge === 'none') return deriveD20(key, msg);
  const a = deriveD20(key, `${msg}:adv_a`);
  const b = deriveD20(key, `${msg}:adv_b`);
  const [x, y] = await Promise.all([a, b]);
  return edge === 'advantage' ? Math.max(x, y) : Math.min(x, y);
}

// ------------------------------------------------------------- 5e-ish data

interface SpellSpec {
  /** урон на цель в виде костей */
  damage: string;
  /** тип урона для лога */
  dtype: string;
  /** нужен ли атакующий бросок (иначе — автопопадание, как Magic Missile) */
  attackRoll: boolean;
  /** число целей на уровне ячейки (для лучей/снарядов) */
  targetsAt?: (slot: number) => number;
  /** реакция: бонус к AC */
  acBonus?: number;
  /** назывные синонимы (RU/EN) */
  aliases: string[];
}

const SPELL_BOOK: Record<string, SpellSpec> = {
  'scorching ray': {
    damage: '2d6', dtype: 'огонь', attackRoll: true,
    targetsAt: (slot) => Math.min(7, Math.max(3, slot + 1)),
    aliases: ['scorching ray', 'палящий луч'],
  },
  'magic missile': {
    damage: '1d4+1', dtype: 'силa', attackRoll: false,
    targetsAt: (slot) => Math.max(3, slot),
    aliases: ['magic missile', 'волшебная стрела'],
  },
  'fire bolt': {
    damage: '1d10', dtype: 'огонь', attackRoll: true,
    aliases: ['fire bolt', 'огненный снаряд'],
  },
  shield: {
    damage: '', dtype: '', attackRoll: false, acBonus: 5,
    aliases: ['shield', 'щит'],
  },
};

function findSpell(name?: string): { spec: SpellSpec; key: string } | null {
  if (!name) return null;
  const norm = name.toLowerCase().trim();
  for (const [key, spec] of Object.entries(SPELL_BOOK)) {
    if (spec.aliases.some(a => a === norm)) return { spec, key };
  }
  return null;
}

/** Бонус атаки: данные важнее вычислений. Уровень даёт разумный дефолт. */
function attackBonusOf(entity: Entity, weapon?: WeaponSpec, isSpell = false): number {
  if (isSpell) return 5 + Math.floor(((entity.level ?? 1) - 1) / 4); // заклинатели
  if (weapon?.attackBonus !== undefined) return weapon.attackBonus;
  if (entity.attackBonusOverride !== undefined) return entity.attackBonusOverride;
  return 2 + Math.floor((entity.level ?? 1) / 2); // воины: prof + модификатор
}

function weaponDice(entity: Entity, weaponName?: string): { spec: WeaponSpec; expr: DiceExpr } {
  const list = entity.weapons ?? [];
  const w =
    (weaponName && list.find(x => x.name.toLowerCase() === weaponName.toLowerCase())) ||
    list[0] || { name: 'Кулаки', damage: '1', damageDice: '1', range: 1 };
  const expr =
    (w.damageDice && parseDiceExpr(w.damageDice)) ||
    parseDiceExpr(w.damage) ||
    { n: 1, d: 4, mod: 0 };
  return { spec: w, expr };
}

// ------------------------------------------------------------ round resolver

export async function resolveWegoRound(
  currentEntities: Entity[],
  round: number,
  playerIntents: PlayerIntentPayload[],
  masterSeed: string,
  options: ResolutionOptions = {}
): Promise<ResolutionResult> {
  const terrain = options.terrain ?? CRYPT_TERRAIN;
  const nextEntities: Entity[] = JSON.parse(JSON.stringify(currentEntities));
  const log: string[] = [];
  const svgTrails: string[] = [];
  const svgEffects: string[] = [];

  const walls = new Set(terrain.walls.map(([x, y]) => `${x},${y}`));
  const getEntity = (id?: string) =>
    nextEntities.find(e => e.id === id || e.actorId === id);
  const alive = (e?: Entity) => !!e && e.status !== 'Dead' && e.status !== 'Unconscious';

  // --- фаза 0: интенты живых актёров, в стабильном порядке ------------------
  const intents = playerIntents.filter(i => alive(getEntity(i.actor_id)));
  const dodging = new Set<string>();
  const helped = new Set<string>();
  const fled = new Set<string>();

  for (const i of intents) {
    if (i.action?.type === 'dodge') dodging.add(i.actor_id);
    if (i.action?.type === 'help') helped.add(i.action.target_id ?? '');
  }

  // --- фаза 1: перемещение (одновременно) -----------------------------------
  for (const intent of intents) {
    const actor = getEntity(intent.actor_id);
    if (!actor || !alive(actor)) continue;

    const path = intent.movement?.path ?? [];
    if (path.length === 0) continue;

    const speedCap = Math.max(1, Math.floor((actor.speed || 6) * (intent.movement.dash ? 2 : 1)));
    const steps = path.slice(0, speedCap);
    if (steps.length < path.length) {
      log.push(`⏩ ${actor.name}: путь укорочен до ${steps.length} клеток (скорость ${speedCap}${intent.movement.dash ? ', рывок' : ''})`);
    }

    const startPos: [number, number] = [actor.pos[0], actor.pos[1]];
    let endPos = startPos;
    const trail: [number, number][] = [startPos];
    for (const step of steps) {
      const occupied = nextEntities.some(
        e => e !== actor && alive(e) && e.pos[0] === step[0] && e.pos[1] === step[1]
      );
      if (walls.has(`${step[0]},${step[1]}`) || occupied) {
        log.push(`⛔ ${actor.name}: путь заблокирован на [${step[0]},${step[1]}], движение остановлено`);
        break;
      }
      endPos = [step[0], step[1]];
      trail.push(endPos);
    }
    if (endPos[0] !== startPos[0] || endPos[1] !== startPos[1]) {
      actor.pos = endPos;
      const pathStr = trail
        .map(([x, y]) => `${x * 40 + 20},${y * 40 + 20}`)
        .join(' ');
      svgTrails.push(`<polyline points="${pathStr}" fill="none" stroke="${actor.color}" stroke-width="3" stroke-dasharray="4,4" opacity="0.8" />`);
      log.push(`🚶 ${actor.name} перемещается: [${startPos[0]},${startPos[1]}] → [${endPos[0]},${endPos[1]}]${intent.movement.dash ? ' (рывок)' : ''}`);
    }
  }

  // --- общая механика удара --------------------------------------------------
  async function attackRollAgainst(
    attacker: Entity,
    target: Entity,
    bonus: number,
    seed: string,
    forcedEdge?: 'advantage' | 'disadvantage'
  ): Promise<{ d20: number; total: number; hit: boolean; crit: boolean; edge: 'none' | 'advantage' | 'disadvantage' }> {
    let edge: 'none' | 'advantage' | 'disadvantage' = forcedEdge ?? 'none';
    if (dodging.has(target.id) || dodging.has(target.actorId ?? '')) {
      edge = edge === 'advantage' ? 'none' : 'disadvantage';
    }
    if (helped.has(attacker.id) || helped.has(attacker.actorId ?? '')) {
      edge = edge === 'disadvantage' ? 'none' : 'advantage';
    }
    const d20 = await rollD20(seed, `${masterSeed}:r${round}`, edge);
    const total = d20 + bonus;

    // реакция: Щит у цели (обобщено на любого актёра со spell Shield)
    let effectiveAc = target.ac;
    const shieldIntent = intents.find(
      i => (i.actor_id === target.id || i.actor_id === target.actorId) &&
        i.reaction?.spell?.toLowerCase() === 'shield'
    );
    if (shieldIntent) {
      effectiveAc += 5;
      log.push(`🛡️ [Реакция] ${target.name} бросает Щит! (+5 AC, эффективно ${effectiveAc})`);
    }

    const crit = d20 === 20;
    const hit = crit || (d20 !== 1 && total >= effectiveAc);
    return { d20, total, hit, crit, edge };
  }

  async function applyDamage(
    target: Entity,
    damage: number,
    dtype: string,
    attackerName: string
  ): Promise<void> {
    target.hp = Math.max(0, target.hp - damage);
    log.push(`   💥 ${target.name} получает ${damage} ${dtype} от ${attackerName} (HP: ${target.hp}/${target.maxHp})`);
    if (target.hp === 0) {
      if (target.role === 'player') {
        target.status = 'Unconscious';
        log.push(`   🩸 ${target.name} без сознания — нужны спасброски от смерти!`);
      } else {
        target.status = 'Dead';
        log.push(`   💀 ${target.name} падает замертво!`);
      }
    }
    const fx = `#${target.color}`;
    svgEffects.push(
      `<circle cx="${target.pos[0] * 40 + 20}" cy="${target.pos[1] * 40 + 20}" r="8" fill="${fx}" opacity="0.8" />`
    );
  }

  async function attackLine(from: Entity, to: Entity, color: string, dashed = false) {
    svgEffects.push(
      `<line x1="${from.pos[0] * 40 + 20}" y1="${from.pos[1] * 40 + 20}" x2="${to.pos[0] * 40 + 20}" y2="${to.pos[1] * 40 + 20}" stroke="${color}" stroke-width="3" stroke-linecap="round" ${dashed ? 'stroke-dasharray="2,2"' : ''} opacity="0.9" />`
    );
  }

  /** Универсальное оружие-атаки: живая цель, кости из данных, крит ×2 кости. */
  async function doWeaponAttack(
    attacker: Entity,
    target: Entity,
    weaponName: string | undefined,
    seed: string
  ): Promise<void> {
    const { spec: weapon, expr } = weaponDice(attacker, weaponName);
    const bonus = attackBonusOf(attacker, weapon);
    const dist = (weapon.range ?? 1) > 1 ? 'дальним боем' : 'в ближнем бою';

    await attackLine(attacker, target, '#eab308', true);
    const r = await attackRollAgainst(attacker, target, bonus, seed);
    const edgeNote = r.edge !== 'none' ? (r.edge === 'advantage' ? ' (преимущество)' : ' (помеха)') : '';

    if (r.hit) {
      const dmgExpr: DiceExpr = r.crit ? { ...expr, n: expr.n * 2 } : expr;
      const dmg = await rollDice(dmgExpr, seed, `${masterSeed}:dmg:r${round}`);
      log.push(`⚔️ ${attacker.name} бьёт ${target.name} (${weapon.name}, ${dist}): d20=${r.d20}${edgeNote} + ${bonus} = ${r.total} vs AC ${target.ac} — ПОПАДАНИЕ${r.crit ? ' (КРИТ!)' : ''}:`);
      await applyDamage(target, dmg, (expr.mod ? '' : '') + 'урона', attacker.name);
      if (r.crit) log.push(`   🔥 Критическое попадание — кости удвоены!`);
    } else {
      log.push(`⚔️ ${attacker.name} атакует ${target.name} (${weapon.name}): d20=${r.d20}${edgeNote} + ${bonus} = ${r.total} vs AC ${target.ac}${r.d20 === 1 ? ' — провал на единице!' : ' — скользит по броне.'}`);
    }
  }

  /** Универсальное заклинание из книги: лучи/снаряды, ячейки, автопопадание. */
  async function doSpell(
    caster: Entity,
    intent: PlayerIntentPayload,
    fallbackTo?: string
  ): Promise<void> {
    const action = intent.action;
    const found = findSpell(action.spell_name);
    const slot = action.slot_level ?? 1;

    // Реакция-щит как основное действие смысла не имеет — но разрешаем кастер-щит
    if (found?.spec.acBonus && !found.spec.damage) {
      log.push(`🛡️ ${caster.name} поддерживает Щит — +5 AC до следующего хода.`);
      return;
    }
    if (!found) {
      const dmg = await rollDice({ n: 2, d: 6, mod: 0 }, action.dice_seed ?? caster.id, `${masterSeed}:generic:r${round}`);
      const t = alive(getEntity(action.target_id)) ? getEntity(action.target_id)! : nextEntities.find(e => e.role === 'enemy' && alive(e));
      if (t) {
        log.push(`✨ ${caster.name} произносит «${action.spell_name}» — поток силы срывается в ${t.name}:`);
        await applyDamage(t, dmg, 'магии', caster.name);
      }
      return;
    }

    const spec = found.spec;
    const rayTargets = action.rays ?? [];

    if (spec.targetsAt) {
      const want = spec.targetsAt(slot);
      if (rayTargets.length > want) {
        log.push(`📜 ${caster.name}: ячейка ${slot} уровня даёт ${want} ${found.key === 'magic missile' ? 'снарядов' : 'лучей'} — лишние отброшены`);
      }
      const shots = rayTargets.slice(0, want);
      if (shots.length === 0) {
        const t = alive(getEntity(action.target_id)) ? getEntity(action.target_id)! : nextEntities.find(e => e.role === 'enemy' && alive(e));
        if (t) shots.push({ target_id: t.id, dice_seed: action.dice_seed ?? `${caster.id}_seed` });
      }
      if (shots.length > 0) {
        log.push(`⚡ ${caster.name} читает «${action.spell_name}» (ячейка ${slot} ур., целей: ${shots.length}):`);
      }
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        let target = alive(getEntity(shot.target_id)) ? getEntity(shot.target_id)! : undefined;

        // fallback-правила: если основная цель мертва — перенаправить
        if (!target && fallbackTo && alive(getEntity(fallbackTo))) {
          target = getEntity(fallbackTo);
          log.push(`  ↳ [Fallback]: цель пала, выстрел #${i + 1} перенаправлен в ${target!.name}`);
        }
        if (!target) {
          target = nextEntities.find(e => e.role === 'enemy' && alive(e));
        }
        if (!target) continue;

        const seed = shot.dice_seed || `${caster.id}_shot_${i}`;
        if (spec.attackRoll) {
          const bonus = attackBonusOf(caster, undefined, true);
          await attackLine(caster, target, '#ef4444');
          const r = await attackRollAgainst(caster, target, bonus, seed);
          const edgeNote = r.edge !== 'none' ? (r.edge === 'advantage' ? ' (преимущество)' : ' (помеха)') : '';
          if (r.hit) {
            const dmgExpr: DiceExpr = r.crit ? { ...parseDiceExpr(spec.damage)!, n: parseDiceExpr(spec.damage)!.n * 2 } : parseDiceExpr(spec.damage)!;
            const dmg = await rollDice(dmgExpr, seed, `${masterSeed}:spell:r${round}:s${i}`);
            log.push(`  • Выстрел #${i + 1} → ${target.name}: d20=${r.d20}${edgeNote} + ${bonus} = ${r.total} vs AC ${target.ac} — ПОПАДАНИЕ${r.crit ? ' (КРИТ!)' : ''}:`);
            await applyDamage(target, dmg, spec.dtype, caster.name);
          } else {
            log.push(`  • Выстрел #${i + 1} → ${target.name}: d20=${r.d20}${edgeNote} + ${bonus} = ${r.total} vs AC ${target.ac} — мимо.`);
          }
        } else {
          // автопопадание (Magic Missile)
          const dmg = await rollDice(parseDiceExpr(spec.damage)!, seed, `${masterSeed}:spell:r${round}:s${i}`);
          await attackLine(caster, target, '#a78bfa', true);
          log.push(`  • Снаряд #${i + 1} → ${target.name}: автопопадание, ${dmg} ${spec.dtype}:`);
          await applyDamage(target, dmg, spec.dtype, caster.name);
        }
      }
    }
  }

  async function doHeal(actor: Entity, seed: string): Promise<void> {
    const heal = await rollDice({ n: 2, d: 4, mod: 2 }, seed, `${masterSeed}:heal:r${round}`);
    const before = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + heal);
    log.push(`🧪 ${actor.name} пьёт зелье лечения: +${actor.hp - before} HP (было ${before}, стало ${actor.hp}/${actor.maxHp})`);
    svgEffects.push(`<circle cx="${actor.pos[0] * 40 + 20}" cy="${actor.pos[1] * 40 + 20}" r="10" fill="#22c55e" opacity="0.7" />`);
  }

  async function doFlee(actor: Entity, seed: string): Promise<void> {
    const d20 = await rollD20(seed, `${masterSeed}:flee:r${round}`, 'none');
    const dc = 10;
    if (d20 + 2 >= dc) {
      fled.add(actor.id);
      actor.status = 'Alive';
      log.push(`🏃 ${actor.name} вырывается из боя (d20=${d20}+2 vs DC ${dc}) — сражение покинуто!`);
    } else {
      dodging.add(actor.id); // не ушёл — хотя бы уклоняется
      log.push(`🏃 ${actor.name} пытается бежать, но отрезан (d20=${d20}+2 vs DC ${dc}) — остаётся в бою, уклоняется.`);
    }
  }

  // --- фаза 2: действия игроков ---------------------------------------------
  for (const intent of intents) {
    const actor = getEntity(intent.actor_id);
    if (!actor || !alive(actor)) continue;
    if (fled.has(actor.id)) continue;

    const action = intent.action;
    switch (action.type) {
      case 'attack': {
        let target = alive(getEntity(action.target_id)) ? getEntity(action.target_id)! : undefined;
        if (!target) target = nextEntities.find(e => e.role === 'enemy' && alive(e));
        if (target) await doWeaponAttack(actor, target, action.weapon_name, action.dice_seed ?? `${actor.id}_attack`);
        else log.push(`⚔️ ${actor.name}: живых врагов нет — удар в воздух.`);
        break;
      }
      case 'cast_spell': {
        const fb = intent.fallback_rules?.find(f => f.redirect_all_to);
        await doSpell(actor, intent, fb?.redirect_all_to);
        break;
      }
      case 'dash':
        log.push(`💨 ${actor.name} совершает рывок — дополнительное перемещение в следующей фазе.`);
        break;
      case 'dodge':
        log.push(`🌀 ${actor.name} уходит в защиту: атаки по нему до следующего хода — с помехой.`);
        break;
      case 'item':
        await doHeal(actor, action.dice_seed ?? `${actor.id}_item`);
        break;
      case 'help': {
        const ally = getEntity(action.target_id);
        if (ally && alive(ally)) {
          helped.add(ally.id);
          log.push(`🤝 ${actor.name} помогает ${ally.name}: следующая атака союзника — с преимуществом.`);
        }
        break;
      }
      case 'flee':
        await doFlee(actor, action.dice_seed ?? `${actor.id}_flee`);
        break;
    }
    if (!alive(actor)) continue; // может умереть от собственной магии? нет — но проверка дешёвая
  }

  // --- фаза 3: AI врагов (детерминированные интенты) -------------------------
  const aiIntents: PlayerIntentPayload[] = [];
  for (const enemy of nextEntities.filter(e => e.role === 'enemy' && alive(e))) {
    const players = nextEntities.filter(e => e.role === 'player' && alive(e));
    if (players.length === 0) break;
    const target = players.reduce((a, b) =>
      Math.hypot(b.pos[0] - enemy.pos[0], b.pos[1] - enemy.pos[1]) <
      Math.hypot(a.pos[0] - enemy.pos[0], a.pos[1] - enemy.pos[1]) ? b : a
    );
    const weapon = (enemy.weapons ?? [])[0];
    const range = weapon?.range ?? 1;
    const dist = Math.max(Math.abs(target.pos[0] - enemy.pos[0]), Math.abs(target.pos[1] - enemy.pos[1]));
    const path: [number, number][] = [];
    if (dist > range) {
      let [cx, cy] = enemy.pos;
      const steps = Math.min(enemy.speed || 6, dist - (range > 1 ? 0 : 1));
      for (let s = 0; s < steps; s++) {
        const dx = Math.sign(target.pos[0] - cx);
        const dy = Math.sign(target.pos[1] - cy);
        if (dx !== 0 && !walls.has(`${cx + dx},${cy}`)) cx += dx;
        else if (dy !== 0 && !walls.has(`${cx},${cy + dy}`)) cy += dy;
        else break;
        path.push([cx, cy]);
      }
    }
    aiIntents.push({
      actor_id: enemy.id,
      round,
      movement: { path, dash: false },
      action: {
        type: 'attack',
        weapon_name: weapon?.name,
        target_id: target.id,
        dice_seed: `${enemy.id}:ai:r${round}`,
      },
    });
  }

  // AI-перемещение (после игроков — враги не знают их финальных ходов? В WEGO
  // наоборот: всё одновременно. AI-путь строился от старых позиций, но шаги
  // валидируются той же блокировкой занятых клеток.)
  for (const intent of aiIntents) {
    const actor = getEntity(intent.actor_id)!;
    const path = intent.movement.path;
    const startPos: [number, number] = [actor.pos[0], actor.pos[1]];
    let endPos = startPos;
    for (const step of path) {
      const occupied = nextEntities.some(
        e => e !== actor && alive(e) && e.pos[0] === step[0] && e.pos[1] === step[1]
      );
      if (walls.has(`${step[0]},${step[1]}`) || occupied) break;
      endPos = [step[0], step[1]];
    }
    if (endPos[0] !== startPos[0] || endPos[1] !== startPos[1]) {
      actor.pos = endPos;
      const pathStr = [startPos, ...path.filter((_, i) => i <= path.findIndex(p => p[0] === endPos[0] && p[1] === endPos[1]))]
        .map(([x, y]) => `${x * 40 + 20},${y * 40 + 20}`)
        .join(' ');
      svgTrails.push(`<polyline points="${pathStr}" fill="none" stroke="${actor.color}" stroke-width="3" stroke-dasharray="4,4" opacity="0.8" />`);
      log.push(`🚶 ${actor.name} перемещается: [${startPos[0]},${startPos[1]}] → [${endPos[0]},${endPos[1]}]`);
    }
  }

  // AI-атаки
  for (const intent of aiIntents) {
    const actor = getEntity(intent.actor_id)!;
    if (!alive(actor)) continue;
    let target = alive(getEntity(intent.action.target_id)) ? getEntity(intent.action.target_id)! : undefined;
    if (!target) target = nextEntities.find(e => e.role === 'player' && alive(e));
    if (!target) break;
    await doWeaponAttack(actor, target, intent.action.weapon_name, intent.action.dice_seed ?? `${actor.id}_ai`);
  }

  // --- фаза 5: исход ----------------------------------------------------------
  const remainingEnemies = nextEntities.filter(e => e.role === 'enemy' && alive(e));
  const remainingPlayers = nextEntities.filter(e => e.role === 'player' && alive(e));
  let combatStatus: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled' = 'Ongoing';
  if (fled.size > 0 && remainingPlayers.every(p => fled.has(p.id))) {
    combatStatus = 'Fled';
    log.push(`\n🏃 Партия отступила — хроники сохранят этот позор.`);
  } else if (remainingEnemies.length === 0) {
    combatStatus = 'Ended_Victory';
    log.push(`\n🏆 ПОБЕДА! Все враги нейтрализованы.`);
  } else if (remainingPlayers.length === 0) {
    combatStatus = 'Ended_Defeat';
    log.push(`\n💀 ПАРТИЯ ПАЛА. Крипта заберёт ещё одну историю.`);
  }

  // --- SVG-карта (из данных, не из констант) ----------------------------------
  const wallsSvg = [...walls].map(([x, y]) => {
    const [wx, wy] = x.split(',').map(Number);
    return `<rect x="${wx * 40}" y="${wy * 40}" width="40" height="40" fill="#292524" stroke="#78716c" stroke-width="1" />`;
  }).join('\n');
  const propsSvg = (terrain.props ?? []).map(([x, y, label]) =>
    `<text x="${x * 40}" y="${y * 40 + 20}" font-family="serif" font-size="12" fill="#d6d3d1" text-anchor="middle">${label}</text>`
  ).join('\n');

  const generatedSvg = `
<svg viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" class="w-full h-full bg-stone-900 rounded-lg shadow-inner">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    </pattern>
    <radialGradient id="cryptGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#09090b" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="640" height="480" fill="#1c1917"/>
  <rect width="640" height="480" fill="url(#cryptGlow)"/>
  <rect width="640" height="480" fill="url(#grid)"/>

  ${wallsSvg}
  ${propsSvg}

  ${svgTrails.join('\n')}
  ${svgEffects.join('\n')}

  ${nextEntities.map(e => {
    const cx = e.pos[0] * 40 + 20;
    const cy = e.pos[1] * 40 + 20;
    const isDead = e.status === 'Dead';
    const isDown = e.status === 'Unconscious';
    const fill = isDead ? '#44403c' : isDown ? '#57534e' : e.color;
    const stroke = e.role === 'player' ? '#60a5fa' : '#f87171';
    const badge = isDead ? '✕' : isDown ? '☠' : e.name.substring(0, 2).toUpperCase();
    return `
    <g transform="translate(${cx}, ${cy})">
      <circle r="16" fill="${fill}" stroke="${stroke}" stroke-width="${isDead ? 1 : 2.5}" opacity="${isDead ? 0.4 : 1}" />
      <text y="4" font-family="sans-serif" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${badge}
      </text>
      <text y="24" font-family="sans-serif" font-size="9" fill="${isDead ? '#a8a29e' : '#fef08a'}" text-anchor="middle">
        ${e.name.split(' ')[0]} (${e.hp}/${e.maxHp})
      </text>
    </g>`;
  }).join('\n')}
</svg>`.trim();

  // --- мастер-канон: детерминированная проза из событий раунда ---------------
  const suggestedProse = buildProse(terrain.label, log, combatStatus);

  const statePayload: MasterStatePayload = {
    round,
    combat_status: combatStatus,
    entities: nextEntities.map(e => ({
      id: e.id,
      hp: e.hp,
      max_hp: e.maxHp,
      pos: e.pos,
      status: e.status,
    })),
    mechanical_log: log,
    initiative_order: [...nextEntities]
      .sort((a, b) => b.initiative - a.initiative)
      .map(e => e.id),
  };

  void round;
  return {
    nextEntities,
    combatStatus,
    mechanicalLog: log,
    generatedSvg,
    suggestedProse,
    statePayload,
  };
}

/** Детерминированная проза мастера: заголовки событий → связный абзац. */
function buildProse(
  arena: string,
  log: string[],
  status: ResolutionResult['combatStatus']
): string {
  const hits = log.filter(l => l.includes('ПОПАДАНИЕ') && l.includes('КРИТ'));
  const kills = log.filter(l => l.includes('падает замертво')).length;
  const spells = log.filter(l => l.includes('читает') || l.includes('произносит')).length;
  const dodges = log.filter(l => l.includes('уходит в защиту')).length;

  const parts: string[] = [`«${arena}» помнит этот раунд.`];
  if (spells > 0) parts.push(`Магия обрушилась ${spells} раз(а) — воздух дрожал от силы.`);
  if (hits.length > 0) {
    parts.push(`Клинки нашли цель дважды судьбоносно: ${hits.length} критических удара(ов) вошли в легенды таверн.`);
  }
  if (kills > 0) parts.push(`${kills} противник(ов) не поднялись больше.`);
  if (dodges > 0) parts.push(`Кто-то выжил не силой, а ловкостью — уклонения спасли жизни.`);

  if (status === 'Ended_Victory') {
    parts.push('Тишина после боя была громче любого крика: партия победила.');
  } else if (status === 'Ended_Defeat') {
    parts.push('Крипта сомкнулась над героями — хроника обрывается здесь.');
  } else if (status === 'Fled') {
    parts.push('Отступление — тоже глава. Пария ушла, чтобы вернуться сильнее.');
  } else {
    parts.push('Бой ещё кипит — следующий раунд уже просится в свитки.');
  }
  return parts.join(' ');
}
