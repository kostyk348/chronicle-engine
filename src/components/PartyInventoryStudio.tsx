import React, { useState } from 'react';
import {
  CharacterSheet,
  SpellItem,
  InventoryItem,
} from '../types/partySheet';
import {
  Shield,
  Heart,
  Zap,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Sword,
  Scroll,
  Coins,
  Package,
  Wand2,
  BookOpen,
  Award,
  Users,
  ChevronRight,
  RefreshCw,
  Gift,
  Flame,
  ArrowRight,
  Crosshair,
  Feather,
  Info,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSfx } from '../utils/audioSynthesizer';

interface PartyInventoryStudioProps {
  partyMembers: CharacterSheet[];
  onUpdatePartyMember: (updated: CharacterSheet) => void;
  onAddPartyMember: (newMember: CharacterSheet) => void;
  onDeletePartyMember?: (memberId: string) => void;
  currentRound: number;
  onLogAction?: (log: string) => void;
}

export const PartyInventoryStudio: React.FC<PartyInventoryStudioProps> = ({
  partyMembers,
  onUpdatePartyMember,
  onAddPartyMember,
  onDeletePartyMember,
  currentRound,
  onLogAction,
}) => {
  const [selectedHeroId, setSelectedHeroId] = useState<string>(partyMembers[0]?.id || 'elena_01');
  const [activeSubTab, setActiveSubTab] = useState<'sheet' | 'inventory' | 'spellbook' | 'loot_distributor'>('sheet');

  // Modals
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState<boolean>(false);
  const [isAddSpellModalOpen, setIsAddSpellModalOpen] = useState<boolean>(false);
  const [isCreateHeroModalOpen, setIsCreateHeroModalOpen] = useState<boolean>(false);

  // New Item Form
  const [newItem, setNewItem] = useState<{
    name: string;
    type: InventoryItem['type'];
    rarity: InventoryItem['rarity'];
    quantity: number;
    weight: number;
    damage: string;
    acBonus: number;
    description: string;
  }>({
    name: '',
    type: 'Оружие',
    rarity: 'Common',
    quantity: 1,
    weight: 2,
    damage: '1d8',
    acBonus: 0,
    description: '',
  });

  // New Spell Form
  const [newSpell, setNewSpell] = useState<{
    name: string;
    level: number;
    school: SpellItem['school'];
    castingTime: string;
    range: string;
    components: string;
    duration: string;
    damageOrEffect: string;
    description: string;
  }>({
    name: '',
    level: 1,
    school: 'Воплощение',
    castingTime: '1 действие',
    range: '60 футов',
    components: 'В, С',
    duration: 'Мгновенная',
    damageOrEffect: '2d8 урона',
    description: '',
  });

  // New Hero Form
  const [newHero, setNewHero] = useState<{
    name: string;
    playerOwner: string;
    race: string;
    characterClass: string;
    level: number;
    hp: number;
    maxHp: number;
    ac: number;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    bio: string;
  }>({
    name: '',
    playerOwner: 'Игрок',
    race: 'Человек',
    characterClass: 'Плут (Вор)',
    level: 3,
    hp: 21,
    maxHp: 21,
    ac: 14,
    str: 10,
    dex: 16,
    con: 12,
    int: 13,
    wis: 12,
    cha: 14,
    bio: 'Скрытный исследователь подземелий, эксперт по замкам и ловушкам.',
  });

  // Loot & XP Distributor State
  const [lootXpAmount, setLootXpAmount] = useState<number>(300);
  const [lootGoldAmount, setLootGoldAmount] = useState<number>(50);
  const [lootSilverAmount, setLootSilverAmount] = useState<number>(120);
  const [lootCustomItemName, setLootCustomItemName] = useState<string>('Кольцо защиты от ядов');
  const [lootCustomItemType, setLootCustomItemType] = useState<InventoryItem['type']>('Кольцо');
  const [lootCustomItemRarity, setLootCustomItemRarity] = useState<InventoryItem['rarity']>('Rare');
  const [lootRecipientId, setLootRecipientId] = useState<string>('all');

  const selectedHero = partyMembers.find(h => h.id === selectedHeroId) || partyMembers[0];

  const getStatModifier = (val: number): string => {
    const mod = Math.floor((val - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const getRarityBadgeColor = (rarity: InventoryItem['rarity']): string => {
    switch (rarity) {
      case 'Common':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'Uncommon':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60';
      case 'Rare':
        return 'bg-blue-950/60 text-blue-300 border-blue-700/60';
      case 'Very Rare':
        return 'bg-purple-950/60 text-purple-300 border-purple-700/60';
      case 'Legendary':
        return 'bg-amber-950/60 text-amber-300 border-amber-600/80';
      case 'Artifact':
        return 'bg-red-950/60 text-red-300 border-red-600/80';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  // Adjust HP
  const handleModifyHp = (delta: number) => {
    if (!selectedHero) return;
    const newHp = Math.max(0, Math.min(selectedHero.maxHp, selectedHero.hp + delta));
    onUpdatePartyMember({
      ...selectedHero,
      hp: newHp,
    });
    playSfx(delta > 0 ? 'shield_block' : 'sword_slash');
  };

  // Rest & Recover Slots & HP
  const handleLongRest = () => {
    if (!selectedHero) return;
    onUpdatePartyMember({
      ...selectedHero,
      hp: selectedHero.maxHp,
      tempHp: 0,
      spellSlots: {
        level1: { ...selectedHero.spellSlots.level1, used: 0 },
        level2: { ...selectedHero.spellSlots.level2, used: 0 },
        level3: { ...selectedHero.spellSlots.level3, used: 0 },
        level4: { ...selectedHero.spellSlots.level4, used: 0 },
      },
    });
    playSfx('fire_spell');
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#d4af37'],
    });
  };

  // Toggle Spell Slot
  const handleToggleSpellSlot = (level: 'level1' | 'level2' | 'level3' | 'level4', index: number) => {
    if (!selectedHero) return;
    const currentSlots = selectedHero.spellSlots[level];
    const newUsed = index < currentSlots.used ? currentSlots.used - 1 : currentSlots.used + 1;
    onUpdatePartyMember({
      ...selectedHero,
      spellSlots: {
        ...selectedHero.spellSlots,
        [level]: {
          ...currentSlots,
          used: Math.max(0, Math.min(currentSlots.total, newUsed)),
        },
      },
    });
    playSfx('dice_roll');
  };

  // Cast Spell
  const handleCastSpell = (spell: SpellItem) => {
    if (!selectedHero) return;
    if (spell.level > 0) {
      const slotKey = `level${spell.level}` as 'level1' | 'level2' | 'level3' | 'level4';
      const slot = selectedHero.spellSlots[slotKey];
      if (slot && slot.used >= slot.total) {
        alert(`У ${selectedHero.name} закончились ячейки ${spell.level}-го круга!`);
        return;
      }
      if (slot) {
        onUpdatePartyMember({
          ...selectedHero,
          spellSlots: {
            ...selectedHero.spellSlots,
            [slotKey]: {
              ...slot,
              used: slot.used + 1,
            },
          },
        });
      }
    }
    playSfx(spell.school === 'Воплощение' ? 'fire_spell' : 'shield_block');
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.6 },
      colors: ['#6366f1', '#a855f7', '#d4af37'],
    });
  };

  // Add Item to Hero
  const handleSaveNewItem = () => {
    if (!selectedHero || !newItem.name.trim()) return;
    const created: InventoryItem = {
      id: `item_${Date.now()}`,
      name: newItem.name.trim(),
      type: newItem.type,
      rarity: newItem.rarity,
      quantity: Number(newItem.quantity) || 1,
      weight: Number(newItem.weight) || 1,
      damage: newItem.damage,
      acBonus: Number(newItem.acBonus) || 0,
      description: newItem.description || 'Особый предмет партии.',
      equipped: false,
    };

    onUpdatePartyMember({
      ...selectedHero,
      inventory: [...selectedHero.inventory, created],
    });
    setIsAddItemModalOpen(false);
    setNewItem({
      name: '',
      type: 'Оружие',
      rarity: 'Common',
      quantity: 1,
      weight: 2,
      damage: '1d8',
      acBonus: 0,
      description: '',
    });
    playSfx('shield_block');
  };

  // Add Spell to Hero
  const handleSaveNewSpell = () => {
    if (!selectedHero || !newSpell.name.trim()) return;
    const created: SpellItem = {
      id: `spell_${Date.now()}`,
      name: newSpell.name.trim(),
      level: Number(newSpell.level) || 0,
      school: newSpell.school,
      castingTime: newSpell.castingTime,
      range: newSpell.range,
      components: newSpell.components,
      duration: newSpell.duration,
      damageOrEffect: newSpell.damageOrEffect,
      description: newSpell.description || 'Магическое плетение арканы.',
      isPrepared: true,
    };

    onUpdatePartyMember({
      ...selectedHero,
      spells: [...selectedHero.spells, created],
    });
    setIsAddSpellModalOpen(false);
    setNewSpell({
      name: '',
      level: 1,
      school: 'Воплощение',
      castingTime: '1 действие',
      range: '60 футов',
      components: 'В, С',
      duration: 'Мгновенная',
      damageOrEffect: '2d8 урона',
      description: '',
    });
    playSfx('fire_spell');
  };

  // Toggle Equip Item
  const handleToggleEquip = (itemId: string) => {
    if (!selectedHero) return;
    onUpdatePartyMember({
      ...selectedHero,
      inventory: selectedHero.inventory.map(item =>
        item.id === itemId ? { ...item, equipped: !item.equipped } : item
      ),
    });
    playSfx('shield_block');
  };

  // Use Item (e.g. potion)
  const handleUseItem = (item: InventoryItem) => {
    if (!selectedHero) return;
    if (item.type === 'Зелье') {
      const healAmount = 10;
      const newHp = Math.min(selectedHero.maxHp, selectedHero.hp + healAmount);
      const updatedInv = selectedHero.inventory
        .map(i => (i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter(i => i.quantity > 0);

      onUpdatePartyMember({
        ...selectedHero,
        hp: newHp,
        inventory: updatedInv,
      });
      playSfx('shield_block');
      confetti({
        particleCount: 35,
        spread: 45,
        origin: { y: 0.7 },
        colors: ['#22c55e', '#ffffff'],
      });
    } else {
      playSfx('dice_roll');
    }
  };

  // Delete Item
  const handleDeleteItem = (itemId: string) => {
    if (!selectedHero) return;
    onUpdatePartyMember({
      ...selectedHero,
      inventory: selectedHero.inventory.filter(i => i.id !== itemId),
    });
    playSfx('sword_slash');
  };

  // Distribute Loot & XP
  const handleDistributeLoot = () => {
    if (partyMembers.length === 0) return;

    if (lootRecipientId === 'all') {
      // Distribute XP evenly
      const xpPerPlayer = Math.floor(lootXpAmount / partyMembers.length);
      const gpPerPlayer = Math.floor(lootGoldAmount / partyMembers.length);
      const spPerPlayer = Math.floor(lootSilverAmount / partyMembers.length);

      partyMembers.forEach(hero => {
        const newXp = hero.xp + xpPerPlayer;
        let newLevel = hero.level;
        if (newXp >= 2700 && hero.level < 4) newLevel = 4;
        if (newXp >= 6500 && hero.level < 5) newLevel = 5;

        const updated: CharacterSheet = {
          ...hero,
          xp: newXp,
          level: newLevel,
          coins: {
            ...hero.coins,
            gp: hero.coins.gp + gpPerPlayer,
            sp: hero.coins.sp + spPerPlayer,
          },
        };
        onUpdatePartyMember(updated);
      });
    } else {
      // Give to specific hero
      const target = partyMembers.find(h => h.id === lootRecipientId);
      if (target) {
        const newXp = target.xp + lootXpAmount;
        let newLevel = target.level;
        if (newXp >= 2700 && target.level < 4) newLevel = 4;

        const newItemObj: InventoryItem | null = lootCustomItemName.trim()
          ? {
              id: `loot_${Date.now()}`,
              name: lootCustomItemName.trim(),
              type: lootCustomItemType,
              rarity: lootCustomItemRarity,
              quantity: 1,
              weight: 2,
              description: 'Трофей, полученный по итогам битвы раунда.',
            }
          : null;

        const updated: CharacterSheet = {
          ...target,
          xp: newXp,
          level: newLevel,
          coins: {
            ...target.coins,
            gp: target.coins.gp + lootGoldAmount,
            sp: target.coins.sp + lootSilverAmount,
          },
          inventory: newItemObj ? [...target.inventory, newItemObj] : target.inventory,
        };
        onUpdatePartyMember(updated);
      }
    }

    playSfx('dungeon_intro');
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.5 },
      colors: ['#d4af37', '#f59e0b', '#22c55e'],
    });
  };

  // Create New Hero
  const handleSaveNewHero = () => {
    if (!newHero.name.trim()) return;
    const created: CharacterSheet = {
      id: `hero_${Date.now()}`,
      name: newHero.name.trim(),
      playerOwner: newHero.playerOwner,
      race: newHero.race,
      characterClass: newHero.characterClass,
      level: newHero.level,
      xp: 900,
      nextLevelXp: 2700,
      hp: newHero.hp,
      maxHp: newHero.maxHp,
      tempHp: 0,
      ac: newHero.ac,
      speed: 30,
      initiativeBonus: Math.floor((newHero.dex - 10) / 2),
      proficiencyBonus: 2,
      stats: {
        str: newHero.str,
        dex: newHero.dex,
        con: newHero.con,
        int: newHero.int,
        wis: newHero.wis,
        cha: newHero.cha,
      },
      savingThrows: ['dex', 'int'],
      skills: ['Скрытность', 'Ловкость рук', 'Внимательность'],
      spellSlots: {
        level1: { total: 0, used: 0 },
        level2: { total: 0, used: 0 },
        level3: { total: 0, used: 0 },
        level4: { total: 0, used: 0 },
      },
      spells: [],
      inventory: [
        {
          id: `item_starter_1`,
          name: 'Короткий меч воровской гильдии',
          type: 'Оружие',
          rarity: 'Common',
          quantity: 1,
          weight: 2,
          equipped: true,
          damage: '1d6 колющий',
          description: 'Острый сбалансированный клинок.',
        },
        {
          id: `item_starter_2`,
          name: 'Воровские инструменты',
          type: 'Инструмент',
          rarity: 'Common',
          quantity: 1,
          weight: 1,
          equipped: true,
          description: 'Набор отмычек, щупов и зеркал.',
        },
      ],
      coins: {
        gp: 25,
        sp: 50,
        cp: 80,
        pp: 0,
      },
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80',
      bio: newHero.bio,
      personalityTraits: 'Всегда проверяет пути отхода перед входом в комнату.',
      ideals: 'Свобода действий.',
      flaws: 'Не может пройти мимо блестящих безделушек.',
    };

    onAddPartyMember(created);
    setSelectedHeroId(created.id);
    setIsCreateHeroModalOpen(false);
    playSfx('dungeon_intro');
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#f4f4f5]">
      {/* Top Banner & Hero Selector */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#27272a] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-[#d4af37]/20 to-[#996515]/20 border border-[#d4af37]/40 rounded-xl text-[#d4af37]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#f4f4f5] flex items-center gap-2">
                <span>Листы Персонажей и Инвентарь Партии</span>
                <span className="text-xs px-2 py-0.5 bg-[#27272a] text-[#d4af37] font-mono rounded border border-[#d4af37]/30">
                  D&D 5e SRD
                </span>
              </h2>
              <p className="text-xs text-[#a1a1aa]">
                Управление характеристиками, ячейками магии, заклинаниями, оружием и трофеями каждого игрока
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsCreateHeroModalOpen(true);
                playSfx('dice_roll');
              }}
              className="px-3.5 py-2 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>+ Создать нового героя</span>
            </button>
          </div>
        </div>

        {/* Hero Selector Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {partyMembers.map(hero => {
            const isSelected = hero.id === selectedHero?.id;
            return (
              <div
                key={hero.id}
                onClick={() => {
                  setSelectedHeroId(hero.id);
                  playSfx('dice_roll');
                }}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-center gap-3 relative overflow-hidden ${
                  isSelected
                    ? 'bg-[#27272a] border-[#d4af37] shadow-lg shadow-[#d4af37]/10'
                    : 'bg-[#121212] border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b]'
                }`}
              >
                <img
                  src={hero.avatarUrl}
                  alt={hero.name}
                  className="w-12 h-12 rounded-xl object-cover border border-[#27272a] flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#f4f4f5] truncate">{hero.name}</h3>
                    <span className="text-[10px] font-mono text-[#d4af37] font-bold">Ур. {hero.level}</span>
                  </div>
                  <div className="text-[11px] text-[#a1a1aa] truncate">{hero.characterClass}</div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#71717a] mt-1">
                    <span className="text-emerald-400 font-bold">HP {hero.hp}/{hero.maxHp}</span>
                    <span>•</span>
                    <span className="text-amber-400">AC {hero.ac}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Hero Workspace */}
      {selectedHero && (
        <div className="space-y-6">
          {/* Subtabs Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272a] pb-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveSubTab('sheet')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  activeSubTab === 'sheet'
                    ? 'bg-[#d4af37] text-[#0c0c0c] font-black shadow'
                    : 'bg-[#18181b] text-[#a1a1aa] hover:text-[#f4f4f5]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Лист героя (Stats & Bio)</span>
              </button>
              <button
                onClick={() => setActiveSubTab('inventory')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  activeSubTab === 'inventory'
                    ? 'bg-[#d4af37] text-[#0c0c0c] font-black shadow'
                    : 'bg-[#18181b] text-[#a1a1aa] hover:text-[#f4f4f5]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Инвентарь & Экипировка ({selectedHero.inventory.length})</span>
              </button>
              <button
                onClick={() => setActiveSubTab('spellbook')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  activeSubTab === 'spellbook'
                    ? 'bg-[#d4af37] text-[#0c0c0c] font-black shadow'
                    : 'bg-[#18181b] text-[#a1a1aa] hover:text-[#f4f4f5]'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Книга заклинаний ({selectedHero.spells.length})</span>
              </button>
              <button
                onClick={() => setActiveSubTab('loot_distributor')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  activeSubTab === 'loot_distributor'
                    ? 'bg-[#d4af37] text-[#0c0c0c] font-black shadow'
                    : 'bg-[#18181b] text-[#a1a1aa] hover:text-[#f4f4f5]'
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                <span>Раздатчик наград и опыта (Loot & XP)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleLongRest}
                className="px-3 py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                title="Восстановить все хиты и ячейки заклинаний"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Долгий отдых (Long Rest)</span>
              </button>
            </div>
          </div>

          {/* TAB 1: CHARACTER SHEET & STATS */}
          {activeSubTab === 'sheet' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Avatar, HP, Combat Vitals */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-5 space-y-5 shadow-lg">
                <div className="flex gap-4 items-start">
                  <img
                    src={selectedHero.avatarUrl}
                    alt={selectedHero.name}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-[#d4af37]/60 shadow-md"
                  />
                  <div>
                    <h3 className="text-lg font-bold text-[#f4f4f5] leading-tight">{selectedHero.name}</h3>
                    <div className="text-xs text-[#d4af37] font-medium">{selectedHero.characterClass}</div>
                    <div className="text-xs text-[#a1a1aa]">{selectedHero.race} • Владелец: {selectedHero.playerOwner}</div>
                    <div className="mt-2 text-[10px] font-mono bg-[#27272a] px-2 py-0.5 rounded text-[#a1a1aa] inline-block">
                      Опыт: {selectedHero.xp} / {selectedHero.nextLevelXp} XP
                    </div>
                  </div>
                </div>

                {/* HP Tracker */}
                <div className="bg-[#121212] p-4 rounded-xl border border-[#27272a] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <Heart className="w-4 h-4 fill-emerald-400/20" />
                      Хиты (HP):
                    </span>
                    <span className="font-mono text-base font-bold text-[#f4f4f5]">
                      {selectedHero.hp} / {selectedHero.maxHp}
                      {selectedHero.tempHp > 0 && <span className="text-blue-400 text-xs ml-1">(+{selectedHero.tempHp})</span>}
                    </span>
                  </div>

                  {/* HP Progress Bar */}
                  <div className="w-full bg-[#27272a] h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        selectedHero.hp / selectedHero.maxHp > 0.5
                          ? 'bg-emerald-500'
                          : selectedHero.hp / selectedHero.maxHp > 0.25
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, (selectedHero.hp / selectedHero.maxHp) * 100)}%` }}
                    />
                  </div>

                  {/* HP Quick Modify Buttons */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => handleModifyHp(-5)}
                      className="flex-1 py-1 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/40 rounded-lg text-xs font-mono font-bold"
                    >
                      -5 HP
                    </button>
                    <button
                      onClick={() => handleModifyHp(-1)}
                      className="flex-1 py-1 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/40 rounded-lg text-xs font-mono font-bold"
                    >
                      -1 HP
                    </button>
                    <button
                      onClick={() => handleModifyHp(1)}
                      className="flex-1 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 rounded-lg text-xs font-mono font-bold"
                    >
                      +1 HP
                    </button>
                    <button
                      onClick={() => handleModifyHp(5)}
                      className="flex-1 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 rounded-lg text-xs font-mono font-bold"
                    >
                      +5 HP
                    </button>
                  </div>
                </div>

                {/* Vitals Grid (AC, Speed, Initiative, Proficiency) */}
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  <div className="bg-[#121212] p-2.5 rounded-xl border border-[#27272a]">
                    <div className="text-[10px] text-[#a1a1aa]">КД (AC)</div>
                    <div className="text-base font-bold text-amber-400">{selectedHero.ac}</div>
                  </div>
                  <div className="bg-[#121212] p-2.5 rounded-xl border border-[#27272a]">
                    <div className="text-[10px] text-[#a1a1aa]">Скорость</div>
                    <div className="text-base font-bold text-[#f4f4f5]">{selectedHero.speed} фт</div>
                  </div>
                  <div className="bg-[#121212] p-2.5 rounded-xl border border-[#27272a]">
                    <div className="text-[10px] text-[#a1a1aa]">Инициатива</div>
                    <div className="text-base font-bold text-[#f4f4f5]">+{selectedHero.initiativeBonus}</div>
                  </div>
                  <div className="bg-[#121212] p-2.5 rounded-xl border border-[#27272a]">
                    <div className="text-[10px] text-[#a1a1aa]">Бонус маст.</div>
                    <div className="text-base font-bold text-[#d4af37]">+{selectedHero.proficiencyBonus}</div>
                  </div>
                </div>

                {/* Wallet Strip */}
                <div className="bg-[#121212] p-3 rounded-xl border border-[#27272a] flex items-center justify-between text-xs font-mono">
                  <div className="text-[#a1a1aa] flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-[#d4af37]" />
                    <span>Кошелёк:</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-bold">{selectedHero.coins.gp} зм</span>
                    <span className="text-zinc-300 font-bold">{selectedHero.coins.sp} см</span>
                    <span className="text-orange-400 font-bold">{selectedHero.coins.cp} мм</span>
                  </div>
                </div>
              </div>

              {/* Middle Column: D&D 5e Ability Scores & Skills */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-5 space-y-4 shadow-lg">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#27272a] pb-2">
                  Основные характеристики (Ability Scores)
                </h4>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  {[
                    { key: 'str', label: 'СИЛА (STR)', val: selectedHero.stats.str },
                    { key: 'dex', label: 'ЛОВК (DEX)', val: selectedHero.stats.dex },
                    { key: 'con', label: 'ТЕЛ (CON)', val: selectedHero.stats.con },
                    { key: 'int', label: 'ИНТ (INT)', val: selectedHero.stats.int },
                    { key: 'wis', label: 'МДР (WIS)', val: selectedHero.stats.wis },
                    { key: 'cha', label: 'ХАР (CHA)', val: selectedHero.stats.cha },
                  ].map(stat => (
                    <div
                      key={stat.key}
                      className="bg-[#121212] p-3 rounded-xl border border-[#27272a] hover:border-[#d4af37]/40 transition"
                    >
                      <div className="text-[10px] text-[#a1a1aa] font-bold">{stat.label}</div>
                      <div className="text-xl font-black text-[#f4f4f5] my-0.5">{stat.val}</div>
                      <div className="text-xs font-mono font-bold text-[#d4af37] bg-[#27272a] px-2 py-0.5 rounded-full inline-block">
                        {getStatModifier(stat.val)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <div className="text-xs font-bold text-[#f4f4f5] mb-2 flex items-center justify-between">
                    <span>Спасброски и Навыки:</span>
                    <span className="text-[10px] text-[#a1a1aa]">Владение (+{selectedHero.proficiencyBonus})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedHero.skills.map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2.5 py-1 bg-[#121212] border border-[#27272a] text-[#f4f4f5] rounded-lg text-xs font-medium"
                      >
                        ✓ {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Bio, Ideals, Traits */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-5 space-y-4 shadow-lg">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#27272a] pb-2">
                  Отыгрыш и Биография
                </h4>

                <div className="text-xs leading-relaxed text-[#d4d4d8] bg-[#121212] p-3.5 rounded-xl border border-[#27272a]">
                  <div className="font-bold text-[#f4f4f5] mb-1">Предыстория:</div>
                  <p>{selectedHero.bio}</p>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-[#121212] rounded-xl border border-[#27272a]">
                    <strong className="text-[#d4af37]">Черта характера:</strong> {selectedHero.personalityTraits}
                  </div>
                  <div className="p-2.5 bg-[#121212] rounded-xl border border-[#27272a]">
                    <strong className="text-emerald-400">Идеалы:</strong> {selectedHero.ideals}
                  </div>
                  <div className="p-2.5 bg-[#121212] rounded-xl border border-[#27272a]">
                    <strong className="text-red-400">Слабость:</strong> {selectedHero.flaws}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INVENTORY & EQUIPMENT */}
          {activeSubTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-[#a1a1aa]">
                  Экипировка и снаряжение в рюкзаке ({selectedHero.inventory.length} предметов)
                </div>
                <button
                  onClick={() => {
                    setIsAddItemModalOpen(true);
                    playSfx('dice_roll');
                  }}
                  className="px-3 py-1.5 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Добавить предмет в инвентарь</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedHero.inventory.map(item => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition relative space-y-3 ${
                      item.equipped
                        ? 'bg-[#1e1b18] border-[#d4af37]/80 shadow-md'
                        : 'bg-[#18181b] border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#f4f4f5]">{item.name}</h4>
                          {item.equipped && (
                            <span className="px-1.5 py-0.5 bg-[#d4af37] text-[#0c0c0c] text-[10px] font-bold rounded">
                              Экипировано
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getRarityBadgeColor(
                              item.rarity
                            )}`}
                          >
                            {item.rarity}
                          </span>
                          <span className="text-[11px] text-[#a1a1aa]">{item.type}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 text-[#71717a] hover:text-red-400 transition"
                        title="Удалить предмет"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-[#d4d4d8] leading-relaxed bg-[#121212] p-2.5 rounded-xl border border-[#27272a]">
                      {item.description}
                    </p>

                    {item.damage && (
                      <div className="text-xs font-mono text-amber-400">
                        <strong>Урон:</strong> {item.damage}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-[#27272a] text-xs">
                      <div className="text-[#a1a1aa] font-mono">
                        Кол-во: <strong>{item.quantity}</strong> • Вес: <strong>{item.weight} фнт</strong>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.type === 'Зелье' && (
                          <button
                            onClick={() => handleUseItem(item)}
                            className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded-lg text-xs font-bold transition"
                          >
                            Выпить (+HP)
                          </button>
                        )}

                        <button
                          onClick={() => handleToggleEquip(item.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                            item.equipped
                              ? 'bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa]'
                              : 'bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] border border-[#d4af37]/40'
                          }`}
                        >
                          {item.equipped ? 'Снять' : 'Надеть'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SPELLBOOK & SPELL SLOTS */}
          {activeSubTab === 'spellbook' && (
            <div className="space-y-6">
              {/* Spell Slots Tracker */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#d4af37]" />
                    <h3 className="text-sm font-bold text-[#f4f4f5]">Ячейки заклинаний (Spell Slots)</h3>
                  </div>
                  <span className="text-xs text-[#a1a1aa]">Нажмите на ячейку, чтобы отметить использование</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {(['level1', 'level2', 'level3', 'level4'] as const).map((lvl, idx) => {
                    const slotData = selectedHero.spellSlots[lvl];
                    return (
                      <div key={lvl} className="bg-[#121212] p-3.5 rounded-xl border border-[#27272a] space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#d4af37]">{idx + 1}-й Круг</span>
                          <span className="font-mono text-[#a1a1aa]">
                            {slotData.total - slotData.used} / {slotData.total}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {slotData.total === 0 ? (
                            <span className="text-[11px] text-[#71717a] italic">Нет ячеек</span>
                          ) : (
                            Array.from({ length: slotData.total }).map((_, slotIdx) => {
                              const isUsed = slotIdx < slotData.used;
                              return (
                                <button
                                  key={slotIdx}
                                  onClick={() => handleToggleSpellSlot(lvl, slotIdx)}
                                  className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs transition ${
                                    isUsed
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-600'
                                      : 'bg-indigo-950 border-indigo-500/80 text-indigo-300 shadow-md shadow-indigo-500/20'
                                  }`}
                                  title={isUsed ? 'Потрачена (клик для восстановления)' : 'Доступна (клик для траты)'}
                                >
                                  {isUsed ? '✕' : '⚡'}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Spells List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#f4f4f5]">
                    Изученные и подготовленные заклинания ({selectedHero.spells.length})
                  </h3>
                  <button
                    onClick={() => {
                      setIsAddSpellModalOpen(true);
                      playSfx('dice_roll');
                    }}
                    className="px-3 py-1.5 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Добавить заклинание в книгу</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedHero.spells.map(spell => (
                    <div
                      key={spell.id}
                      className="bg-[#18181b] border border-[#27272a] hover:border-[#6366f1]/50 rounded-2xl p-4 space-y-3 transition shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-[#f4f4f5]">{spell.name}</h4>
                            <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 text-[10px] font-bold rounded border border-indigo-700/60">
                              {spell.level === 0 ? 'Заговор' : `${spell.level} Круг`}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#a1a1aa] mt-0.5">
                            Школа {spell.school} • {spell.castingTime} • {spell.range}
                          </div>
                        </div>

                        <button
                          onClick={() => handleCastSpell(spell)}
                          className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-md"
                          title="Сотворить заклинание (тратит ячейку)"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Каст</span>
                        </button>
                      </div>

                      <p className="text-xs text-[#d4d4d8] leading-relaxed bg-[#121212] p-3 rounded-xl border border-[#27272a]">
                        {spell.description}
                      </p>

                      {spell.damageOrEffect && (
                        <div className="text-xs font-mono text-amber-400 bg-[#27272a]/50 px-2.5 py-1 rounded-lg border border-[#27272a]">
                          <strong>Эффект/Урон:</strong> {spell.damageOrEffect}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOOT & XP DISTRIBUTOR */}
          {activeSubTab === 'loot_distributor' && (
            <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 space-y-6 shadow-xl max-w-3xl">
              <div className="flex items-center gap-3 border-b border-[#27272a] pb-4">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Gift className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#f4f4f5]">Раздатчик трофеев и наград раунда</h3>
                  <p className="text-xs text-[#a1a1aa]">
                    Начисление опыта (XP), золота и магических предметов по итогам битвы в раунде {currentRound}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* XP Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#a1a1aa]">Опыт за раунд (XP):</label>
                  <input
                    type="number"
                    value={lootXpAmount}
                    onChange={e => setLootXpAmount(Number(e.target.value))}
                    className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-sm text-[#f4f4f5] font-mono focus:border-[#d4af37] outline-none"
                  />
                </div>

                {/* Gold / Silver */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-amber-400">Золото (зм):</label>
                    <input
                      type="number"
                      value={lootGoldAmount}
                      onChange={e => setLootGoldAmount(Number(e.target.value))}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-sm text-amber-400 font-mono focus:border-[#d4af37] outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-300">Серебро (см):</label>
                    <input
                      type="number"
                      value={lootSilverAmount}
                      onChange={e => setLootSilverAmount(Number(e.target.value))}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-sm text-zinc-300 font-mono focus:border-[#d4af37] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Item Reward */}
              <div className="space-y-3 bg-[#121212] p-4 rounded-xl border border-[#27272a]">
                <div className="text-xs font-bold text-[#f4f4f5]">Магический трофей / артефакт (опционально):</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Название предмета"
                    value={lootCustomItemName}
                    onChange={e => setLootCustomItemName(e.target.value)}
                    className="sm:col-span-1 bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                  <select
                    value={lootCustomItemType}
                    onChange={e => setLootCustomItemType(e.target.value as any)}
                    className="bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  >
                    <option value="Оружие">Оружие</option>
                    <option value="Доспех">Доспех</option>
                    <option value="Зелье">Зелье</option>
                    <option value="Свиток">Свиток</option>
                    <option value="Кольцо">Кольцо</option>
                    <option value="Инструмент">Инструмент</option>
                    <option value="Сокровище">Сокровище</option>
                  </select>
                  <select
                    value={lootCustomItemRarity}
                    onChange={e => setLootCustomItemRarity(e.target.value as any)}
                    className="bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  >
                    <option value="Common">Common (Обычный)</option>
                    <option value="Uncommon">Uncommon (Необычный)</option>
                    <option value="Rare">Rare (Редкий)</option>
                    <option value="Very Rare">Very Rare (Очень редкий)</option>
                    <option value="Legendary">Legendary (Легендарный)</option>
                    <option value="Artifact">Artifact (Артефакт)</option>
                  </select>
                </div>
              </div>

              {/* Recipient Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#a1a1aa]">Кому начислить награду:</label>
                <select
                  value={lootRecipientId}
                  onChange={e => setLootRecipientId(e.target.value)}
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                >
                  <option value="all">👑 Разделить поровну между всеми участниками партии</option>
                  {partyMembers.map(h => (
                    <option key={h.id} value={h.id}>
                      👤 Выдать лично: {h.name} ({h.characterClass})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleDistributeLoot}
                className="w-full py-3 bg-gradient-to-r from-[#d4af37] to-[#996515] hover:from-[#c49b2f] hover:to-[#885510] text-[#0c0c0c] font-black rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-[#d4af37]/20"
              >
                <Award className="w-4 h-4" />
                <span>Раздать трофеи и начислить опыт (Award XP & Loot)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD INVENTORY ITEM */}
      {isAddItemModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsAddItemModalOpen(false)}
        >
          <div
            className="bg-[#18181b] border-2 border-[#d4af37]/60 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#d4af37]" />
                <span>Добавить предмет герою: {selectedHero?.name}</span>
              </h3>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="text-[#a1a1aa] hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#a1a1aa]">Название предмета:</label>
                <input
                  type="text"
                  placeholder="Например: Меч пламенного языка"
                  value={newItem.name}
                  onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Тип предмета:</label>
                  <select
                    value={newItem.type}
                    onChange={e => setNewItem({ ...newItem, type: e.target.value as any })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  >
                    <option value="Оружие">Оружие</option>
                    <option value="Доспех">Доспех</option>
                    <option value="Зелье">Зелье</option>
                    <option value="Свиток">Свиток</option>
                    <option value="Кольцо">Кольцо</option>
                    <option value="Инструмент">Инструмент</option>
                    <option value="Сокровище">Сокровище</option>
                    <option value="Разное">Разное</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Редкость:</label>
                  <select
                    value={newItem.rarity}
                    onChange={e => setNewItem({ ...newItem, rarity: e.target.value as any })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  >
                    <option value="Common">Common</option>
                    <option value="Uncommon">Uncommon</option>
                    <option value="Rare">Rare</option>
                    <option value="Very Rare">Very Rare</option>
                    <option value="Legendary">Legendary</option>
                    <option value="Artifact">Artifact</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Кол-во:</label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Вес (фнт):</label>
                  <input
                    type="number"
                    value={newItem.weight}
                    onChange={e => setNewItem({ ...newItem, weight: Number(e.target.value) })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Урон / Эффект:</label>
                  <input
                    type="text"
                    placeholder="1d8 + 2"
                    value={newItem.damage}
                    onChange={e => setNewItem({ ...newItem, damage: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#a1a1aa]">Описание и свойства:</label>
                <textarea
                  rows={3}
                  placeholder="Особые свойства, история или магия предмета..."
                  value={newItem.description}
                  onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl p-3 text-[#f4f4f5] focus:border-[#d4af37] outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272a]">
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] rounded-xl text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNewItem}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs"
              >
                Добавить предмет
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD SPELL */}
      {isAddSpellModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsAddSpellModalOpen(false)}
        >
          <div
            className="bg-[#18181b] border-2 border-indigo-500/60 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Добавить заклинание в книгу магии</span>
              </h3>
              <button
                onClick={() => setIsAddSpellModalOpen(false)}
                className="text-[#a1a1aa] hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#a1a1aa]">Название заклинания:</label>
                <input
                  type="text"
                  placeholder="Например: Огненный шар (Fireball)"
                  value={newSpell.name}
                  onChange={e => setNewSpell({ ...newSpell, name: e.target.value })}
                  className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-indigo-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Круг заклинания:</label>
                  <select
                    value={newSpell.level}
                    onChange={e => setNewSpell({ ...newSpell, level: Number(e.target.value) })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-indigo-400 outline-none"
                  >
                    <option value={0}>0 (Заговор / Cantrip)</option>
                    <option value={1}>1-й Круг</option>
                    <option value={2}>2-й Круг</option>
                    <option value={3}>3-й Круг</option>
                    <option value={4}>4-й Круг</option>
                    <option value={5}>5-й Круг</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Школа магии:</label>
                  <select
                    value={newSpell.school}
                    onChange={e => setNewSpell({ ...newSpell, school: e.target.value as any })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-indigo-400 outline-none"
                  >
                    <option value="Воплощение">Воплощение</option>
                    <option value="Ограждение">Ограждение</option>
                    <option value="Иллюзия">Иллюзия</option>
                    <option value="Некромантия">Некромантия</option>
                    <option value="Очарование">Очарование</option>
                    <option value="Превращение">Превращение</option>
                    <option value="Прорицание">Прорицание</option>
                    <option value="Вызов">Вызов</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Время:</label>
                  <input
                    type="text"
                    value={newSpell.castingTime}
                    onChange={e => setNewSpell({ ...newSpell, castingTime: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-indigo-400 outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Дистанция:</label>
                  <input
                    type="text"
                    value={newSpell.range}
                    onChange={e => setNewSpell({ ...newSpell, range: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-indigo-400 outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Урон/Эффект:</label>
                  <input
                    type="text"
                    value={newSpell.damageOrEffect}
                    onChange={e => setNewSpell({ ...newSpell, damageOrEffect: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-indigo-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#a1a1aa]">Описание эффекта:</label>
                <textarea
                  rows={3}
                  value={newSpell.description}
                  onChange={e => setNewSpell({ ...newSpell, description: e.target.value })}
                  className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl p-3 text-[#f4f4f5] focus:border-indigo-400 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272a]">
              <button
                onClick={() => setIsAddSpellModalOpen(false)}
                className="px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] rounded-xl text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNewSpell}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md"
              >
                Изучить заклинание
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE NEW HERO */}
      {isCreateHeroModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsCreateHeroModalOpen(false)}
        >
          <div
            className="bg-[#18181b] border-2 border-[#d4af37]/60 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-fade-in my-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#d4af37]" />
                <span>Создание нового персонажа партии (D&D 5e)</span>
              </h3>
              <button
                onClick={() => setIsCreateHeroModalOpen(false)}
                className="text-[#a1a1aa] hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Имя героя:</label>
                  <input
                    type="text"
                    placeholder="Например: Каэль Сумеречный"
                    value={newHero.name}
                    onChange={e => setNewHero({ ...newHero, name: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Имя игрока:</label>
                  <input
                    type="text"
                    placeholder="Алексей (Игрок 4)"
                    value={newHero.playerOwner}
                    onChange={e => setNewHero({ ...newHero, playerOwner: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Раса:</label>
                  <input
                    type="text"
                    value={newHero.race}
                    onChange={e => setNewHero({ ...newHero, race: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Класс и архетип:</label>
                  <input
                    type="text"
                    value={newHero.characterClass}
                    onChange={e => setNewHero({ ...newHero, characterClass: e.target.value })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Уровень:</label>
                  <input
                    type="number"
                    value={newHero.level}
                    onChange={e => setNewHero({ ...newHero, level: Number(e.target.value) })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#a1a1aa]">Макс. Хиты (HP):</label>
                  <input
                    type="number"
                    value={newHero.maxHp}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setNewHero({ ...newHero, maxHp: v, hp: v });
                    }}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#a1a1aa]">Класс доспеха (AC):</label>
                  <input
                    type="number"
                    value={newHero.ac}
                    onChange={e => setNewHero({ ...newHero, ac: Number(e.target.value) })}
                    className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] outline-none"
                  />
                </div>
              </div>

              {/* 6 Stats */}
              <div>
                <label className="font-bold text-[#a1a1aa]">Характеристики (STR / DEX / CON / INT / WIS / CHA):</label>
                <div className="grid grid-cols-6 gap-1.5 mt-1">
                  <div>
                    <span className="text-[10px] text-[#71717a]">СИЛ</span>
                    <input
                      type="number"
                      value={newHero.str}
                      onChange={e => setNewHero({ ...newHero, str: Number(e.target.value) })}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-lg p-1.5 text-center text-xs text-[#f4f4f5]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#71717a]">ЛОВ</span>
                    <input
                      type="number"
                      value={newHero.dex}
                      onChange={e => setNewHero({ ...newHero, dex: Number(e.target.value) })}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-lg p-1.5 text-center text-xs text-[#f4f4f5]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#71717a]">ТЕЛ</span>
                    <input
                      type="number"
                      value={newHero.con}
                      onChange={e => setNewHero({ ...newHero, con: Number(e.target.value) })}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-lg p-1.5 text-center text-xs text-[#f4f4f5]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#71717a]">ИНТ</span>
                    <input
                      type="number"
                      value={newHero.int}
                      onChange={e => setNewHero({ ...newHero, int: Number(e.target.value) })}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-lg p-1.5 text-center text-xs text-[#f4f4f5]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#71717a]">МДР</span>
                    <input
                      type="number"
                      value={newHero.wis}
                      onChange={e => setNewHero({ ...newHero, wis: Number(e.target.value) })}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-lg p-1.5 text-center text-xs text-[#f4f4f5]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#71717a]">ХАР</span>
                    <input
                      type="number"
                      value={newHero.cha}
                      onChange={e => setNewHero({ ...newHero, cha: Number(e.target.value) })}
                      className="w-full bg-[#121212] border border-[#27272a] rounded-lg p-1.5 text-center text-xs text-[#f4f4f5]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#a1a1aa]">Краткая биография:</label>
                <textarea
                  rows={2}
                  value={newHero.bio}
                  onChange={e => setNewHero({ ...newHero, bio: e.target.value })}
                  className="w-full mt-1 bg-[#121212] border border-[#27272a] rounded-xl p-2.5 text-[#f4f4f5] focus:border-[#d4af37] outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272a]">
              <button
                onClick={() => setIsCreateHeroModalOpen(false)}
                className="px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] rounded-xl text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNewHero}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs shadow-md"
              >
                Создать персонажа
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
