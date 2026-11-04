import React, { useState, useRef, useEffect } from 'react';
import {
  Entity,
  MapMarker,
  PlayerIntentPayload,
  RoleplayPayload,
  EmotionType,
} from '../types/chronicle';
import {
  Compass,
  Play,
  Pause,
  SkipForward,
  FastForward,
  X,
  Clapperboard,
  RotateCcw,
  Sparkles,
  Shield,
  Sword,
  Flame,
  Volume2,
  Mic,
  MicOff,
  Send,
  Eye,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crown,
  User,
  PlusCircle,
  Skull,
  Heart,
  Crosshair,
  ArrowRight,
  RefreshCw,
  Feather,
  Zap,
  Trash2,
} from 'lucide-react';
import { buildPlayerIntentEml, downloadEmlFile } from '../utils/mimeEml';
import { generateRandomSeed } from '../utils/cryptoDice';
import { playSfx, speakSpeechText, stopAllSpeech } from '../utils/audioSynthesizer';
import {
  buildReplayTimeline, applyFrame, fastForward,
  spawnParticles,
  ReplayFrame, RoundReplayData,
} from '../utils/roundReplay';
import { CRYPT_TERRAIN } from '../utils/wegoResolver';
import { ActiveTab } from './Header';

/** Стены арены по умолчанию — на них нельзя перетащить токен. */
const WALL_CELLS = new Set(CRYPT_TERRAIN.walls.map(([x, y]) => `${x},${y}`));

interface TacticalViewProps {
  round: number;
  entities: Entity[];
  combatStatus?: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled';
  /** последний разрешённый раунд — по нему запускается кинематографичный реплей */
  lastRound?: RoundReplayData | null;
  onReplayDismiss?: () => void;
  onTransmitIntent: (rawEml: string, intent: PlayerIntentPayload, roleplay: RoleplayPayload) => void;
  onOpenDiceModal: () => void;
  onSimulateWegoRound?: (customIntents?: PlayerIntentPayload[]) => Promise<void>;
  onAdvanceRound?: () => void;
  onUpdateEntity?: (id: string, partial: Partial<Entity>) => void;
  onAddEntity?: (entity: Entity) => void;
  onRemoveEntity?: (id: string) => void;
  onResetCombat?: () => void;
  onNavigateToTab?: (tab: ActiveTab) => void;
  /** пометки Мастера на живой карте — общий слой всех столов */
  markers?: MapMarker[];
  /** Alt+клик по клетке / клик по булавке — поставить или снять пометку */
  onToggleMarker?: (pos: [number, number]) => void;
}

export const TacticalView: React.FC<TacticalViewProps> = ({
  round,
  entities,
  combatStatus = 'Ongoing',
  lastRound,
  onReplayDismiss,
  onTransmitIntent,
  onOpenDiceModal,
  onSimulateWegoRound,
  onAdvanceRound,
  onUpdateEntity,
  onAddEntity,
  onRemoveEntity,
  onResetCombat,
  onNavigateToTab,
  markers = [],
  onToggleMarker,
}) => {
  const [controlMode, setControlMode] = useState<'player' | 'master'>('master');
  const [selectedActorId, setSelectedActorId] = useState<string>('char_wizard_elena');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [gridMode, setGridMode] = useState<'grid' | 'hex'>('grid');
  
  // Tactical Pathing State
  const [plannedPath, setPlannedPath] = useState<[number, number][]>([[2, 2], [2, 3], [3, 4]]);
  const [isPathingMode, setIsPathingMode] = useState<boolean>(false);

  // Action Builder State
  const [actionType, setActionType] = useState<'cast_spell' | 'attack' | 'dodge' | 'help'>('cast_spell');
  const [selectedSpell, setSelectedSpell] = useState<string>('Scorching Ray');
  const [spellSlot, setSpellSlot] = useState<number>(2);
  const [selectedWeapon, setSelectedWeapon] = useState<string>('');
  const [primaryTargetId, setPrimaryTargetId] = useState<string>('mob_shaman');
  const [secondaryTargetId, setSecondaryTargetId] = useState<string>('mob_archer_1');
  const [fallbackTrigger, setFallbackTrigger] = useState<string>('target_mob_shaman_dead_before_turn');
  const [reactionSpell, setReactionSpell] = useState<string>('Shield');

  // Cinematic Replay State — играет последний разрешённый раунд
  const [replayOpen, setReplayOpen] = useState<boolean>(false);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);
  const [replayEntities, setReplayEntities] = useState<Entity[]>([]);
  const [replayIdx, setReplayIdx] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayCaption, setReplayCaption] = useState<string>('');

  // Живая карта: перетаскивание токенов (мастер — любые, игрок — только свой)
  const [drag, setDrag] = useState<{ id: string; pos: [number, number]; moved: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Джус реплея: тряска стола на критах, смертях и выводе из строя
  const [shake, setShake] = useState<boolean>(false);
  const shakeTimerRef = useRef<number | null>(null);

  // Roleplay Drawer State
  const [speech, setSpeech] = useState<string>('Пепел к пеплу, тварь! Попробуй это пламя!');
  const [internalThought, setInternalThought] = useState<string>('Лишь бы воин успел прикрыть фланг...');
  const [actionFlavor, setActionFlavor] = useState<string>('Елена отступает в тень саркофага, на ладонях разгорается пламя.');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>('furious');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [hasVoiceRecorded, setHasVoiceRecorded] = useState<boolean>(true);
  const [isTransmitted, setIsTransmitted] = useState<boolean>(false);
  const [previewEmlModal, setPreviewEmlModal] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // DM Entity Spawner State
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState<boolean>(false);
  const [newUnitType, setNewUnitType] = useState<'goblin_archer' | 'skeleton_warrior' | 'hell_hound' | 'npc_paladin'>('goblin_archer');
  const [newUnitName, setNewUnitName] = useState<string>('Гоблин-лазутчик #2');
  const [newUnitHp, setNewUnitHp] = useState<number>(14);
  const [newUnitAc, setNewUnitAc] = useState<number>(13);
  const [newUnitPos, setNewUnitPos] = useState<[number, number]>([11, 6]);

  const recordingTimerRef = useRef<any>(null);

  const selectedEntity = entities.find(e => e.actorId === selectedActorId || e.id === selectedActorId) || entities[0];
  const enemies = entities.filter(e => e.role === 'enemy');
  const players = entities.filter(e => e.role === 'player' || e.role === 'npc');

  // Во время реплея сетка показывает реплей-состояние, а не реальный стол
  const viewEntities = replayOpen ? replayEntities : entities;
  const currentFrame: ReplayFrame | null =
    replayOpen && replayIdx > 0 && replayIdx <= replayFrames.length ? replayFrames[replayIdx - 1] : null;

  const startDrag = (ev: React.PointerEvent, ent: Entity) => {
    if (replayOpen || isPathingMode) return;
    if (controlMode === 'player' && (ent.actorId || ent.id) !== selectedActorId) return;
    ev.preventDefault();
    ev.stopPropagation();
    setDrag({ id: ent.id, pos: ent.pos, moved: false });
  };

  const handleDragMove = (ev: React.PointerEvent) => {
    if (!drag || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(15, Math.floor(((ev.clientX - rect.left) / rect.width) * 16)));
    const cy = Math.max(0, Math.min(11, Math.floor(((ev.clientY - rect.top) / rect.height) * 12)));
    if (cx !== drag.pos[0] || cy !== drag.pos[1]) setDrag({ ...drag, pos: [cx, cy], moved: true });
  };

  const finishDrag = () => {
    if (!drag) return;
    const ent = viewEntities.find(e => e.id === drag.id);
    const [tx, ty] = drag.pos;
    const blocked =
      WALL_CELLS.has(`${tx},${ty}`) ||
      viewEntities.some(o => o.id !== drag.id && o.status !== 'Dead' && o.pos[0] === tx && o.pos[1] === ty);
    if (
      ent && drag.moved && !blocked &&
      (tx !== ent.pos[0] || ty !== ent.pos[1])
    ) {
      onUpdateEntity?.(drag.id, { pos: [tx, ty] });
      playSfx('dice_roll');
    }
    setDrag(null);
  };

  // Новый разрешённый раунд приехал — открываем кинематографичный реплей
  useEffect(() => {
    if (!lastRound || lastRound.events.length === 0) return;
    setReplayFrames(buildReplayTimeline(lastRound.events));
    setReplayEntities(JSON.parse(JSON.stringify(lastRound.startEntities)));
    setReplayIdx(0);
    setReplayCaption(`Реплей раунда ${lastRound.round}: ${lastRound.events.length} событий`);
    setReplaySpeed(1);
    setReplayOpen(true);
    setReplayPlaying(true);
  }, [lastRound]);

  // Смена актора — старый набранный путь больше не имеет смысла
  useEffect(() => {
    setPlannedPath([]);
  }, [selectedActorId]);

  // Автопроигрывание: таймер на duration текущего кадра, делённый на скорость
  useEffect(() => {
    if (!replayOpen || !replayPlaying) return;
    if (replayIdx >= replayFrames.length) {
      setReplayPlaying(false);
      return;
    }
    const frame = replayFrames[replayIdx];
    const t = setTimeout(() => {
      setReplayEntities(prev => applyFrame(prev, frame));
      setReplayCaption(frame.caption);
      setReplayIdx(i => i + 1);
      // встряска стола на критах, смертях и выводе из строя
      if (frame.burst && frame.burst.intensity >= 2) {
        if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
        setShake(true);
        shakeTimerRef.current = window.setTimeout(() => setShake(false), 450);
      }
      playSfx(
        frame.arc?.crit ? 'fire_spell'
          : frame.arc ? 'sword_slash'
          : frame.move ? 'dice_roll'
          : frame.popup?.tone === 'heal' ? 'shield_block'
          : 'dice_roll'
      );
    }, frame.durationMs / replaySpeed);
    return () => clearTimeout(t);
  }, [replayOpen, replayPlaying, replayIdx, replayFrames, replaySpeed]);

  const replayStep = () => {
    if (replayIdx >= replayFrames.length) return;
    const frame = replayFrames[replayIdx];
    setReplayEntities(prev => applyFrame(prev, frame));
    setReplayCaption(frame.caption);
    setReplayIdx(i => i + 1);
    playSfx('dice_roll');
  };

  const handleReplaySkipAll = () => {
    setReplayEntities(prev => fastForward(prev, replayFrames, replayIdx));
    const last = replayFrames[replayFrames.length - 1];
    setReplayCaption(last ? last.caption : 'Реплей завершён');
    setReplayIdx(replayFrames.length);
    setReplayPlaying(false);
  };

  const handleReplayClose = () => {
    setReplayOpen(false);
    setReplayPlaying(false);
    onReplayDismiss?.();
  };

  const handleCellClick = (x: number, y: number, alt = false) => {
    if (replayOpen || drag) return; // реплей и перетаскивание замораживают прокладку пути
    if (!isPathingMode) {
      // Alt+клик Мастера — поставить/снять пометку на живой карте
      if (controlMode === 'master' && alt) {
        onToggleMarker?.([x, y]);
        return;
      }
      // In DM mode, allow moving selected entity to cell
      if (controlMode === 'master' && selectedEntity) {
        onUpdateEntity?.(selectedEntity.id, { pos: [x, y] });
        playSfx('dice_roll');
      }
      return;
    }
    
    // Toggle or append cell to path
    const lastPos = plannedPath.length > 0 ? plannedPath[plannedPath.length - 1] : selectedEntity.pos;
    const dx = Math.abs(x - lastPos[0]);
    const dy = Math.abs(y - lastPos[1]);
    
    if (dx <= 1 && dy <= 1 && (dx > 0 || dy > 0)) {
      if (plannedPath.length < selectedEntity.speed) {
        setPlannedPath(prev => [...prev, [x, y]]);
        playSfx('dice_roll');
      }
    } else {
      const startDx = Math.abs(x - selectedEntity.pos[0]);
      const startDy = Math.abs(y - selectedEntity.pos[1]);
      if (startDx <= 1 && startDy <= 1) {
        setPlannedPath([[x, y]]);
        playSfx('dice_roll');
      }
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      setHasVoiceRecorded(true);
      playSfx('shield_block');
    } else {
      setIsRecording(true);
      setRecordingSeconds(0);
      playSfx('dice_roll');
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    }
  };

  const handleTestSpeechPlayback = () => {
    playSfx('fire_spell');
    speakSpeechText(speech, 1.2, 1.05);
  };

  const constructIntentPayload = (): { intent: PlayerIntentPayload; roleplay: RoleplayPayload } => {
    const rays = [
      { target_id: primaryTargetId, dice_seed: generateRandomSeed('seed_ray1') },
      { target_id: primaryTargetId, dice_seed: generateRandomSeed('seed_ray2') },
      { target_id: secondaryTargetId, dice_seed: generateRandomSeed('seed_ray3') },
    ];

    const weaponName =
      selectedWeapon || (selectedEntity?.weapons ?? [])[0]?.name;

    // Честный d20: свежий случайный сид на каждый интент — перекинуть нельзя,
    // а повторять прошлые броски бессмысленно
    const intent: PlayerIntentPayload = {
      actor_id: selectedActorId,
      round,
      movement: {
        path: plannedPath,
        dash: false,
      },
      action: {
        type: actionType,
        spell_name: actionType === 'cast_spell' ? selectedSpell : undefined,
        slot_level: actionType === 'cast_spell' ? spellSlot : undefined,
        weapon_name: actionType === 'attack' ? weaponName : undefined,
        target_id: actionType === 'dodge' ? undefined : primaryTargetId,
        rays: actionType === 'cast_spell' && selectedSpell === 'Scorching Ray' ? rays : undefined,
        dice_seed: generateRandomSeed(`seed_${selectedActorId}`),
      },
      fallback_rules:
        actionType === 'cast_spell'
          ? [
              {
                trigger: fallbackTrigger,
                redirect_all_to: secondaryTargetId,
                description: `Если ${primaryTargetId} погибает до выстрела, перенаправить лучи в ${secondaryTargetId}`,
              },
            ]
          : [],
      reaction: {
        trigger: 'hit_by_melee_attack',
        spell: reactionSpell,
        description: `Сотворить ${reactionSpell} при входящей физической атаке (+5 КД)`,
      },
    };

    const roleplay: RoleplayPayload = {
      speech,
      internal_thought: internalThought,
      action_flavor: actionFlavor,
      avatar_emotion_cid: `cid:avatar_${selectedEmotion}`,
      audio_voice_cid: hasVoiceRecorded ? 'cid:voice_line' : undefined,
    };

    return { intent, roleplay };
  };

  const handleSendIntent = () => {
    const { intent, roleplay } = constructIntentPayload();
    const rawEml = buildPlayerIntentEml(
      {
        from: `${selectedEntity.name} <${selectedActorId}@party.local>`,
        to: 'Dungeon Master <dm@chronicle.local>',
        subject: `Re: [Round ${round}] Action: ${selectedEntity.name}`,
        messageId: `<intent-r${round.toString().padStart(2, '0')}-${selectedActorId}@vault.local>`,
        round,
        actorId: selectedActorId,
      },
      intent,
      roleplay
    );

    onTransmitIntent(rawEml, intent, roleplay);
    setIsTransmitted(true);
    playSfx('fire_spell');
    setTimeout(() => setIsTransmitted(false), 4000);
  };

  const handleRunWegoSimulation = async () => {
    setIsSimulating(true);
    playSfx('dice_roll');
    const { intent } = constructIntentPayload();
    if (onSimulateWegoRound) {
      await onSimulateWegoRound([intent]);
    }
    setIsSimulating(false);
  };

  const handleSpawnUnitSubmit = () => {
    const isEnemy = newUnitType !== 'npc_paladin';
    const newUnit: Entity = {
      id: `unit_${Date.now()}`,
      name: newUnitName,
      role: isEnemy ? 'enemy' : 'npc',
      hp: newUnitHp,
      maxHp: newUnitHp,
      ac: newUnitAc,
      speed: 6,
      initiative: 12 + Math.floor(Math.random() * 8),
      pos: newUnitPos,
      status: 'Alive',
      avatarUrl: isEnemy
        ? 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=150&auto=format&fit=crop&q=80',
      color: isEnemy ? '#ef4444' : '#10b981',
      weapons: [{ name: 'Клинок / Лук', damage: '1d6+2', range: 30 }],
    };

    onAddEntity?.(newUnit);
    setIsSpawnModalOpen(false);
  };

  return (
    <div id="tactical-view-root" className="space-y-6">
      {/* Анимации реплея: разлёт частиц и тряска стола на критах */}
      <style>{`
        @keyframes ce-fly {
          0% { opacity: 0.95; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--ce-dx)), calc(-50% + var(--ce-dy))) scale(0.3); }
        }
        .ce-particle {
          position: absolute; left: 0; top: 0;
          transform: translate(-50%, -50%);
          animation: ce-fly 620ms ease-out forwards;
          pointer-events: none;
        }
        @keyframes ce-shake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-4px, 2px); }
          40% { transform: translate(4px, -2px); }
          60% { transform: translate(-3px, -2px); }
          80% { transform: translate(3px, 2px); }
        }
        .ce-shake { animation: ce-shake 0.42s ease-in-out; }
      `}</style>
      {/* Supreme Command Header Bar */}
      <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            controlMode === 'master'
              ? 'bg-[#d4af37]/10 border-[#d4af37]/40 text-[#d4af37]'
              : 'bg-purple-950/40 border-purple-800/40 text-purple-400'
          }`}>
            {controlMode === 'master' ? <Crown className="w-6 h-6" /> : <User className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#f4f4f5]">
                {controlMode === 'master' ? 'Командный пульт Мастера Подземелий (DM)' : 'Тактический терминал Игрока (Player)'}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[#d4af37] font-mono font-bold">
                Раунд {round}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                combatStatus === 'Ended_Victory'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {combatStatus === 'Ended_Victory' ? 'Победа партии' : 'Бой в разгаре'}
              </span>
            </div>
            <p className="text-xs text-[#a1a1aa]">
              {controlMode === 'master'
                ? 'Руководство боем, одновременный расчет WEGO раунда, спавн подкреплений и переключение раундов'
                : 'Планирование траектории движения, D&D 5e заклинаний, fallback триггеров и голосовой отыгрыш'}
            </p>
          </div>
        </div>

        {/* Master vs Player Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[#0c0c0c] p-1 rounded-xl border border-[#27272a] flex gap-1 text-xs">
            <button
              onClick={() => {
                setControlMode('master');
                playSfx('shield_block');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                controlMode === 'master'
                  ? 'bg-[#18181b] text-[#d4af37] border border-[#d4af37]/40 shadow'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              Режим Мастера
            </button>
            <button
              onClick={() => {
                setControlMode('player');
                playSfx('dice_roll');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                controlMode === 'player'
                  ? 'bg-[#18181b] text-purple-300 font-bold border border-purple-700/40 shadow'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Режим Игрока
            </button>
          </div>

          {/* DM Action Triggers */}
          <button
            onClick={handleRunWegoSimulation}
            disabled={isSimulating}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#eab308] hover:to-[#d4af37] text-[#0c0c0c] font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-[#d4af37]/20 transition active:scale-95 disabled:opacity-50"
            title="Рассчитать одновременное исполнение всех действий раунда"
          >
            <Zap className="w-4 h-4" />
            {isSimulating ? 'Расчет...' : 'Рассчитать раунд (WEGO)'}
          </button>

          <button
            onClick={() => onAdvanceRound?.()}
            className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#f4f4f5] border border-[#27272a] text-xs font-bold flex items-center gap-1.5 transition"
            title="Перейти к следующему раунду боя"
          >
            Следующий раунд
            <ArrowRight className="w-3.5 h-3.5 text-[#d4af37]" />
          </button>

          <button
            onClick={() => setIsSpawnModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] text-xs font-semibold flex items-center gap-1.5 transition"
            title="Призвать нового монстра или NPC на поле боя"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            + Спавн монстра
          </button>

          <button
            onClick={onResetCombat}
            className="p-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#71717a] hover:text-[#f4f4f5] border border-[#27272a] transition"
            title="Сбросить тактическое состояние боя к началу"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid + Sidebar Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Tactical Map (8 cols) */}
        <div className="xl:col-span-8 space-y-4">
          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-4 shadow-xl space-y-3">
            {/* Map Sub-Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272a] pb-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[#a1a1aa]">
                  Карта: <strong className="text-[#f4f4f5]">Святилище Одинокого Пика (16×12)</strong>
                </span>
                <span className="text-[#71717a]">•</span>
                <span className="text-[#d4af37] font-mono">1 клетка = 5 футов (1.5м)</span>
                <span className="text-[#71717a]">•</span>
                <span className="text-[#a1a1aa] hidden lg:inline">Alt+клик — 📍 пометка Мастера</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPathingMode(!isPathingMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    isPathingMode
                      ? 'bg-amber-500 text-stone-950 font-bold shadow'
                      : 'bg-[#18181b] text-[#d4d4d8] border border-[#27272a] hover:bg-[#27272a]'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  {isPathingMode ? 'Режим прокладки: ВКЛ' : 'Проложить путь (Move)'}
                </button>

                <button
                  onClick={() => setPlannedPath([])}
                  className="px-2.5 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] border border-[#27272a] transition"
                  title="Сбросить путь"
                >
                  Очистить
                </button>
              </div>
            </div>

            {/* Tactical Grid Canvas */}
            <div className="relative overflow-x-auto bg-[#08080a] border border-[#27272a] rounded-xl p-2 select-none">
              <div
                ref={gridRef}
                onPointerMove={handleDragMove}
                onPointerUp={finishDrag}
                onPointerLeave={() => setDrag(null)}
                className={`grid grid-cols-16 gap-1 min-w-[640px] aspect-[16/12] p-2 bg-[#0d0d11] rounded-lg relative ${shake ? 'ce-shake' : ''}`}
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 60% 40%, rgba(212, 175, 55, 0.08) 0%, transparent 60%), linear-gradient(to right, #1f1f23 1px, transparent 1px), linear-gradient(to bottom, #1f1f23 1px, transparent 1px)',
                  backgroundSize: '100% 100%, 40px 40px, 40px 40px',
                }}
              >
                {/* SVG Tactical Overlay for paths, spell rays, and area effects */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                  {/* Planned movement path (заморожен во время реплея) */}
                  {!replayOpen && plannedPath.length > 0 && selectedEntity && (
                    <polyline
                      points={[selectedEntity.pos, ...plannedPath]
                        .map(([px, py]) => `${((px + 0.5) / 16) * 100}% ${((py + 0.5) / 12) * 100}%`)
                        .join(' ')}
                      fill="none"
                      stroke="#d4af37"
                      strokeWidth="3"
                      strokeDasharray="5,5"
                      opacity="0.85"
                    />
                  )}

                  {/* Spell rays if Scorching Ray */}
                  {!replayOpen && actionType === 'cast_spell' && selectedSpell === 'Scorching Ray' && selectedEntity && (
                    <>
                      {enemies.slice(0, 2).map((target, tIdx) => (
                        <line
                          key={tIdx}
                          x1={`${((selectedEntity.pos[0] + 0.5) / 16) * 100}%`}
                          y1={`${((selectedEntity.pos[1] + 0.5) / 12) * 100}%`}
                          x2={`${((target.pos[0] + 0.5) / 16) * 100}%`}
                          y2={`${((target.pos[1] + 0.5) / 12) * 100}%`}
                          stroke="#ef4444"
                          strokeWidth="2.5"
                          strokeDasharray="4,2"
                          opacity="0.9"
                        />
                      ))}
                    </>
                  )}

                  {/* Replay attack arc: кто в кого стрелял на текущем кадре */}
                  {replayOpen && currentFrame?.arc && (() => {
                    const from = viewEntities.find(e => e.id === currentFrame.arc!.fromId);
                    const to = viewEntities.find(e => e.id === currentFrame.arc!.toId);
                    if (!from || !to) return null;
                    return (
                      <>
                        <line
                          x1={`${((from.pos[0] + 0.5) / 16) * 100}%`}
                          y1={`${((from.pos[1] + 0.5) / 12) * 100}%`}
                          x2={`${((to.pos[0] + 0.5) / 16) * 100}%`}
                          y2={`${((to.pos[1] + 0.5) / 12) * 100}%`}
                          stroke={currentFrame.arc.crit ? '#fbbf24' : currentFrame.arc.color}
                          strokeWidth={currentFrame.arc.crit ? 4 : 2.5}
                          strokeDasharray={currentFrame.arc.dashed ? '4,3' : undefined}
                          opacity="0.95"
                        />
                        <circle
                          cx={`${((to.pos[0] + 0.5) / 16) * 100}%`}
                          cy={`${((to.pos[1] + 0.5) / 12) * 100}%`}
                          r="6"
                          fill="none"
                          stroke={currentFrame.arc.crit ? '#fbbf24' : '#f87171'}
                          strokeWidth="2"
                          opacity="0.9"
                        />
                      </>
                    );
                  })()}
                </svg>

                {/* Grid Cells Generator (16x12 = 192 cells) */}
                {Array.from({ length: 12 }).map((_, y) =>
                  Array.from({ length: 16 }).map((_, x) => {
                    const isPathCell = plannedPath.some(([px, py]) => px === x && py === y);
                    const isSelected = selectedEntity && selectedEntity.pos[0] === x && selectedEntity.pos[1] === y;
                    const isAltar = x >= 11 && x <= 13 && y >= 7 && y <= 8;
                    const isDragCell = !!drag && drag.pos[0] === x && drag.pos[1] === y;
                    const isDragBlocked =
                      isDragCell &&
                      (WALL_CELLS.has(`${x},${y}`) ||
                        viewEntities.some(o => o.id !== drag!.id && o.status !== 'Dead' && o.pos[0] === x && o.pos[1] === y));

                    return (
                      <div
                        key={`${x}-${y}`}
                        onClick={(ev) => handleCellClick(x, y, ev.altKey)}
                        className={`relative aspect-square rounded-md border flex items-center justify-center transition cursor-pointer ${
                          isDragCell
                            ? isDragBlocked
                              ? 'bg-red-950/70 border-red-500'
                              : 'bg-sky-500/25 border-sky-400'
                            : isAltar
                            ? 'bg-stone-800/80 border-stone-600'
                            : isPathCell
                            ? 'bg-[#d4af37]/20 border-[#d4af37]/60 shadow-[inset_0_0_8px_rgba(212,175,55,0.3)]'
                            : isSelected
                            ? 'bg-purple-950/40 border-purple-500'
                            : 'border-[#1c1c20] hover:bg-[#18181b]/60'
                        }`}
                      >
                        {/* Altar decoration */}
                        {isAltar && x === 12 && y === 7 && (
                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-serif text-stone-400 font-bold uppercase pointer-events-none select-none">
                            Алтарь
                          </div>
                        )}

                        {/* Path step number */}
                        {isPathCell && (
                          <span className="absolute text-[9px] font-mono font-black text-[#d4af37] select-none">
                            {plannedPath.findIndex(([px, py]) => px === x && py === y) + 1}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Marker Layer — пометки Мастера, общий для всех столов */}
                {markers.map(mk => (
                  <div
                    key={mk.id}
                    className="absolute z-[15] pointer-events-auto cursor-pointer"
                    style={{
                      left: `${((mk.pos[0] + 0.5) / 16) * 100}%`,
                      top: `${((mk.pos[1] + 0.5) / 12) * 100}%`,
                      transition: 'left 300ms ease-out, top 300ms ease-out',
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (controlMode === 'master') onToggleMarker?.(mk.pos);
                    }}
                    title={`${mk.label || 'Пометка Мастера'}${mk.by ? ` (${mk.by})` : ''} — клик снимет`}
                  >
                    <div className="-translate-x-1/2 -translate-y-1/2 flex flex-col items-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                      <span className="text-base leading-none animate-pulse">📍</span>
                      {mk.label && (
                        <span className="mt-0.5 px-1.5 py-0.5 rounded-md bg-[#0c0c0c]/85 border border-[#d4af37]/50 text-[9px] font-bold text-[#d4af37] whitespace-nowrap max-w-[110px] truncate">
                          {mk.label}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Token Layer — абсолютные токены: движение анимируется CSS-переходом */}
                {viewEntities.map(e => {
                  const isDead = e.status === 'Dead';
                  const isReplayActor = replayOpen && currentFrame?.move?.actorId === e.id;
                  const isDragged = drag?.id === e.id;
                  const pos = isDragged ? drag!.pos : e.pos;
                  const dragAllowed = !replayOpen && !isPathingMode &&
                    (controlMode === 'master' || (e.actorId || e.id) === selectedActorId);
                  return (
                    <div
                      key={e.id}
                      className="absolute z-20 pointer-events-none"
                      style={{
                        left: `${((pos[0] + 0.5) / 16) * 100}%`,
                        top: `${((pos[1] + 0.5) / 12) * 100}%`,
                        transition: isDragged ? 'none' : 'left 480ms ease-out, top 480ms ease-out',
                      }}
                    >
                      <div
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (replayOpen || drag?.moved) return;
                          setSelectedActorId(e.actorId || e.id);
                          playSfx('dice_roll');
                        }}
                        onPointerDown={(ev) => startDrag(ev, e)}
                        className={`-translate-x-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-[10px] text-white shadow-lg transition-transform hover:scale-110 pointer-events-auto ${
                          isDead
                            ? 'bg-stone-700 opacity-40 border border-stone-600'
                            : e.role === 'player'
                            ? 'bg-purple-600 ring-2 ring-purple-400'
                            : e.role === 'npc'
                            ? 'bg-emerald-600 ring-2 ring-emerald-400'
                            : 'bg-red-600 ring-2 ring-red-400'
                        } ${isReplayActor ? 'scale-125 shadow-[0_0_18px_rgba(212,175,55,0.95)] ring-[#d4af37]' : ''} ${
                          isDragged ? 'scale-110 ring-2 ring-sky-400 opacity-85 cursor-grabbing' : ''
                        } ${dragAllowed ? 'cursor-grab' : 'cursor-pointer'}`}
                        title={`${e.name} (${e.hp}/${e.maxHp} HP)${dragAllowed ? ' — потяните, чтобы переместить' : ''}`}
                      >
                        {isDead ? (
                          <Skull className="w-3.5 h-3.5 text-stone-300" />
                        ) : (
                          e.name.substring(0, 2).toUpperCase()
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Floating popup текущего кадра: урон, лечение, крит, промах */}
                {replayOpen && currentFrame?.popup && (() => {
                  const p = currentFrame.popup;
                  const ent = viewEntities.find(e => e.id === p.entityId);
                  if (!ent) return null;
                  const toneCls =
                    p.tone === 'damage' ? 'text-red-400'
                    : p.tone === 'heal' ? 'text-emerald-400'
                    : p.tone === 'crit' ? 'text-amber-300'
                    : p.tone === 'miss' ? 'text-zinc-400'
                    : 'text-purple-300';
                  return (
                    <div
                      key={`popup-${currentFrame.eventIndex}`}
                      className="absolute z-30 pointer-events-none animate-fade-in"
                      style={{
                        left: `${((ent.pos[0] + 0.5) / 16) * 100}%`,
                        top: `${((ent.pos[1] + 0.5) / 12) * 100}%`,
                      }}
                    >
                      <div className={`-translate-x-1/2 -translate-y-[230%] text-sm font-black whitespace-nowrap drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] ${toneCls}`}>
                        {p.text}
                      </div>
                    </div>
                  );
                })()}

                {/* Всплеск частиц: крит и урон рвутся искрами из цели (детерминированный) */}
                {replayOpen && currentFrame?.burst && (() => {
                  const b = currentFrame.burst;
                  const ent = viewEntities.find(e => e.id === b.entityId);
                  if (!ent) return null;
                  const particles = spawnParticles(currentFrame.eventIndex + 1, b.intensity);
                  const color = b.intensity >= 2 ? '#fbbf24' : '#f87171';
                  return (
                    <div
                      key={`burst-${currentFrame.eventIndex}`}
                      className="absolute z-30 pointer-events-none"
                      style={{
                        left: `${((ent.pos[0] + 0.5) / 16) * 100}%`,
                        top: `${((ent.pos[1] + 0.5) / 12) * 100}%`,
                      }}
                    >
                      {particles.map((pt, i) => (
                        <span
                          key={i}
                          className="ce-particle rounded-full"
                          style={{
                            width: pt.size,
                            height: pt.size,
                            background: color,
                            boxShadow: `0 0 6px ${color}`,
                            '--ce-dx': `${pt.dx}px`,
                            '--ce-dy': `${pt.dy}px`,
                            animationDelay: `${pt.delay}ms`,
                          } as React.CSSProperties}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Cinematic Replay Ticker */}
            {replayOpen && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#0c0c0c] border border-[#d4af37]/30 rounded-xl text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Clapperboard className="w-4 h-4 text-[#d4af37] shrink-0" />
                  <span className="font-mono text-[#f4f4f5] truncate">{replayCaption}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-[#71717a] px-1">
                    {Math.min(replayIdx, replayFrames.length)}/{replayFrames.length}
                  </span>
                  <button
                    onClick={() => setReplayPlaying(p => !p)}
                    disabled={replayIdx >= replayFrames.length}
                    className="px-2 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#27272a] transition disabled:opacity-40"
                    title={replayPlaying ? 'Пауза' : 'Играть'}
                  >
                    {replayPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={replayStep}
                    disabled={replayIdx >= replayFrames.length}
                    className="px-2 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] transition disabled:opacity-40"
                    title="Один кадр вперёд"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setReplaySpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                    className="px-2 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#27272a] font-mono transition"
                    title="Скорость воспроизведения"
                  >
                    ×{replaySpeed}
                  </button>
                  <button
                    onClick={handleReplaySkipAll}
                    className="px-2 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] transition"
                    title="Применить всё сразу"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleReplayClose}
                    className="px-2 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#71717a] hover:text-[#f4f4f5] border border-[#27272a] transition"
                    title="Закрыть реплей"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Selected Unit Quick Controller */}
            {selectedEntity && (
              <div className="p-3.5 bg-[#0c0c0c] border border-[#27272a] rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedEntity.avatarUrl}
                    alt={selectedEntity.name}
                    className="w-10 h-10 rounded-xl object-cover border border-[#27272a]"
                  />
                  <div>
                    <div className="font-bold text-[#f4f4f5] flex items-center gap-2">
                      <span>{selectedEntity.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        selectedEntity.role === 'player'
                          ? 'bg-purple-950 text-purple-300'
                          : selectedEntity.role === 'npc'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-red-950 text-red-300'
                      }`}>
                        {selectedEntity.role === 'player' ? 'Игрок' : selectedEntity.role === 'npc' ? 'Союзник' : 'Враг'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#a1a1aa] font-mono">
                      КД: {selectedEntity.ac} • Скорость: {selectedEntity.speed} кл. • Позиция: [{selectedEntity.pos[0]},{selectedEntity.pos[1]}]
                    </div>
                  </div>
                </div>

                {/* HP Adjuster */}
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-[#a1a1aa]">HP:</span>
                  <button
                    onClick={() => {
                      onUpdateEntity?.(selectedEntity.id, {
                        hp: Math.max(0, selectedEntity.hp - 2),
                        status: selectedEntity.hp - 2 <= 0 ? 'Dead' : selectedEntity.status,
                      });
                      playSfx('sword_slash');
                    }}
                    className="px-2 py-1 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 rounded font-bold"
                    title="-2 урона"
                  >
                    -2
                  </button>
                  <span className="font-bold text-[#f4f4f5] px-2 py-0.5 bg-[#18181b] border border-[#27272a] rounded">
                    {selectedEntity.hp} / {selectedEntity.maxHp}
                  </span>
                  <button
                    onClick={() => {
                      onUpdateEntity?.(selectedEntity.id, {
                        hp: Math.min(selectedEntity.maxHp, selectedEntity.hp + 2),
                        status: 'Alive',
                      });
                      playSfx('shield_block');
                    }}
                    className="px-2 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded font-bold"
                    title="+2 лечения"
                  >
                    +2
                  </button>

                  {/* Status Dropdown */}
                  <select
                    value={selectedEntity.status}
                    onChange={e => onUpdateEntity?.(selectedEntity.id, { status: e.target.value as any })}
                    className="bg-[#18181b] border border-[#27272a] text-[#d4d4d8] text-xs rounded p-1"
                  >
                    <option value="Alive">Жив</option>
                    <option value="Wounded">Ранен</option>
                    <option value="Stunned">Оглушен</option>
                    <option value="Unconscious">Без сознания</option>
                    <option value="Dead">Мертв</option>
                  </select>

                  {/* Remove unit if monster */}
                  {selectedEntity.role === 'enemy' && (
                    <button
                      onClick={() => onRemoveEntity?.(selectedEntity.id)}
                      className="p-1.5 text-[#71717a] hover:text-red-400 rounded transition"
                      title="Удалить монстра с поля боя"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Unit Roster List */}
          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-4 shadow-xl space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[#d4af37] font-mono flex items-center justify-between">
              <span>Состав сил на поле боя (Roster)</span>
              <span className="text-[#71717a] font-normal">
                Герои: {players.length} • Враги: {enemies.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {entities.map(e => {
                const isSelected = selectedEntity && selectedEntity.id === e.id;
                return (
                  <div
                    key={e.id}
                    onClick={() => {
                      setSelectedActorId(e.actorId || e.id);
                      playSfx('dice_roll');
                    }}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between text-xs ${
                      isSelected
                        ? 'bg-[#18181b] border-[#d4af37] text-[#d4af37] font-bold shadow'
                        : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#f4f4f5]'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-bold text-[#f4f4f5] truncate">{e.name}</div>
                      <div className="text-[10px] text-[#71717a] font-mono">
                        HP: {e.hp}/{e.maxHp} • КД {e.ac}
                      </div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      e.status === 'Dead'
                        ? 'bg-stone-800 text-stone-400'
                        : e.role === 'player'
                        ? 'bg-purple-950 text-purple-300'
                        : 'bg-red-950 text-red-300'
                    }`}>
                      {e.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Action Intent & Roleplay Builder (4 cols) */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#d4af37] font-mono flex items-center gap-1.5">
                <Sword className="w-4 h-4" />
                Формирование намерения (Intent)
              </span>
              <span className="text-[10px] text-purple-400 font-mono">RFC 5322 EML</span>
            </div>

            {/* Action Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#d4d4d8]">Действие раунда:</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setActionType('cast_spell')}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    actionType === 'cast_spell'
                      ? 'bg-purple-950/80 border-purple-600 text-purple-300 font-bold'
                      : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa]'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  Заклинание
                </button>
                <button
                  onClick={() => setActionType('attack')}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    actionType === 'attack'
                      ? 'bg-amber-950/80 border-amber-600 text-amber-300 font-bold'
                      : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa]'
                  }`}
                >
                  <Sword className="w-3.5 h-3.5" />
                  Атака оружием
                </button>
                <button
                  onClick={() => setActionType('dodge')}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    actionType === 'dodge'
                      ? 'bg-sky-950/80 border-sky-600 text-sky-300 font-bold'
                      : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa]'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Уклонение
                </button>
                <button
                  onClick={() => setActionType('help')}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    actionType === 'help'
                      ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300 font-bold'
                      : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa]'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" />
                  Помощь союзнику
                </button>
              </div>
            </div>

            {/* Spell Details if Cast Spell */}
            {actionType === 'cast_spell' && (
              <div className="space-y-3 p-3 bg-[#0c0c0c] border border-[#27272a] rounded-xl text-xs">
                <div>
                  <label className="text-[11px] text-[#a1a1aa]">Выбор заклинания (3 уровень волшебника):</label>
                  <select
                    value={selectedSpell}
                    onChange={e => setSelectedSpell(e.target.value)}
                    className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-xs text-[#f4f4f5] mt-1"
                  >
                    <option value="Scorching Ray">Опаляющий луч (Scorching Ray) - 3 луча 2d6 огня</option>
                    <option value="Magic Missile">Волшебная стрела (Magic Missile) - 3× (1d4+1)</option>
                    <option value="Fireball">Огненный шар (Fireball) - 8d6 огня по площади</option>
                  </select>
                </div>

                {/* Fallback Condition */}
                <div>
                  <label className="text-[11px] text-[#a1a1aa]">Условие перенаправления (Fallback Trigger):</label>
                  <input
                    type="text"
                    value={fallbackTrigger}
                    onChange={e => setFallbackTrigger(e.target.value)}
                    className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-xs font-mono text-[#d4af37] mt-1"
                    placeholder="target_mob_shaman_dead_before_turn"
                  />
                  <div className="text-[10px] text-[#71717a] mt-1">
                    ↳ Если цель погибла до хода, лучи перенаправятся во второстепенного врага.
                  </div>
                </div>
              </div>
            )}

            {/* Weapon Details if Attack */}
            {actionType === 'attack' && (
              <div className="p-3 bg-[#0c0c0c] border border-[#27272a] rounded-xl text-xs">
                <label className="text-[11px] text-[#a1a1aa]">Оружие {selectedEntity?.name ?? ''}:</label>
                <select
                  value={selectedWeapon || (selectedEntity?.weapons ?? [])[0]?.name || ''}
                  onChange={e => setSelectedWeapon(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-xs text-[#f4f4f5] mt-1"
                >
                  {(selectedEntity?.weapons ?? []).length === 0 && <option value="">Кулаки (1)</option>}
                  {(selectedEntity?.weapons ?? []).map(w => (
                    <option key={w.name} value={w.name}>
                      {w.name} ({w.damageDice ?? w.damage}, дистанция {w.range})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Shared Target for attack / cast_spell / help */}
            {(actionType === 'attack' || actionType === 'cast_spell' || actionType === 'help') && (
              <div>
                <label className="text-xs font-medium text-[#d4d4d8]">
                  {actionType === 'help' ? 'Кому помогаем (следующая атака с преимуществом):' : 'Основная цель (Primary Target):'}
                </label>
                <select
                  value={primaryTargetId}
                  onChange={e => setPrimaryTargetId(e.target.value)}
                  className={`w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-xs mt-1.5 ${
                    actionType === 'help' ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  {(actionType === 'help' ? players : enemies).map(t => (
                    <option key={t.id} value={t.actorId || t.id}>
                      {t.name} (HP {t.hp}/{t.maxHp})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Roleplay speech line */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#d4d4d8] flex items-center justify-between">
                <span>Прямая речь в раунде (Roleplay):</span>
                <span className="text-[10px] text-[#d4af37] font-mono">Аудио + Текст</span>
              </label>
              <textarea
                value={speech}
                onChange={e => setSpeech(e.target.value)}
                rows={2}
                className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5] focus:outline-none focus:border-[#d4af37] transition font-sans"
              />
            </div>

            {/* Audio Voice Recorder + Synthesizer Preview */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-[#0c0c0c] border border-[#27272a] rounded-xl text-xs">
              <button
                onClick={handleToggleRecord}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition ${
                  isRecording
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a]'
                }`}
              >
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-red-400" />}
                {isRecording ? `Запись (${recordingSeconds}с)` : 'Голос игрока'}
              </button>

              <button
                onClick={handleTestSpeechPlayback}
                className="px-3 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#27272a] font-semibold flex items-center gap-1.5 transition"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Озвучить речь
              </button>
            </div>

            {/* Transmit Intent to DM EML Vault */}
            <div className="space-y-2 pt-2 border-t border-[#27272a]">
              <button
                onClick={handleSendIntent}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition active:scale-95"
              >
                <Send className="w-4 h-4" />
                Отправить намерение Мастеру (.EML)
              </button>

              {isTransmitted && (
                <div className="p-2.5 bg-emerald-950/80 border border-emerald-700 rounded-xl text-emerald-200 text-xs text-center font-semibold animate-fade-in flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  EML капсула запечатана и отправлена в Vault!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Monster Spawner Modal */}
      {isSpawnModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#27272a] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                Призвать существо на поле боя
              </h3>
              <button
                onClick={() => setIsSpawnModalOpen(false)}
                className="text-[#a1a1aa] hover:text-[#f4f4f5] text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[#a1a1aa] block mb-1">Шаблон существа:</label>
                <select
                  value={newUnitType}
                  onChange={e => {
                    const t = e.target.value as any;
                    setNewUnitType(t);
                    if (t === 'goblin_archer') {
                      setNewUnitName('Гоблин-лазутчик #2');
                      setNewUnitHp(14);
                      setNewUnitAc(13);
                    } else if (t === 'skeleton_warrior') {
                      setNewUnitName('Скелет-хранитель крипты');
                      setNewUnitHp(18);
                      setNewUnitAc(14);
                    } else if (t === 'hell_hound') {
                      setNewUnitName('Пепельная гончая');
                      setNewUnitHp(26);
                      setNewUnitAc(15);
                    } else {
                      setNewUnitName('Сэр Роланд (НПС Паладин)');
                      setNewUnitHp(32);
                      setNewUnitAc(18);
                    }
                  }}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5]"
                >
                  <option value="goblin_archer">Гоблин-лазутчик (HP: 14, AC: 13)</option>
                  <option value="skeleton_warrior">Скелет-хранитель (HP: 18, AC: 14)</option>
                  <option value="hell_hound">Пепельная гончая (HP: 26, AC: 15)</option>
                  <option value="npc_paladin">Сэр Роланд - Паладин союзник (HP: 32, AC: 18)</option>
                </select>
              </div>

              <div>
                <label className="text-[#a1a1aa] block mb-1">Имя существа:</label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#a1a1aa] block mb-1">Хиты (HP):</label>
                  <input
                    type="number"
                    value={newUnitHp}
                    onChange={e => setNewUnitHp(Number(e.target.value))}
                    className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <label className="text-[#a1a1aa] block mb-1">Класс доспеха (AC):</label>
                  <input
                    type="number"
                    value={newUnitAc}
                    onChange={e => setNewUnitAc(Number(e.target.value))}
                    className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#a1a1aa] block mb-1">Координата X (0-15):</label>
                  <input
                    type="number"
                    value={newUnitPos[0]}
                    onChange={e => setNewUnitPos([Number(e.target.value), newUnitPos[1]])}
                    className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <label className="text-[#a1a1aa] block mb-1">Координата Y (0-11):</label>
                  <input
                    type="number"
                    value={newUnitPos[1]}
                    onChange={e => setNewUnitPos([newUnitPos[0], Number(e.target.value)])}
                    className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#f4f4f5]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272a]">
              <button
                onClick={() => setIsSpawnModalOpen(false)}
                className="px-4 py-2 bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] rounded-xl text-xs font-semibold transition"
              >
                Отмена
              </button>
              <button
                onClick={handleSpawnUnitSubmit}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                Поместить на карту
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
