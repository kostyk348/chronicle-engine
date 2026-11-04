/**
 * Фикстуры сущностей/интентов — общие для тестов резолвера и реплея.
 */
import { Entity, PlayerIntentPayload } from '../src/types/chronicle';

export const elena = (over: Partial<Entity> = {}): Entity => ({
  id: 'char_wizard_elena',
  actorId: 'char_wizard_elena',
  name: 'Elena (Wizard Lvl 3)',
  role: 'player',
  characterClass: 'Evocation Wizard',
  level: 3,
  hp: 14,
  maxHp: 16,
  ac: 12,
  speed: 6,
  initiative: 15,
  pos: [3, 4],
  status: 'Alive',
  avatarUrl: '',
  color: '#8b5cf6',
  spells: ['Scorching Ray', 'Shield', 'Magic Missile'],
  weapons: [{ name: 'Quarterstaff', damage: '1d6 bludgeoning', damageDice: '1d6', attackBonus: 2, range: 1 }],
  ...over,
});

export const torin = (over: Partial<Entity> = {}): Entity => ({
  id: 'char_warrior',
  actorId: 'char_warrior',
  name: 'Torin (Warrior Lvl 3)',
  role: 'player',
  characterClass: 'Battle Master Fighter',
  level: 3,
  hp: 24,
  maxHp: 32,
  ac: 17,
  speed: 6,
  initiative: 12,
  pos: [11, 8],
  status: 'Alive',
  avatarUrl: '',
  color: '#3b82f6',
  weapons: [{ name: 'Greatsword', damage: '2d6+3 slashing', damageDice: '2d6+3', attackBonus: 5, range: 1 }],
  ...over,
});

export const shaman = (over: Partial<Entity> = {}): Entity => ({
  id: 'mob_shaman',
  name: 'Goblin Ashen Shaman',
  role: 'enemy',
  hp: 28,
  maxHp: 28,
  ac: 13,
  speed: 6,
  initiative: 14,
  pos: [12, 3],
  status: 'Alive',
  avatarUrl: '',
  color: '#ef4444',
  weapons: [{ name: 'Bone Staff', damage: '1d6 necrotic', damageDice: '1d6', attackBonus: 2, range: 1 }],
  ...over,
});

export const archer = (over: Partial<Entity> = {}): Entity => ({
  id: 'mob_archer_1',
  name: 'Goblin Scout Archer',
  role: 'enemy',
  hp: 14,
  maxHp: 14,
  ac: 13,
  speed: 6,
  initiative: 11,
  pos: [14, 5],
  status: 'Alive',
  avatarUrl: '',
  color: '#f97316',
  weapons: [{ name: 'Shortbow', damage: '1d6 piercing', damageDice: '1d6', attackBonus: 3, range: 20 }],
  ...over,
});

export const intent = (over: Partial<PlayerIntentPayload> = {}): PlayerIntentPayload => ({
  actor_id: 'char_wizard_elena',
  round: 3,
  movement: { path: [], dash: false },
  action: { type: 'dodge' },
  ...over,
});
