import {
  Entity,
  PlayerIntentPayload,
  MasterStatePayload,
} from '../types/chronicle';
import { calculateCommitRevealD20 } from './cryptoDice';

export interface ResolutionResult {
  nextEntities: Entity[];
  combatStatus: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled';
  mechanicalLog: string[];
  generatedSvg: string;
  suggestedProse: string;
  statePayload: MasterStatePayload;
}

export async function resolveWegoRound(
  currentEntities: Entity[],
  round: number,
  playerIntents: PlayerIntentPayload[],
  masterSeed: string
): Promise<ResolutionResult> {
  const nextEntities: Entity[] = JSON.parse(JSON.stringify(currentEntities));
  const mechanicalLog: string[] = [];
  const svgTrails: string[] = [];
  const svgEffects: string[] = [];

  const getEntity = (id: string) => nextEntities.find(e => e.id === id || e.actorId === id);

  // 1. Resolve Movements along paths
  for (const intent of playerIntents) {
    const actor = getEntity(intent.actor_id);
    if (!actor || actor.status === 'Dead') continue;

    if (intent.movement && intent.movement.path && intent.movement.path.length > 0) {
      const startPos = actor.pos;
      const endPos = intent.movement.path[intent.movement.path.length - 1];
      actor.pos = endPos;

      const pathStr = [startPos, ...intent.movement.path]
        .map(([x, y]) => `${x * 40 + 20},${y * 40 + 20}`)
        .join(' ');
      svgTrails.push(`<polyline points="${pathStr}" fill="none" stroke="${actor.color}" stroke-width="3" stroke-dasharray="4,4" opacity="0.8" />`);
      mechanicalLog.push(`${actor.name} moves from [${startPos[0]},${startPos[1]}] to [${endPos[0]},${endPos[1]}] (Path: ${intent.movement.path.length} squares)`);
    }
  }

  // 2. Sort Actors by Initiative + Actions
  // Player Actions
  for (const intent of playerIntents) {
    const actor = getEntity(intent.actor_id);
    if (!actor || actor.status === 'Dead') continue;

    const action = intent.action;
    if (action.type === 'cast_spell' && action.spell_name === 'Scorching Ray') {
      const rays = action.rays || [];
      mechanicalLog.push(`\n⚡ ${actor.name} casts Scorching Ray (Slot Lvl ${action.slot_level || 2}):`);

      for (let i = 0; i < rays.length; i++) {
        const ray = rays[i];
        let target = getEntity(ray.target_id);

        // Fallback rule check: if primary target is dead, redirect
        if (!target || target.status === 'Dead') {
          const fallback = intent.fallback_rules?.find(f => f.trigger.includes('dead') || f.redirect_all_to);
          if (fallback && fallback.redirect_all_to) {
            const redirectTarget = getEntity(fallback.redirect_all_to);
            if (redirectTarget && redirectTarget.status !== 'Dead') {
              mechanicalLog.push(`  ↳ [Fallback Triggered]: Primary target is down. Ray #${i + 1} redirected to ${redirectTarget.name}`);
              target = redirectTarget;
            }
          }
        }

        if (!target || target.status === 'Dead') {
          // find any alive enemy
          target = nextEntities.find(e => e.role === 'enemy' && e.status !== 'Dead');
        }

        if (target && target.status !== 'Dead') {
          const diceResult = await calculateCommitRevealD20(ray.dice_seed || `seed_ray_${i}`, masterSeed);
          const attackRoll = diceResult.d20 + 5; // +5 spell attack mod
          const isHit = attackRoll >= target.ac || diceResult.isCritSuccess;

          // Add SVG spell ray beam
          const startX = actor.pos[0] * 40 + 20;
          const startY = actor.pos[1] * 40 + 20;
          const targetX = target.pos[0] * 40 + 20;
          const targetY = target.pos[1] * 40 + 20;
          svgEffects.push(
            `<line x1="${startX}" y1="${startY}" x2="${targetX}" y2="${targetY}" stroke="#ef4444" stroke-width="4" stroke-linecap="round" opacity="0.9" />`
          );
          svgEffects.push(
            `<circle cx="${targetX}" cy="${targetY}" r="8" fill="#f59e0b" opacity="0.8" />`
          );

          if (isHit) {
            const damage = diceResult.isCritSuccess ? 22 : Math.floor(8 + (diceResult.d20 % 6));
            target.hp = Math.max(0, target.hp - damage);
            mechanicalLog.push(
              `  • Ray #${i + 1} vs ${target.name}: D20=${diceResult.d20} + 5 = ${attackRoll} vs AC ${target.ac} -> HIT! Deals ${damage} fire damage (Target HP: ${target.hp}/${target.maxHp})`
            );
            if (target.hp <= 0) {
              target.status = 'Dead';
              mechanicalLog.push(`  💀 ${target.name} collapses into burning ash!`);
            }
          } else {
            mechanicalLog.push(
              `  • Ray #${i + 1} vs ${target.name}: D20=${diceResult.d20} + 5 = ${attackRoll} vs AC ${target.ac} -> MISS!`
            );
          }
        }
      }
    } else if (action.type === 'attack') {
      let target = action.target_id ? getEntity(action.target_id) : undefined;
      if (!target || target.status === 'Dead') {
        target = nextEntities.find(e => e.role === 'enemy' && e.status !== 'Dead');
      }

      if (target && target.status !== 'Dead') {
        const diceResult = await calculateCommitRevealD20(action.dice_seed || 'attack_seed', masterSeed);
        const attackRoll = diceResult.d20 + 6; // +6 melee attack
        const isHit = attackRoll >= target.ac || diceResult.isCritSuccess;

        const startX = actor.pos[0] * 40 + 20;
        const startY = actor.pos[1] * 40 + 20;
        const targetX = target.pos[0] * 40 + 20;
        const targetY = target.pos[1] * 40 + 20;
        svgEffects.push(
          `<line x1="${startX}" y1="${startY}" x2="${targetX}" y2="${targetY}" stroke="#eab308" stroke-width="3" stroke-dasharray="2,2" />`
        );

        if (isHit) {
          const damage = diceResult.isCritSuccess ? 24 : 14;
          target.hp = Math.max(0, target.hp - damage);
          mechanicalLog.push(
            `⚔️ ${actor.name} strikes ${target.name} with Greatsword: Roll ${attackRoll} vs AC ${target.ac} -> HIT! Deals ${damage} slashing damage.`
          );
          if (target.hp <= 0) {
            target.status = 'Dead';
            mechanicalLog.push(`  💀 ${target.name} is cleaved and falls motionless!`);
          }
        } else {
          mechanicalLog.push(
            `⚔️ ${actor.name} attacks ${target.name}: Roll ${attackRoll} vs AC ${target.ac} -> Glances off armor.`
          );
        }
      }
    }
  }

  // Enemy counter-actions if alive
  const aliveEnemies = nextEntities.filter(e => e.role === 'enemy' && e.status !== 'Dead');
  for (const enemy of aliveEnemies) {
    const targetPlayer = nextEntities.find(e => e.role === 'player' && e.status !== 'Dead');
    if (targetPlayer) {
      // Check reaction for Elena
      const elenaIntent = playerIntents.find(p => p.actor_id === 'char_wizard_elena');
      let effectiveAc = targetPlayer.ac;
      if (targetPlayer.actorId === 'char_wizard_elena' && elenaIntent?.reaction?.spell === 'Shield') {
        effectiveAc += 5;
        mechanicalLog.push(`🛡️ [Reaction Triggered] Elena casts Shield! (+5 AC, temporary AC: ${effectiveAc})`);
      }

      const diceResult = await calculateCommitRevealD20(`enemy_seed_${round}`, masterSeed);
      const attackRoll = diceResult.d20 + 4;
      if (attackRoll >= effectiveAc) {
        const dmg = 6;
        targetPlayer.hp = Math.max(0, targetPlayer.hp - dmg);
        mechanicalLog.push(`🏹 ${enemy.name} attacks ${targetPlayer.name}: Roll ${attackRoll} vs AC ${effectiveAc} -> HIT for ${dmg} piercing dmg!`);
      } else {
        mechanicalLog.push(`🏹 ${enemy.name} attacks ${targetPlayer.name}: Roll ${attackRoll} vs AC ${effectiveAc} -> Blocked!`);
      }
    }
  }

  // Check Victory/Defeat condition
  const remainingEnemies = nextEntities.filter(e => e.role === 'enemy' && e.status !== 'Dead');
  const remainingPlayers = nextEntities.filter(e => e.role === 'player' && e.status !== 'Dead');
  let combatStatus: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled' = 'Ongoing';

  if (remainingEnemies.length === 0) {
    combatStatus = 'Ended_Victory';
    mechanicalLog.push(`\n🏆 COMBAT VICTORY! All hostiles neutralized.`);
  } else if (remainingPlayers.length === 0) {
    combatStatus = 'Ended_Defeat';
    mechanicalLog.push(`\n💀 PARTY DEFEATED.`);
  }

  // Generate SVG Battlemap
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
  
  <!-- Floor texture & Grid -->
  <rect width="640" height="480" fill="#1c1917"/>
  <rect width="640" height="480" fill="url(#cryptGlow)"/>
  <rect width="640" height="480" fill="url(#grid)"/>
  
  <!-- Crypt Walls & Altar -->
  <rect x="440" y="280" width="100" height="60" rx="4" fill="#292524" stroke="#78716c" stroke-width="2" />
  <text x="490" y="315" font-family="serif" font-size="12" fill="#d6d3d1" text-anchor="middle">Каменный Алтарь</text>
  
  <!-- Movement trails & Spell rays -->
  ${svgTrails.join('\n')}
  ${svgEffects.join('\n')}

  <!-- Entity Tokens -->
  ${nextEntities.map(e => {
    const cx = e.pos[0] * 40 + 20;
    const cy = e.pos[1] * 40 + 20;
    const isDead = e.status === 'Dead';
    const fill = isDead ? '#44403c' : e.color;
    const stroke = e.role === 'player' ? '#60a5fa' : '#f87171';
    return `
    <g transform="translate(${cx}, ${cy})">
      <circle r="16" fill="${fill}" stroke="${stroke}" stroke-width="${isDead ? 1 : 2.5}" opacity="${isDead ? 0.4 : 1}" />
      <text y="4" font-family="sans-serif" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${isDead ? '✕' : e.name.substring(0, 2).toUpperCase()}
      </text>
      <text y="24" font-family="sans-serif" font-size="9" fill="${isDead ? '#a8a29e' : '#fef08a'}" text-anchor="middle">
        ${e.name.split(' ')[0]} (${e.hp}/${e.maxHp})
      </text>
    </g>`;
  }).join('\n')}
</svg>`.trim();

  // Suggest Master canonical prose
  const suggestedProse = `Воздух в крипте задрожал от запаха озона. Шаман гоблинов вскинул костяной посох, но не успел закончить заклятие: огненные лучи Елены пробили его грудь. Секундой позже тяжелая секира Торина опустилась на каменный алтарь, поставив точку в этом сражении...`;

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
    mechanical_log: mechanicalLog,
  };

  return {
    nextEntities,
    combatStatus,
    mechanicalLog,
    generatedSvg,
    suggestedProse,
    statePayload,
  };
}
