import React, { useState, useEffect } from 'react';
import {
  Entity,
  EmlMessage,
  Chapter,
  BestiaryEntry,
  GrimoireItem,
  AudioTrackSegment,
  PlayerIntentPayload,
  RoleplayPayload,
  MasterStatePayload,
  ArtMetaPayload,
} from './types/chronicle';
import { CharacterSheet, InventoryItem, SpellItem } from './types/partySheet';
import {
  INITIAL_ENTITIES,
  INITIAL_EML_VAULT,
  INITIAL_CHAPTERS,
  INITIAL_BESTIARY,
  INITIAL_GRIMOIRE,
  INITIAL_AUDIO_TRACKS,
} from './utils/defaultCampaignData';
import { DEFAULT_PARTY_MEMBERS } from './utils/defaultPartyData';
import { Header, ActiveTab } from './components/Header';
import { TacticalView } from './components/TacticalView';
import { DMScribeStudio } from './components/DMScribeStudio';
import { PartyArtistStudio } from './components/PartyArtistStudio';
import { BookPreviewStudio } from './components/BookPreviewStudio';
import { AudiobookStudio } from './components/AudiobookStudio';
import { VaultExplorer } from './components/VaultExplorer';
import { PartyInventoryStudio } from './components/PartyInventoryStudio';
import { CryptoDiceModal } from './components/CryptoDiceModal';
import { parseEmlString, buildMasterResolutionEml } from './utils/mimeEml';
import { resolveWegoRound } from './utils/wegoResolver';
import { playSfx } from './utils/audioSynthesizer';
import { loadCampaignFromDisk, saveCampaignToDisk, saveViaDialog, openTextViaDialog } from './utils/desktopIO';

function toRoman(num: number): string {
  const romanMap: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  for (const [val, sym] of romanMap) {
    while (num >= val) {
      result += sym;
      num -= val;
    }
  }
  return result || 'I';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tactical');
  const [currentRound, setCurrentRound] = useState<number>(3);
  const [entities, setEntities] = useState<Entity[]>(INITIAL_ENTITIES);
  const [emlVault, setEmlVault] = useState<EmlMessage[]>(INITIAL_EML_VAULT);
  const [chapters, setChapters] = useState<Chapter[]>(INITIAL_CHAPTERS);
  const [bestiary, setBestiary] = useState<BestiaryEntry[]>(INITIAL_BESTIARY);
  const [grimoire, setGrimoire] = useState<GrimoireItem[]>(INITIAL_GRIMOIRE);
  const [partyMembers, setPartyMembers] = useState<CharacterSheet[]>(DEFAULT_PARTY_MEMBERS);
  const [audioTracks, setAudioTracks] = useState<AudioTrackSegment[]>(INITIAL_AUDIO_TRACKS);
  const [isDiceModalOpen, setIsDiceModalOpen] = useState<boolean>(false);

  // WEGO Resolver Live State
  const [combatStatus, setCombatStatus] = useState<'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled'>('Ongoing');
  const [mechanicalLogs, setMechanicalLogs] = useState<string[]>([
    '⚡ Elena (Wizard Lvl 3) casts Scorching Ray (Slot Lvl 2):',
    '  • Ray #1 vs Goblin Ashen Shaman: D20=18 + 5 = 23 vs AC 13 -> HIT! Deals 12 fire damage',
    '  • Ray #2 vs Goblin Ashen Shaman: D20=14 + 5 = 19 vs AC 13 -> HIT! Deals 10 fire damage',
    '  💀 Goblin Ashen Shaman collapses into burning ash!',
    '  ↳ [Fallback Triggered]: Primary target is down. Ray #3 redirected to Goblin Scout Archer',
    '  • Ray #3 vs Goblin Scout Archer: D20=12 + 5 = 17 vs AC 13 -> HIT! Deals 9 fire damage',
    '⚔️ Torin (Warrior Lvl 3) strikes altar with Greatsword: deals 14 slashing damage',
    '🛡️ Goblin Scout Archer fires return shot -> Elena reacts with Shield (+5 AC, blocked!)'
  ]);
  const [suggestedProse, setSuggestedProse] = useState<string>(
    'Воздух в крипте задрожал от запаха озона. Шаман гоблинов вскинул костяной посох, но не успел закончить заклятие: огненные лучи Елены пробили его грудь. Секундой позже тяжелая секира Торина опустилась на каменный алтарь, поставив точку в этом сражении...'
  );

  // ── Desktop persistence (Tauri) ────────────────────────────────────────────
  // On startup, restore the last autosaved campaign from disk (if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadCampaignFromDisk<any>();
      if (cancelled || !saved || !saved.version) return;
      if (typeof saved.currentRound === 'number') setCurrentRound(saved.currentRound);
      if (Array.isArray(saved.entities)) setEntities(saved.entities);
      if (Array.isArray(saved.emlVault)) setEmlVault(saved.emlVault);
      if (Array.isArray(saved.chapters)) setChapters(saved.chapters);
      if (Array.isArray(saved.bestiary)) setBestiary(saved.bestiary);
      if (Array.isArray(saved.grimoire)) setGrimoire(saved.grimoire);
      if (Array.isArray(saved.partyMembers)) setPartyMembers(saved.partyMembers);
      if (Array.isArray(saved.audioTracks)) setAudioTracks(saved.audioTracks);
      if (Array.isArray(saved.mechanicalLogs)) setMechanicalLogs(saved.mechanicalLogs);
      if (typeof saved.suggestedProse === 'string') setSuggestedProse(saved.suggestedProse);
      if (saved.combatStatus) setCombatStatus(saved.combatStatus);
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced autosave of the whole campaign state to disk (desktop only).
  useEffect(() => {
    const state = {
      version: 1,
      savedAt: Date.now(),
      currentRound,
      entities,
      emlVault,
      chapters,
      bestiary,
      grimoire,
      partyMembers,
      audioTracks,
      mechanicalLogs,
      suggestedProse,
      combatStatus,
    };
    const t = setTimeout(() => {
      saveCampaignToDisk(state).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [
    currentRound, entities, emlVault, chapters, bestiary, grimoire,
    partyMembers, audioTracks, mechanicalLogs, suggestedProse, combatStatus,
  ]);

  // Advance Round Handler (Moves Tactical & Chronicle forward)
  const handleAdvanceRound = () => {
    const nextR = currentRound + 1;
    setCurrentRound(nextR);
    playSfx('dungeon_intro');

    // Create a new chapter in the book if it doesn't already exist
    setChapters(prev => {
      if (prev.some(c => c.round === nextR)) return prev;
      return [
        ...prev,
        {
          round: nextR,
          title: `Глава ${toRoman(nextR)}. Схватка в Нижних Залах`,
          subtitle: `Раунд ${nextR}: Тактическое продвижение и тайны руин`,
          prose: `Гул отзвучавшего столкновения все еще вибрировал в прохладном воздухе подземелья. Тени за костяными колоннами колыхались в такт пляшущим языкам магического пламени. Партия перестроила боевой порядок, осторожно продвигаясь вглубь каменного зала.

Торин держал тяжелый щит наготове, проверяя каждый шаг на наличие нажимных плит, пока Елена шепотом сплетала сенсорные плетения для обнаружения магических ловушек и затаившихся врагов.`,
          prosePage2: `В центре зала возвышался новый каменный постамент, испещренный древними эльфийскими глифами. Казалось, само подземелье реагировало на присутствие чужаков, посылая по стенам тихий вибрирующий гул.

«Будьте начеку», — раздался глухой голос Торина. Из боковых арок послышался скрежет когтей: новые противники стягивались на шум недавней битвы.`,
          roleplayQuotes: [],
          battleLogSummary: [
            `Раунд ${nextR} инициирован Мастером.`,
            `Инициатива пересчитана, туман войны обновлен.`,
            `Партия заняла тактические рубежи у входа.`,
          ],
          masterNotes: `Температура в зале падает на 5 градусов. Освещение слабое (Dim light), проверки Восприятия с помехой без источников света.`,
          lootReward: {
            xp: 250,
            coins: '35 зм, 80 см',
            items: ['Свиток обнаружения магии', 'Флакон алхимического огня'],
          },
          artworks: [],
        },
      ];
    });

    setMechanicalLogs(prev => [
      `\n═══ РАУНД ${nextR} ИНИЦИИРОВАН МАСТЕРОМ ═══`,
      `🎲 Сгенерированы новые криптографические сиды раунда.`,
      `⚔️ Ожидание приказов партии и действий монстров.`,
    ]);
  };

  // Chapter Saving & Creation Handlers for DMScribeStudio
  const handleSaveChapter = (updatedChapter: Chapter) => {
    setChapters(prev => {
      const exists = prev.some(c => c.round === updatedChapter.round);
      if (exists) {
        return prev.map(c => (c.round === updatedChapter.round ? updatedChapter : c));
      }
      return [...prev, updatedChapter].sort((a, b) => a.round - b.round);
    });
  };

  const handleCreateChapter = (newChapter: Chapter) => {
    setChapters(prev => [...prev.filter(c => c.round !== newChapter.round), newChapter].sort((a, b) => a.round - b.round));
  };

  // Party Character Management Handlers
  const handleUpdatePartyMember = (id: string, updates: Partial<CharacterSheet>) => {
    setPartyMembers(prev =>
      prev.map(m => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const handleAddPartyMember = (newChar: CharacterSheet) => {
    setPartyMembers(prev => [...prev, newChar]);
    // Also sync to tactical entities if not present
    setEntities(prev => [
      ...prev,
      {
        id: newChar.id,
        actorId: newChar.id,
        name: newChar.name,
        type: 'Player',
        pos: [1, 2],
        hp: newChar.hp,
        maxHp: newChar.maxHp,
        ac: newChar.ac,
        speed: 30,
        status: 'Active',
        avatarCid: newChar.avatarUrl,
      },
    ]);
  };

  const handleDeletePartyMember = (id: string) => {
    setPartyMembers(prev => prev.filter(m => m.id !== id));
    setEntities(prev => prev.filter(e => e.id !== id && e.actorId !== id));
  };

  const handleDistributeLoot = (recipientId: string, item: InventoryItem) => {
    setPartyMembers(prev =>
      prev.map(m => {
        if (m.id === recipientId) {
          return {
            ...m,
            inventory: [...m.inventory, item],
          };
        }
        return m;
      })
    );
    playSfx('shield_block');
  };

  // Bestiary & Grimoire Additions
  const handleAddBestiaryEntry = (entry: BestiaryEntry) => {
    setBestiary(prev => [...prev, entry]);
    // Also add to tactical entity roster
    setEntities(prev => [
      ...prev,
      {
        id: entry.id,
        name: entry.name,
        type: 'Monster',
        pos: [5, 4],
        hp: entry.hp,
        maxHp: entry.hp,
        ac: entry.ac,
        speed: parseInt(entry.speed) || 30,
        status: 'Active',
      },
    ]);
  };

  const handleAddGrimoireItem = (item: GrimoireItem) => {
    setGrimoire(prev => [...prev, item]);
  };

  // Simulate WEGO round calculations
  const handleSimulateWegoRound = async (intentsOverride?: PlayerIntentPayload[]) => {
    const defaultIntents: PlayerIntentPayload[] = [
      {
        actor_id: 'char_wizard_elena',
        round: currentRound,
        movement: { path: [[2, 2], [3, 4]], dash: false },
        action: {
          type: 'cast_spell',
          spell_name: 'Scorching Ray',
          slot_level: 2,
          rays: [
            { target_id: 'mob_goblin_shaman', dice_seed: 'seed-elena-ray-1' },
            { target_id: 'mob_goblin_shaman', dice_seed: 'seed-elena-ray-2' },
            { target_id: 'mob_goblin_shaman', dice_seed: 'seed-elena-ray-3' },
          ],
          dice_seed: 'seed-elena-03',
        },
        fallback_rules: [
          {
            trigger: 'target_dead',
            redirect_all_to: 'mob_goblin_archer_1',
            description: 'Перенаправить лучи на лучника',
          },
        ],
      },
      {
        actor_id: 'char_warrior_torin',
        round: currentRound,
        movement: { path: [[1, 3], [2, 4]], dash: false },
        action: {
          type: 'attack',
          weapon_name: 'Greatsword',
          target_id: 'obj_altar',
          dice_seed: 'seed-torin-03',
        },
      },
    ];

    const resolution = await resolveWegoRound(
      entities,
      currentRound,
      intentsOverride || defaultIntents,
      'master-seed-crypt-03'
    );

    setEntities(resolution.nextEntities);
    setCombatStatus(resolution.combatStatus);
    setMechanicalLogs(resolution.mechanicalLog);
    setSuggestedProse(resolution.suggestedProse);
    playSfx('fire_spell');

    // Update chapter log
    setChapters(prev =>
      prev.map(ch => {
        if (ch.round === currentRound) {
          return {
            ...ch,
            battleLogSummary: resolution.mechanicalLog.slice(0, 5),
            prose: ch.prose.length > 50 ? ch.prose : resolution.suggestedProse,
          };
        }
        return ch;
      })
    );
  };

  // Entity Management
  const handleUpdateEntity = (id: string, updates: Partial<Entity>) => {
    setEntities(prev =>
      prev.map(e => (e.id === id || e.actorId === id ? { ...e, ...updates } : e))
    );
  };

  const handleAddEntity = (newEntity: Entity) => {
    setEntities(prev => [...prev, newEntity]);
    playSfx('shield_block');
  };

  const handleRemoveEntity = (id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id && e.actorId !== id));
  };

  const handleResetCombat = () => {
    setEntities(INITIAL_ENTITIES);
    setCombatStatus('Ongoing');
    setCurrentRound(1);
    playSfx('dungeon_intro');
  };

  // Handler for Player Intent Transmissions
  const handleTransmitIntent = async (
    rawEml: string,
    intent: PlayerIntentPayload,
    roleplay: RoleplayPayload
  ) => {
    const parsed = parseEmlString(rawEml);
    setEmlVault(prev => [parsed, ...prev.filter(m => m.id !== parsed.id)]);

    // Run WEGO Rules Engine with master seed
    await handleSimulateWegoRound([intent]);

    // Update chapter roleplay dialogue
    setChapters(prev =>
      prev.map(ch => {
        if (ch.round === currentRound) {
          return {
            ...ch,
            roleplayQuotes: [
              ...ch.roleplayQuotes,
              {
                actorName: intent.actor_id === 'char_wizard_elena' ? 'Елена (Волшебница)' : 'Торин (Воин)',
                actorClass: '3 ур.',
                speech: roleplay.speech,
                thought: roleplay.internal_thought,
                flavor: roleplay.action_flavor,
                emotion: (roleplay.avatar_emotion_cid.replace(/^cid:avatar_/, '') as any) || 'furious',
              },
            ],
          };
        }
        return ch;
      })
    );

    // Add audio track segment for speech
    if (roleplay.speech) {
      setAudioTracks(prev => [
        ...prev,
        {
          id: `track-${Date.now()}`,
          round: currentRound,
          type: 'character_speech',
          speakerName: intent.actor_id === 'char_wizard_elena' ? 'Elena (Wizard)' : 'Torin (Warrior)',
          speakerRole: 'Player',
          title: `Реплика героя (Раунд ${currentRound})`,
          durationSec: 3.5,
          waveformSeed: Math.floor(Math.random() * 1000),
          textSnippet: roleplay.speech,
        },
      ]);
    }
  };

  // Handler for Master Resolution Publishing
  const handlePublishResolution = (
    rawEml: string,
    state: MasterStatePayload,
    prose: string
  ) => {
    const parsed = parseEmlString(rawEml);
    setEmlVault(prev => [parsed, ...prev.filter(m => m.id !== parsed.id)]);

    // Update chapter prose text in book
    setChapters(prev =>
      prev.map(ch => {
        if (ch.round === currentRound) {
          return {
            ...ch,
            prose,
          };
        }
        return ch;
      })
    );

    // Add Master audio narration track
    setAudioTracks(prev => [
      ...prev,
      {
        id: `track-master-${Date.now()}`,
        round: currentRound,
        type: 'master_narration',
        speakerName: 'Dungeon Master',
        speakerRole: 'DM',
        title: `Мастер: Канонический эпилог (Раунд ${currentRound})`,
        durationSec: 8.0,
        waveformSeed: 777,
        textSnippet: prose,
      },
    ]);
  };

  // Handler for Party Art Additions
  const handleAddArtPiece = (
    rawEml: string,
    artMeta: ArtMetaPayload,
    imageUrl: string
  ) => {
    const parsed = parseEmlString(rawEml);
    setEmlVault(prev => [parsed, ...prev.filter(m => m.id !== parsed.id)]);

    const targetR = artMeta.link_to_scene_id.includes('round-01')
      ? 1
      : artMeta.link_to_scene_id.includes('round-02')
      ? 2
      : currentRound;

    setChapters(prev =>
      prev.map(ch => {
        if (ch.round === targetR) {
          return {
            ...ch,
            artworks: [
              ...ch.artworks,
              {
                title: artMeta.caption,
                artist: artMeta.artist_credit,
                url: imageUrl,
                placement: artMeta.book_placement,
                caption: `${artMeta.caption}. Автор: ${artMeta.artist_credit}`,
              },
            ],
          };
        }
        return ch;
      })
    );
  };

  const handleImportEml = (parsedEml: EmlMessage) => {
    setEmlVault(prev => [parsedEml, ...prev.filter(m => m.id !== parsedEml.id)]);
  };

  // ── Campaign file save/load via native dialogs ────────────────────────────
  const buildCampaignSnapshot = () => ({
    version: 1,
    savedAt: Date.now(),
    currentRound,
    entities,
    emlVault,
    chapters,
    bestiary,
    grimoire,
    partyMembers,
    audioTracks,
    mechanicalLogs,
    suggestedProse,
    combatStatus,
  });

  const applyCampaignSnapshot = (saved: any) => {
    if (!saved || !saved.version) return false;
    if (typeof saved.currentRound === 'number') setCurrentRound(saved.currentRound);
    if (Array.isArray(saved.entities)) setEntities(saved.entities);
    if (Array.isArray(saved.emlVault)) setEmlVault(saved.emlVault);
    if (Array.isArray(saved.chapters)) setChapters(saved.chapters);
    if (Array.isArray(saved.bestiary)) setBestiary(saved.bestiary);
    if (Array.isArray(saved.grimoire)) setGrimoire(saved.grimoire);
    if (Array.isArray(saved.partyMembers)) setPartyMembers(saved.partyMembers);
    if (Array.isArray(saved.audioTracks)) setAudioTracks(saved.audioTracks);
    if (Array.isArray(saved.mechanicalLogs)) setMechanicalLogs(saved.mechanicalLogs);
    if (typeof saved.suggestedProse === 'string') setSuggestedProse(saved.suggestedProse);
    if (saved.combatStatus) setCombatStatus(saved.combatStatus);
    return true;
  };

  const handleSaveCampaign = async () => {
    const snapshot = buildCampaignSnapshot();
    const ok = await saveViaDialog(
      JSON.stringify(snapshot, null, 2),
      `campaign_round_${currentRound}.json`
    );
    if (ok) playSfx('shield_block');
  };

  const handleLoadCampaign = async () => {
    const picked = await openTextViaDialog('.json');
    if (!picked) return;
    try {
      if (applyCampaignSnapshot(JSON.parse(picked.content))) playSfx('shield_block');
    } catch (e) {
      console.warn('Campaign load failed:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#d4d4d8] font-sans selection:bg-[#d4af37]/30 selection:text-[#f4f4f5] flex flex-col">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentRound={currentRound}
        onRoundChange={setCurrentRound}
        onOpenDiceModal={() => setIsDiceModalOpen(true)}
        emlCount={emlVault.length}
        onSaveCampaign={handleSaveCampaign}
        onLoadCampaign={handleLoadCampaign}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'tactical' && (
          <TacticalView
            round={currentRound}
            entities={entities}
            combatStatus={combatStatus}
            onTransmitIntent={handleTransmitIntent}
            onOpenDiceModal={() => setIsDiceModalOpen(true)}
            onSimulateWegoRound={handleSimulateWegoRound}
            onAdvanceRound={handleAdvanceRound}
            onUpdateEntity={handleUpdateEntity}
            onAddEntity={handleAddEntity}
            onRemoveEntity={handleRemoveEntity}
            onResetCombat={handleResetCombat}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'party' && (
          <PartyInventoryStudio
            partyMembers={partyMembers}
            onUpdateMember={handleUpdatePartyMember}
            onAddMember={handleAddPartyMember}
            onDeleteMember={handleDeletePartyMember}
            onDistributeLoot={handleDistributeLoot}
          />
        )}

        {activeTab === 'dm_scribe' && (
          <DMScribeStudio
            round={currentRound}
            entities={entities}
            combatStatus={combatStatus}
            mechanicalLogs={mechanicalLogs}
            suggestedProse={suggestedProse}
            onPublishResolution={handlePublishResolution}
            onAdvanceRound={handleAdvanceRound}
            onSimulateWegoRound={handleSimulateWegoRound}
            onNavigateToTab={setActiveTab}
            chapters={chapters}
            onSaveChapter={handleSaveChapter}
            onCreateChapter={handleCreateChapter}
          />
        )}

        {activeTab === 'artist' && (
          <PartyArtistStudio
            currentRound={currentRound}
            onAddArtPiece={handleAddArtPiece}
          />
        )}

        {activeTab === 'book' && (
          <BookPreviewStudio
            chapters={chapters}
            bestiary={bestiary}
            grimoire={grimoire}
            onAddBestiaryEntry={handleAddBestiaryEntry}
            onAddGrimoireItem={handleAddGrimoireItem}
          />
        )}

        {activeTab === 'audiobook' && (
          <AudiobookStudio
            tracks={audioTracks}
            currentRound={currentRound}
          />
        )}

        {activeTab === 'vault' && (
          <VaultExplorer
            emlVault={emlVault}
            onImportEml={handleImportEml}
          />
        )}
      </main>

      {/* Footer Info */}
      <footer className="border-t border-[#27272a] bg-[#09090b] py-4 text-center text-xs text-[#71717a] font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#22c55e]"></span>
            Chronicle Engine • RFC 5322 EML Zero-Database Architecture
          </span>
          <span>D&D 5e / OSR WEGO Simultaneous Combat • Typst 300 DPI Publishing • AAC Audio</span>
        </div>
      </footer>

      {/* Cryptographic Dice Modal */}
      <CryptoDiceModal
        isOpen={isDiceModalOpen}
        onClose={() => setIsDiceModalOpen(false)}
      />
    </div>
  );
}
