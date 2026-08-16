import { EmotionType, GridPos, Entity, PlayerIntentPayload, RoleplayPayload, MasterStatePayload, ArtMetaPayload, EmlAttachment, EmlMessage, BestiaryEntry, GrimoireItem, AudioTrackSegment, Chapter, BookPlacement, RayTarget, FallbackRule, ReactionRule, PlayerActionIntent, PlayerMovementIntent } from './chronicle';

export * from './chronicle';

export interface SpellItem {
  id: string;
  name: string;
  level: number; // 0 for Cantrip, 1..9
  school: 'Воплощение' | 'Ограждение' | 'Иллюзия' | 'Некромантия' | 'Очарование' | 'Превращение' | 'Прорицание' | 'Вызов';
  castingTime: string; // e.g. "1 действие", "1 бонусное действие", "1 реакция"
  range: string; // e.g. "120 футов", "Касание", "На себя"
  components: string; // e.g. "В, С, М (сера и пепел)"
  duration: string; // e.g. "Мгновенная", "Концентрация, до 1 мин."
  description: string;
  damageOrEffect?: string;
  isPrepared?: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'Оружие' | 'Доспех' | 'Зелье' | 'Свиток' | 'Кольцо' | 'Инструмент' | 'Сокровище' | 'Разное';
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact';
  quantity: number;
  weight: number; // in lbs/kg
  equipped?: boolean;
  attunement?: boolean;
  damage?: string;
  acBonus?: number;
  description: string;
  icon?: string;
}

export interface CharacterSheet {
  id: string;
  name: string;
  playerOwner: string;
  race: string;
  characterClass: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;
  speed: number;
  initiativeBonus: number;
  proficiencyBonus: number;
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  savingThrows: string[]; // e.g. ['str', 'con']
  skills: string[]; // e.g. ['Атлетика', 'Внимательность', 'Магия']
  spellSlots: {
    level1: { total: number; used: number };
    level2: { total: number; used: number };
    level3: { total: number; used: number };
    level4: { total: number; used: number };
  };
  spells: SpellItem[];
  inventory: InventoryItem[];
  coins: {
    gp: number; // Gold
    sp: number; // Silver
    cp: number; // Copper
    pp: number; // Platinum
  };
  avatarUrl: string;
  bio: string;
  personalityTraits: string;
  ideals: string;
  flaws: string;
}
