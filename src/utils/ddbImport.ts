/**
 * Импорт листов персонажей из D&D Beyond (JSON) и любых дружелюбных
 * плоских форматов. DDB не публикует стабильную схему экспорта, поэтому
 * парсер толерантный: он пробует несколько известных раскладок полей
 * (полные пути DDB, плоский {name, level, hp...}, русские шапки) и честно
 * предупреждает, что пришлось выдумывать.
 *
 * Производные значения (модификаторы, бонус мастерства, XP до уровня,
 * ячейки заклинаний) считаются по правилам D&D 5e, а не копируются.
 */

import { CharacterSheet } from '../types/partySheet';

export interface DdbImportResult {
  sheet: CharacterSheet;
  warnings: string[];
}

/** Суммарный опыт для достижения уровня (D&D 5e, индекс = уровень). */
const XP_TABLE = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000,
  100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

/** Полные заклинатели — стандартная таблица ячеек (уровни 1-4 показаны в UI). */
const FULL_CASTERS = ['wizard', 'cleric', 'druid', 'bard', 'sorcerer', 'волшебник', 'жрец', 'друид', 'бард', 'чародей'];

/** Ячейки полного заклинателя [уровень ячейки 1..4][уровень персонажа 1..20]. */
const SLOTS_TABLE: number[][] = [
  [2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [0, 0, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [0, 0, 0, 0, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4],
];

const DDB_ABILITY_IDS: Record<number, string> = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' };

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

type AnyRec = Record<string, unknown>;

const isObj = (v: unknown): v is AnyRec => !!v && typeof v === 'object' && !Array.isArray(v);

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function pick(root: AnyRec, path: string | string[]): unknown {
  const paths = Array.isArray(path) ? path : [path];
  for (const p of paths) {
    let cur: unknown = root;
    let ok = true;
    for (const key of p.split('.')) {
      if (!isObj(cur) || !(key in cur)) { ok = false; break; }
      cur = (cur as AnyRec)[key];
    }
    if (ok && cur !== null && cur !== undefined && cur !== '') return cur;
  }
  return null;
}

/** Характеристики: DDB-стат [{id,value}], abilityScores или плоские str/dex/... */
function readAbilities(root: AnyRec): { str: number; dex: number; con: number; int: number; wis: number; cha: number } | null {
  const flat = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  let found = false;

  const stats = pick(root, 'stats') ?? pick(root, 'character.stats') ?? pick(root, 'abilityScores');
  if (Array.isArray(stats)) {
    for (const s of stats) {
      if (!isObj(s)) continue;
      const id = num(s.id) ?? num(s.abilityId);
      const val = num(s.value) ?? num(s.score);
      const key = id !== null ? DDB_ABILITY_IDS[id] : null;
      if (key && val !== null) { (flat as AnyRec)[key] = val; found = true; }
    }
  }
  const named = (pick(root, 'abilities') ?? pick(root, 'character.abilities')) as AnyRec | null;
  if (isObj(named)) {
    for (const k of Object.keys(flat) as (keyof typeof flat)[]) {
      const v = num(named[k]);
      if (v !== null) { flat[k] = v; found = true; }
    }
  }
  for (const k of Object.keys(flat) as (keyof typeof flat)[]) {
    const v = num(pick(root, k)) ?? num(pick(root, `abilities.${k}`));
    if (v !== null) { flat[k] = v; found = true; }
  }
  return found ? flat : null;
}

function readClassAndLevel(root: AnyRec): { characterClass: string; level: number } | null {
  const classes = pick(root, 'classes') ?? pick(root, 'character.classes');
  if (Array.isArray(classes) && classes.length > 0) {
    const first = classes[0];
    const name = str(pick(first as AnyRec, 'definition.name')) ?? str((first as AnyRec).name);
    const level = num(pick(first as AnyRec, 'level')) ?? num(pick(first as AnyRec, 'definition.level'));
    if (name || level !== null) {
      return { characterClass: name ?? 'Приключенец', level: level ?? 1 };
    }
  }
  const name = str(pick(root, 'characterClass')) ?? str(pick(root, 'class')) ?? str(pick(root, 'klass'));
  const level = num(pick(root, 'level')) ?? num(pick(root, 'уровень'));
  if (name || level !== null) return { characterClass: name ?? 'Приключенец', level: level ?? 1 };
  return null;
}

function readName(root: AnyRec): string | null {
  return str(pick(root, 'name')) ?? str(pick(root, 'character.name')) ?? str(pick(root, 'имя'));
}

function readRace(root: AnyRec): string {
  const race = pick(root, 'race') ?? pick(root, 'character.race') ?? pick(root, 'раса');
  if (typeof race === 'string') return race;
  if (isObj(race)) return str(race.fullName) ?? str(race.name) ?? str(race.baseRaceName) ?? '—';
  return '—';
}

function readSpeed(root: AnyRec): number {
  const s = pick(root, 'speed') ?? pick(root, 'character.speed');
  if (typeof s === 'number') return s;
  if (typeof s === 'string' && Number.isFinite(Number(s))) return Number(s);
  if (isObj(s)) return num(s.walk) ?? num(s.value) ?? 30;
  return 30;
}

function readHp(root: AnyRec): number | null {
  const direct = num(pick(root, 'hp')) ?? num(pick(root, 'maxHp')) ?? num(pick(root, 'hitPoints'));
  if (direct !== null) return direct;
  // DDB: base + bonus + level-up, с приоритетом override
  const override = num(pick(root, 'overrideHitPoints')) ?? num(pick(root, 'character.overrideHitPoints'));
  if (override !== null) return override;
  const base = num(pick(root, 'baseHitPoints')) ?? num(pick(root, 'character.baseHitPoints')) ?? 0;
  const bonus = num(pick(root, 'bonusHitPoints')) ?? num(pick(root, 'character.bonusHitPoints')) ?? 0;
  const lvlUp = num(pick(root, 'levelUpHitPoints')) ?? 0;
  const removed = num(pick(root, 'removedHitPoints')) ?? 0;
  if (base + bonus + lvlUp > 0) return base + bonus + lvlUp - removed;
  return null;
}

export function parseDdbSheet(raw: string, id?: string): DdbImportResult {
  const warnings: string[] = [];
  let root: AnyRec;
  try {
    root = JSON.parse(raw) as AnyRec;
  } catch {
    throw new Error('Это не JSON: вставьте экспорт листа из D&D Beyond или плоский JSON {name, level, hp, str, ...}');
  }
  if (!isObj(root) || Array.isArray(root)) {
    throw new Error('Ожидался JSON-объект листа, а не массив или скаляр');
  }

  const name = readName(root);
  if (!name) throw new Error('В листе нет имени: поле "name" обязательно');

  const cls = readClassAndLevel(root);
  const level = Math.min(20, Math.max(1, cls?.level ?? 1));
  if (cls?.level === undefined) warnings.push('Уровень не найден — принят 1');
  if (!cls?.characterClass) warnings.push('Класс не найден — записан «Приключенец»');

  const abilities = readAbilities(root);
  if (!abilities) {
    warnings.push('Характеристики не найдены — записаны по 10');
  }

  const hp = readHp(root);
  if (hp === null) warnings.push('HP не найдено — принято 8');
  const ac = num(pick(root, 'ac')) ?? num(pick(root, 'armorClass')) ?? num(pick(root, 'character.armorClass'));
  if (ac === null) warnings.push('AC не найден — принят 10');
  const xp = num(pick(root, 'xp')) ?? num(pick(root, 'currentXp')) ?? num(pick(root, 'опыт')) ?? XP_TABLE[level];
  if (num(pick(root, 'xp')) === null && num(pick(root, 'currentXp')) === null) {
    warnings.push(`XP не найден — выставлен ${XP_TABLE[level]} (минимум для уровня ${level})`);
  }

  const characterClass = cls?.characterClass ?? 'Приключенец';
  const caster = FULL_CASTERS.some(c => characterClass.toLowerCase().includes(c));
  const slots = caster ? SLOTS_TABLE.map(row => row[level - 1]) : [0, 0, 0, 0];
  if (!caster && !['fighter', 'rogue', 'barbarian', 'monk', 'воин', 'плут', 'варвар', 'монах'].some(c => characterClass.toLowerCase().includes(c))) {
    warnings.push(`Класс «${characterClass}» неизвестен — ячейки заклинаний не выданы`);
  }

  const stats = abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

  const sheet: CharacterSheet = {
    id: id ?? `import_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name,
    playerOwner: str(pick(root, 'playerOwner')) ?? str(pick(root, 'player')) ?? 'Импорт D&D Beyond',
    race: readRace(root),
    characterClass,
    level,
    xp,
    nextLevelXp: XP_TABLE[Math.min(20, level + 1)],
    hp: hp ?? 8,
    maxHp: hp ?? 8,
    tempHp: 0,
    ac: ac ?? 10,
    speed: readSpeed(root),
    initiativeBonus: abilityMod(stats.dex),
    proficiencyBonus: proficiencyBonus(level),
    stats,
    savingThrows: [],
    skills: [],
    spellSlots: {
      level1: { total: slots[0], used: 0 },
      level2: { total: slots[1], used: 0 },
      level3: { total: slots[2], used: 0 },
      level4: { total: slots[3], used: 0 },
    },
    spells: [],
    inventory: [],
    coins: { gp: 0, sp: 0, cp: 0, pp: 0 },
    avatarUrl: str(pick(root, 'avatarUrl')) ?? str(pick(root, 'avatar')) ?? '',
    bio: '',
    personalityTraits: '',
    ideals: '',
    flaws: '',
  };

  if (sheet.spells.length === 0) warnings.push('Заклинания и инвентарь из экспорта не переносятся — заполните вручную');

  return { sheet, warnings };
}
