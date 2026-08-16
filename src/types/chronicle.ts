export type EmotionType = 'calm' | 'furious' | 'wounded' | 'smirk' | 'focused' | 'triumphant';

export type BookPlacement = 'FullPageSpread' | 'ChapterHeader' | 'Inline' | 'Margin' | 'Bestiary';

export interface GridPos {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  name: string;
  actorId?: string;
  role: 'player' | 'enemy' | 'npc';
  characterClass?: string;
  level?: number;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  initiative: number;
  pos: [number, number]; // [x, y]
  status: 'Alive' | 'Wounded' | 'Unconscious' | 'Dead' | 'Stunned';
  avatarUrl: string;
  emotions?: Record<EmotionType, string>;
  color: string;
  spells?: string[];
  weapons?: { name: string; damage: string; range: number }[];
}

export interface RayTarget {
  target_id: string;
  dice_seed: string;
}

export interface FallbackRule {
  trigger: string;
  redirect_all_to?: string;
  action_override?: string;
  description?: string;
}

export interface ReactionRule {
  trigger: string;
  spell?: string;
  action?: string;
  description?: string;
}

export interface PlayerActionIntent {
  type: 'attack' | 'cast_spell' | 'dash' | 'dodge' | 'item' | 'help';
  spell_name?: string;
  slot_level?: number;
  weapon_name?: string;
  target_id?: string;
  rays?: RayTarget[];
  target_pos?: [number, number];
  dice_seed?: string;
}

export interface PlayerMovementIntent {
  path: [number, number][];
  dash: boolean;
}

export interface PlayerIntentPayload {
  actor_id: string;
  round: number;
  movement: PlayerMovementIntent;
  action: PlayerActionIntent;
  fallback_rules?: FallbackRule[];
  reaction?: ReactionRule;
}

export interface RoleplayPayload {
  speech: string;
  internal_thought: string;
  action_flavor: string;
  avatar_emotion_cid: string; // e.g. "cid:avatar_furious"
  audio_voice_cid?: string;
}

export interface MasterStatePayload {
  round: number;
  combat_status: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled';
  entities: {
    id: string;
    hp: number;
    max_hp: number;
    pos: [number, number];
    status?: string;
  }[];
  mechanical_log: string[];
  initiative_order?: string[];
}

export interface ArtMetaPayload {
  artist_credit: string;
  caption: string;
  book_placement: BookPlacement;
  link_to_scene_id: string;
  chapter_title?: string;
  tags?: string[];
}

export interface EmlAttachment {
  filename: string;
  contentType: string;
  contentId?: string; // e.g. "avatar_furious", "voice_line"
  content: string; // text or base64 data url
  isBinary?: boolean;
}

export interface EmlMessage {
  id: string; // Message-ID
  from: string;
  to: string;
  subject: string;
  inReplyTo?: string;
  date: string;
  round: number;
  actorId?: string;
  phase?: 'Intent' | 'Resolution' | 'Art' | 'General';
  targetRound?: number;
  assetType?: 'Illustration' | 'Map' | 'Token' | 'Handout';
  rawEml: string;
  // Parsed components
  intentJson?: PlayerIntentPayload;
  roleplayJson?: RoleplayPayload;
  stateJson?: MasterStatePayload;
  masterProseMarkdown?: string;
  artMetaJson?: ArtMetaPayload;
  attachments: EmlAttachment[];
  previewHtml?: string;
}

export interface BestiaryEntry {
  id: string;
  name: string;
  type: string;
  challengeRating: string;
  ac: number;
  hp: number;
  speed: string;
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  abilities: { name: string; desc: string }[];
  actions: { name: string; desc: string }[];
  lore: string;
  illustrationUrl: string;
  artistCredit: string;
}

export interface GrimoireItem {
  id: string;
  name: string;
  itemType: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact';
  attunement: boolean;
  description: string;
  properties: string[];
  history: string;
  illustrationUrl: string;
}

export interface AudioTrackSegment {
  id: string;
  round: number;
  type: 'intro_music' | 'master_narration' | 'character_speech' | 'sound_fx' | 'ambient_dungeon' | 'outro_music' | 'dungeon_intro';
  speakerName: string;
  speakerRole: 'DM' | 'Player' | 'System';
  title: string;
  durationSec: number;
  audioUrl?: string; // synthetic audio or recorded blob url
  waveformSeed: number;
  sfxType?: 'fire_spell' | 'sword_slash' | 'shield_block' | 'goblin_grunt' | 'dungeon_intro';
  textSnippet?: string;
}

export interface Chapter {
  round: number;
  title: string;
  subtitle: string;
  prose: string;
  prosePage2?: string;
  roleplayQuotes: {
    actorName: string;
    actorClass: string;
    speech: string;
    thought: string;
    flavor: string;
    emotion: EmotionType;
  }[];
  battleLogSummary: string[];
  artworks: {
    title: string;
    artist: string;
    url: string;
    placement: BookPlacement;
    caption: string;
  }[];
  mapSvg?: string;
  masterNotes?: string;
  lootReward?: {
    xp: number;
    coins?: string;
    items?: string[];
  };
  loreSnippet?: {
    title: string;
    text: string;
  };
}
