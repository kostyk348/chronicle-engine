import React, { useState, useRef } from 'react';
import {
  Entity,
  MasterStatePayload,
  Chapter,
  EmotionType,
} from '../types/chronicle';
import {
  Feather,
  BookOpen,
  Volume2,
  Mic,
  MicOff,
  Sparkles,
  Zap,
  Play,
  Crown,
  Compass,
  CheckCircle2,
  Download,
  Plus,
  Trash2,
  Save,
  MessageSquare,
  Gift,
  Coins,
  Shield,
  FileText,
  Clock,
  Layers,
} from 'lucide-react';
import { buildMasterResolutionEml, downloadEmlFile } from '../utils/mimeEml';
import { playSfx, speakSpeechText, stopAllSpeech } from '../utils/audioSynthesizer';
import { ActiveTab } from './Header';

interface DMScribeStudioProps {
  round: number;
  entities: Entity[];
  combatStatus: 'Ongoing' | 'Ended_Victory' | 'Ended_Defeat' | 'Fled';
  mechanicalLogs: string[];
  suggestedProse: string;
  onPublishResolution: (rawEml: string, state: MasterStatePayload, prose: string) => void;
  onAdvanceRound?: () => void;
  onSimulateWegoRound?: () => Promise<void>;
  onNavigateToTab?: (tab: ActiveTab) => void;
  chapters?: Chapter[];
  onSaveChapter?: (chapter: Chapter) => void;
  onCreateChapter?: (chapter: Chapter) => void;
}

export const DMScribeStudio: React.FC<DMScribeStudioProps> = ({
  round,
  entities,
  combatStatus,
  mechanicalLogs,
  suggestedProse,
  onPublishResolution,
  onAdvanceRound,
  onSimulateWegoRound,
  onNavigateToTab,
  chapters = [],
  onSaveChapter,
  onCreateChapter,
}) => {
  const [activeStep, setActiveStep] = useState<number>(3); // 1: Intents, 2: WEGO, 3: Prose/Chapter Studio, 4: Audio/Publish
  const [proseText, setProseText] = useState<string>(
    suggestedProse ||
      `Воздух в крипте задрожал от запаха озона. Шаман гоблинов вскинул костяной посох, но не успел закончить заклятие: огненные лучи Елены пробили его грудь. Секундой позже тяжелая секира Торина опустилась на каменный алтарь, поставив точку в этом сражении...`
  );

  // Chapter Creation & Arbitrary Editing State
  const [selectedChapterRound, setSelectedChapterRound] = useState<number>(round);
  const [chapterTitle, setChapterTitle] = useState<string>('Глава III. Сокрушение Алтаря');
  const [chapterSubtitle, setChapterSubtitle] = useState<string>('Раунд 3: Развязка битвы в святилище');
  const [prosePage2Text, setProsePage2Text] = useState<string>(
    'Победоносная тишина опустилась на древнюю усыпальницу. Из расколотого алтаря обнажился потайной сундук, запечатанный серебряной руной Древних Королей...'
  );
  const [masterNotes, setMasterNotes] = useState<string>(
    'Освещение: Тусклое от факелов. Препятствия: Каменные саркофаги. Температура воздуха: Ледяная.'
  );

  // Loot & XP Rewards State
  const [rewardXp, setRewardXp] = useState<number>(450);
  const [rewardCoins, setRewardCoins] = useState<string>('35 зм, 80 см, 120 мм');
  const [rewardItems, setRewardItems] = useState<string[]>([
    'Костяной жезл шамана (+1 к заклинаниям некромантии)',
    'Зелье исцеления (2d4+2 HP)',
    'Старинный ключ с гравировкой ворона',
  ]);
  const [newItemInput, setNewItemInput] = useState<string>('');

  // Roleplay Quotes Editor State
  const [roleplayQuotes, setRoleplayQuotes] = useState<
    {
      actorName: string;
      actorClass: string;
      speech: string;
      thought: string;
      flavor: string;
      emotion: EmotionType;
    }[]
  >([
    {
      actorName: 'Елена (Elena)',
      actorClass: 'Волшебница 3 ур.',
      speech: '«Пепел к пеплу, тварь! Попробуй это пламя!»',
      thought: 'Лишь бы воин успел прикрыть правый фланг...',
      flavor: 'Елена отступает в тень саркофага, на ладонях разгорается ослепительное пламя.',
      emotion: 'furious',
    },
    {
      actorName: 'Торин (Torin)',
      actorClass: 'Воин 3 ур.',
      speech: '«За предков! Расколи эту скверну в щепки!»',
      thought: 'Этот алтарь питает их нечестивую силу...',
      flavor: 'Торин с боевым кличем обрушивает двуручную секиру на базальтовый постамент.',
      emotion: 'triumphant',
    },
  ]);

  const [newQuoteActor, setNewQuoteActor] = useState<string>('Валериус (Valerius)');
  const [newQuoteClass, setNewQuoteClass] = useState<string>('Жрец 3 ур.');
  const [newQuoteSpeech, setNewQuoteSpeech] = useState<string>('«Да пребудет с нами благословение Света!»');
  const [newQuoteThought, setNewQuoteThought] = useState<string>('Раны глубоки, но мы выстоим.');
  const [newQuoteFlavor, setNewQuoteFlavor] = useState<string>('Воздевает святой символ к сводам зала.');
  const [newQuoteEmotion, setNewQuoteEmotion] = useState<EmotionType>('calm');

  // Sound Studio State
  const [isRecordingNarration, setIsRecordingNarration] = useState<boolean>(false);
  const [narrationSeconds, setNarrationSeconds] = useState<number>(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Synonym & Lexicon helper tool
  const [selectedWord, setSelectedWord] = useState<string>('алтарь');

  const timerRef = useRef<any>(null);

  // Sync when chapters array or selected round changes
  const activeChapterData = chapters.find(c => c.round === selectedChapterRound);

  const handleSelectChapter = (chRound: number) => {
    setSelectedChapterRound(chRound);
    const found = chapters.find(c => c.round === chRound);
    if (found) {
      setChapterTitle(found.title);
      setChapterSubtitle(found.subtitle);
      setProseText(found.prose);
      setProsePage2Text(found.prosePage2 || '');
      setMasterNotes(found.masterNotes || '');
      if (found.roleplayQuotes && found.roleplayQuotes.length > 0) {
        setRoleplayQuotes(found.roleplayQuotes);
      }
      if (found.lootReward) {
        setRewardXp(found.lootReward.xp || 300);
        setRewardCoins(found.lootReward.coins || '');
        setRewardItems(found.lootReward.items || []);
      }
    }
    playSfx('dice_roll');
  };

  const handleCreateNewChapterArbitrary = () => {
    const nextRoundNum = (chapters.length > 0 ? Math.max(...chapters.map(c => c.round)) : round) + 1;
    const newCh: Chapter = {
      round: nextRoundNum,
      title: `Глава ${nextRoundNum}. Новые тайны Катакомб`,
      subtitle: `Раунд ${nextRoundNum}: Исследование нижнего яруса`,
      prose: `Эхо шагов героев разносилось под сводами древней усыпальницы. Воздух становился холоднее с каждым шагом, а на замшелых плитах пола проступали светящиеся руны...`,
      prosePage2: `Впереди замаячил высокий арочный проход, за которым слышался глухой рокот подземной реки. Торин поднял факел выше, озаряя путь для своих спутников.`,
      roleplayQuotes: [
        {
          actorName: 'Торин (Воин)',
          actorClass: '3 ур.',
          speech: '«Держите оружие наготове. Здесь пахнет засадой...»',
          thought: 'Мой топор жаждет новой битвы.',
          flavor: 'Воин делает шаг вперед, закрывая волшебницу щитом.',
          emotion: 'focused',
        },
      ],
      battleLogSummary: [
        '⚔️ Отряд вошел в новую локацию',
        '👁️ Проверка Внимательности (DC 14): Успех',
      ],
      artworks: [],
      masterNotes: 'Зона высокой опасности. Ловушка с нажимной плитой на клетке [4,5].',
      lootReward: {
        xp: 350,
        coins: '25 зм, 40 см',
        items: ['Древний свиток с печатью', 'Фляга с эльфийским элем'],
      },
    };

    onCreateChapter?.(newCh);
    setSelectedChapterRound(nextRoundNum);
    setChapterTitle(newCh.title);
    setChapterSubtitle(newCh.subtitle);
    setProseText(newCh.prose);
    setProsePage2Text(newCh.prosePage2 || '');
    setRoleplayQuotes(newCh.roleplayQuotes);
    setRewardXp(350);
    setRewardCoins('25 зм, 40 см');
    setRewardItems(newCh.lootReward?.items || []);
    playSfx('shield_block');

    setSaveToast(`✨ Создана новая глава ${nextRoundNum}!`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleSaveCurrentChapter = () => {
    const updatedChapter: Chapter = {
      round: selectedChapterRound,
      title: chapterTitle,
      subtitle: chapterSubtitle,
      prose: proseText,
      prosePage2: prosePage2Text,
      roleplayQuotes: roleplayQuotes,
      battleLogSummary: activeChapterData?.battleLogSummary || mechanicalLogs.slice(0, 5),
      artworks: activeChapterData?.artworks || [],
      masterNotes: masterNotes,
      lootReward: {
        xp: rewardXp,
        coins: rewardCoins,
        items: rewardItems,
      },
    };

    onSaveChapter?.(updatedChapter);
    playSfx('fire_spell');
    setSaveToast(`💾 Глава "${chapterTitle}" успешно сохранена в книгу!`);
    setTimeout(() => setSaveToast(null), 3500);
  };

  const handleAddLootItem = () => {
    if (!newItemInput.trim()) return;
    setRewardItems(prev => [...prev, newItemInput.trim()]);
    setNewItemInput('');
    playSfx('dice_roll');
  };

  const handleRemoveLootItem = (idx: number) => {
    setRewardItems(prev => prev.filter((_, i) => i !== idx));
    playSfx('dice_roll');
  };

  const handleAddRoleplayQuote = () => {
    if (!newQuoteSpeech.trim()) return;
    setRoleplayQuotes(prev => [
      ...prev,
      {
        actorName: newQuoteActor,
        actorClass: newQuoteClass,
        speech: newQuoteSpeech,
        thought: newQuoteThought,
        flavor: newQuoteFlavor,
        emotion: newQuoteEmotion,
      },
    ]);
    setNewQuoteSpeech('');
    setNewQuoteThought('');
    setNewQuoteFlavor('');
    playSfx('dice_roll');
  };

  const handleRemoveRoleplayQuote = (index: number) => {
    setRoleplayQuotes(prev => prev.filter((_, i) => i !== index));
    playSfx('dice_roll');
  };

  const prosePresets: { label: string; icon: string; text: string }[] = [
    {
      label: 'Героический триумф',
      icon: '⚔️',
      text: `Воздух в крипте задрожал от запаха озона и паленой шерсти. Шаман гоблинов в экстазе вскинул костяной посох, раскрывая пасть в беззвучном вопле триумфа, но завершить темное речение ему было не суждено. Из-за каменного саркофага выступила Елена: три снопа ослепительного пламени Scorching Ray насквозь прожгли его грудь.

Секундой позже сокрушительная секира Торина разрубила оскверненный базальтовый алтарь, развеяв вековое проклятие Одинокого Пика. Каменный монолит раскололся надвое с оглушительным треском, осыпая зал угасающими искрами.

Победоносная тишина опустилась на древнюю усыпальницу, а из расколотого алтаря обнажился тайный проход в неизведанные глубины катакомб.`,
    },
    {
      label: 'Тяжелая победа',
      icon: '🩸',
      text: `Кровь и пепел смешались на вековых каменных плитах. Елена тяжело опустилась на колено возле надгробия, прижимая обожженную руку к раненому плечу и восстанавливая сбитое дыхание. Торин вытер окровавленное лезвие топора о плащ павшего шамана, обводя зал настороженным взглядом.

Битва выиграна, но цена этой победы эхом отзывается в темных сводах гробницы. Вражеские стрелы оставили глубокие борозды на щите воина, а в воздухе все еще витал горький ядовитый туман.

Перевязав раны и сотворив защитные обереги, герои приготовились к исследованию нижнего яруса святилища.`,
    },
    {
      label: 'Мрачная тайна',
      icon: '🌑',
      text: `Когда последний гоблинский дозорный упал замертво, в зале воцарилась противоестественная, вязкая тишина. Из глубоких трещин расколотого алтаря потянулся густой сиреневый дым, складываясь в очертания незнакомого рунического символа древних некромантов.

Торин медленно опустил клинок, вглядываясь в пульсирующее марево. Елена осторожно приблизилась, держа посох наготове, и узнала в знаке печать Темного Разлома.

Герои поняли: эта усыпальница была лишь внешним рубежом, охранявшим куда более зловещую тайну подгорного королевства.`,
    },
    {
      label: 'Магический катаклизм',
      icon: '⚡',
      text: `Вспышка высвобожденной арканной энергии озарила крипту ослепительным полуденным светом. Волна раскаленного жара и ударного воздуха смела алтарные подсвечники и обратила гоблинских стражей в прах за долю секунды.

Магия бушевала еще несколько мгновений, оставив на базальтовых стенах оплавленный камень, вихри искр и тяжелый запах грозового озона.

Когда сияние угасло, на месте алтаря осталась лишь оплавленная воронка, обнажившая сияющий древний кристалл.`,
    },
  ];

  const synonymsMap: Record<string, string[]> = {
    алтарь: ['жертвенник', 'святилище', 'каменное капище', 'постамент праха'],
    огонь: ['пламя', 'огненный вихрь', 'опаляющий сноп', 'багровое зарево', 'языки пламени'],
    секира: ['двуручный топор', 'тяжелый палаш', 'кованое лезвие', 'раскалывающее стальное острие'],
    крипта: ['усыпальница', 'катакомбы', 'склеп', 'древнее подземелье', 'погребальный свод'],
    шаман: ['некромант пепла', 'жрец культа', 'костяной ведун', 'гоблинский заклинатель'],
  };

  const handleToggleNarrationRecord = () => {
    if (isRecordingNarration) {
      clearInterval(timerRef.current);
      setIsRecordingNarration(false);
      playSfx('shield_block');
    } else {
      setIsRecordingNarration(true);
      setNarrationSeconds(0);
      playSfx('dice_roll');
      timerRef.current = setInterval(() => {
        setNarrationSeconds(s => s + 1);
      }, 1000);
    }
  };

  const handlePlayVoicePreview = () => {
    if (isPlayingPreview) {
      stopAllSpeech();
      setIsPlayingPreview(false);
    } else {
      setIsPlayingPreview(true);
      playSfx('dungeon_intro');
      setTimeout(() => {
        speakSpeechText(proseText, 0.9, 0.95).then(() => setIsPlayingPreview(false));
      }, 800);
    }
  };

  const handlePublishAndAdvance = () => {
    const statePayload: MasterStatePayload = {
      round,
      combat_status: combatStatus,
      entities: entities.map(e => ({
        id: e.id,
        hp: e.hp,
        max_hp: e.maxHp,
        pos: e.pos,
        status: e.status,
      })),
      mechanical_log: mechanicalLogs,
    };

    const rawEml = buildMasterResolutionEml(
      {
        from: 'Dungeon Master <dm@chronicle.local>',
        to: 'Party <party@chronicle.local>',
        subject: `[Round ${round}] Resolution: ${proseText.substring(0, 35)}...`,
        messageId: `<round-${round.toString().padStart(2, '0')}-resolution@vault.local>`,
        round,
      },
      statePayload,
      proseText
    );

    // Save chapter to book
    handleSaveCurrentChapter();

    onPublishResolution(rawEml, statePayload, proseText);
    setIsPublished(true);
    playSfx('fire_spell');

    // Auto advance round
    setTimeout(() => {
      setIsPublished(false);
      onAdvanceRound?.();
    }, 2500);
  };

  const handleDownloadResolutionEml = () => {
    const statePayload: MasterStatePayload = {
      round,
      combat_status: combatStatus,
      entities: entities.map(e => ({
        id: e.id,
        hp: e.hp,
        max_hp: e.maxHp,
        pos: e.pos,
        status: e.status,
      })),
      mechanical_log: mechanicalLogs,
    };

    const rawEml = buildMasterResolutionEml(
      {
        from: 'Dungeon Master <dm@chronicle.local>',
        to: 'Party <party@chronicle.local>',
        subject: `[Round ${round}] Resolution: ${chapterTitle}`,
        messageId: `<round-${round.toString().padStart(2, '0')}-resolution@vault.local>`,
        round,
      },
      statePayload,
      proseText
    );

    downloadEmlFile(`Master_Resolution_R${round}`, rawEml);
  };

  return (
    <div id="dm-scribe-studio-root" className="space-y-6">
      {/* Visual Round Phase Flow Bar */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-4 shadow-lg">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#d4af37] font-mono mb-2 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-[#d4af37]" />
          <span>Шкала фаз конвейера хроники (Round Execution Pipeline):</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div className="bg-[#121212] border border-[#27272a] rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#d4af37]/20 text-[#d4af37] flex items-center justify-center font-bold text-[10px]">
              1
            </span>
            <div>
              <div className="font-bold text-[#f4f4f5]">Приказы игроков</div>
              <div className="text-[10px] text-[#a1a1aa]">Сбор намерений</div>
            </div>
          </div>

          <div className="bg-[#121212] border border-[#27272a] rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#d4af37]/20 text-[#d4af37] flex items-center justify-center font-bold text-[10px]">
              2
            </span>
            <div>
              <div className="font-bold text-[#f4f4f5]">EML Vault</div>
              <div className="text-[10px] text-[#a1a1aa]">Запечатывание</div>
            </div>
          </div>

          <div className="bg-[#121212] border border-[#27272a] rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#d4af37]/20 text-[#d4af37] flex items-center justify-center font-bold text-[10px]">
              3
            </span>
            <div>
              <div className="font-bold text-[#f4f4f5]">WEGO Битва</div>
              <div className="text-[10px] text-[#a1a1aa]">Броски D20</div>
            </div>
          </div>

          <div className="bg-[#d4af37]/10 border border-[#d4af37] rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#d4af37] text-[#0c0c0c] flex items-center justify-center font-bold text-[10px]">
              4
            </span>
            <div>
              <div className="font-bold text-[#d4af37]">Написание главы</div>
              <div className="text-[10px] text-[#d4af37]/80">Проза & Трофеи</div>
            </div>
          </div>

          <div className="bg-[#121212] border border-[#27272a] rounded-xl p-2.5 flex items-center gap-2 col-span-2 sm:col-span-1">
            <span className="w-5 h-5 rounded-full bg-[#d4af37]/20 text-[#d4af37] flex items-center justify-center font-bold text-[10px]">
              5
            </span>
            <div>
              <div className="font-bold text-[#f4f4f5]">Печать и Озвучка</div>
              <div className="text-[10px] text-[#a1a1aa]">Typst PDF & M4B</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top DM Studio Header */}
      <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#d4af37]/10 border border-[#d4af37]/40 rounded-2xl text-[#d4af37] shadow-inner">
              <Crown className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#f4f4f5] tracking-tight">
                  Кабинет Мастера Подземелий (DM Studio)
                </h2>
                <span className="text-xs bg-[#18181b] border border-[#d4af37]/50 text-[#d4af37] px-2.5 py-0.5 rounded-md font-mono font-bold">
                  Раунд {round}
                </span>
                <span className="text-xs bg-emerald-950/80 border border-emerald-700 text-emerald-300 px-2 py-0.5 rounded-md font-mono font-semibold">
                  WEGO State: {combatStatus}
                </span>
              </div>
              <p className="text-xs text-[#a1a1aa] mt-0.5">
                Полноценное управление главами книги, прозой, отыгрышем героев, трофеями раунда и запечатыванием в EML
              </p>
            </div>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => onNavigateToTab?.('tactical')}
              className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] font-semibold flex items-center gap-1.5 transition"
            >
              <Compass className="w-4 h-4 text-[#d4af37]" />
              Тактическая карта
            </button>
            <button
              onClick={() => onNavigateToTab?.('party')}
              className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] font-semibold flex items-center gap-1.5 transition"
            >
              <Shield className="w-4 h-4 text-emerald-400" />
              Герои и Инвентарь
            </button>
            <button
              onClick={() => onNavigateToTab?.('book')}
              className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] font-semibold flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-4 h-4 text-purple-400" />
              Книга кампании
            </button>
          </div>
        </div>

        {/* Guided Master Pipeline Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-[#27272a]">
          <button
            onClick={() => setActiveStep(1)}
            className={`p-3 rounded-xl border text-left transition ${
              activeStep === 1
                ? 'bg-[#18181b] border-[#d4af37] text-[#d4af37] shadow'
                : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa] hover:bg-[#18181b]'
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold">Шаг 1</div>
            <div className="text-xs font-bold text-[#f4f4f5] mt-0.5">Намерения партии</div>
            <div className="text-[10px] text-[#71717a]">EML капсулы игроков</div>
          </button>

          <button
            onClick={() => setActiveStep(2)}
            className={`p-3 rounded-xl border text-left transition ${
              activeStep === 2
                ? 'bg-[#18181b] border-[#d4af37] text-[#d4af37] shadow'
                : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa] hover:bg-[#18181b]'
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold">Шаг 2</div>
            <div className="text-xs font-bold text-[#f4f4f5] mt-0.5">Тактический расчет</div>
            <div className="text-[10px] text-[#71717a]">WEGO лог и броски D20</div>
          </button>

          <button
            onClick={() => setActiveStep(3)}
            className={`p-3 rounded-xl border text-left transition ${
              activeStep === 3
                ? 'bg-[#18181b] border-[#d4af37] text-[#d4af37] shadow'
                : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa] hover:bg-[#18181b]'
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold">Шаг 3 (Основной)</div>
            <div className="text-xs font-bold text-[#f4f4f5] mt-0.5">Мастерская глав и прозы</div>
            <div className="text-[10px] text-[#71717a]">Любые главы, диалоги, трофеи</div>
          </button>

          <button
            onClick={() => setActiveStep(4)}
            className={`p-3 rounded-xl border text-left transition ${
              activeStep === 4
                ? 'bg-[#18181b] border-[#d4af37] text-[#d4af37] shadow'
                : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa] hover:bg-[#18181b]'
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold">Шаг 4</div>
            <div className="text-xs font-bold text-[#f4f4f5] mt-0.5">Аудио и запечатывание</div>
            <div className="text-[10px] text-[#71717a]">Публикация Master_Resolution</div>
          </button>
        </div>
      </div>

      {/* Save Notification Toast */}
      {saveToast && (
        <div className="p-3 bg-emerald-950 border border-emerald-600 rounded-2xl text-emerald-200 text-xs font-bold flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saveToast}</span>
          </div>
          <button
            onClick={() => onNavigateToTab?.('book')}
            className="px-3 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-xs"
          >
            Открыть разворот книги ➔
          </button>
        </div>
      )}

      {/* Step Content Workspaces */}

      {/* Step 1: Player Intents View */}
      {activeStep === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <span className="text-xs font-bold uppercase text-[#d4af37] font-mono">
                Входящие намерения партии (Раунд {round})
              </span>
              <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded font-mono">
                Elena & Torin
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-1.5">
                <div className="font-bold text-[#f4f4f5] flex items-center justify-between">
                  <span>Елена (Волшебница 3 ур.)</span>
                  <span className="text-purple-400 font-mono">Scorching Ray (2 слот)</span>
                </div>
                <div className="text-[#a1a1aa]">
                  Движение: [2,2] ➔ [3,4] • Цель: Шаман гоблинов • Fallback: Перенаправление в лучника
                </div>
                <div className="text-[#d4af37] italic font-serif">
                  «Пепел к пеплу, тварь! Попробуй это пламя!»
                </div>
              </div>

              <div className="p-3 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-1.5">
                <div className="font-bold text-[#f4f4f5] flex items-center justify-between">
                  <span>Торин (Воин 3 ур.)</span>
                  <span className="text-amber-400 font-mono">Greatsword Melee Attack</span>
                </div>
                <div className="text-[#a1a1aa]">
                  Движение: Вплотную к алтарю • Цель: Оскверненный монолит алтаря
                </div>
                <div className="text-[#d4af37] italic font-serif">
                  «За предков! Расколи эту скверну в щепки!»
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveStep(2)}
              className="w-full py-2.5 bg-[#18181b] hover:bg-[#27272a] text-[#f4f4f5] rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-[#27272a] transition"
            >
              Перейти к расчету механики WEGO ➔
            </button>
          </div>

          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
            <span className="text-xs font-bold uppercase text-[#d4af37] font-mono block border-b border-[#27272a] pb-3">
              Состояние монстров и тактическая обстановка
            </span>
            <div className="space-y-2">
              {entities.map(e => (
                <div
                  key={e.id}
                  className="p-2.5 bg-[#0c0c0c] border border-[#27272a] rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-[#f4f4f5]">{e.name}</div>
                    <div className="text-[10px] text-[#71717a] font-mono">
                      КД: {e.ac} • Скорость: {e.speed} • Позиция: [{e.pos[0]},{e.pos[1]}]
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[#f4f4f5]">{e.hp}/{e.maxHp} HP</span>
                    <div className={`text-[10px] font-mono ${e.status === 'Dead' ? 'text-stone-500' : 'text-emerald-400'}`}>
                      {e.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: WEGO Mechanical Calculation */}
      {activeStep === 2 && (
        <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#f4f4f5]">
                Механический протокол раунда (WEGO Rules Engine)
              </h3>
              <p className="text-xs text-[#a1a1aa]">
                Все броски D20 проверены детерминированным HMAC SHA-256 Commit-Reveal
              </p>
            </div>
            <button
              onClick={() => onSimulateWegoRound?.()}
              className="px-3.5 py-1.5 bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#27272a] rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Zap className="w-3.5 h-3.5" />
              Пересчитать броски
            </button>
          </div>

          {/* Mechanical Log Box */}
          <div className="p-4 bg-[#08080a] border border-[#27272a] rounded-xl font-mono text-xs text-[#d6d3d1] space-y-1.5 max-h-[300px] overflow-y-auto leading-relaxed">
            {mechanicalLogs.map((log, idx) => (
              <div
                key={idx}
                className={`${
                  log.includes('⚡') || log.includes('⚔️')
                    ? 'text-[#d4af37] font-bold'
                    : log.includes('💀')
                    ? 'text-red-400 font-bold'
                    : log.includes('🏆')
                    ? 'text-emerald-400 font-bold'
                    : 'text-[#a1a1aa]'
                }`}
              >
                {log}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setActiveStep(3)}
              className="px-5 py-2.5 bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#eab308] hover:to-[#d4af37] text-[#0c0c0c] font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition"
            >
              Перейти к написанию авторской прозы ➔
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Full Chapter & Prose Studio */}
      {activeStep === 3 && (
        <div className="space-y-6 animate-fade-in">
          {/* Chapter Selector & Arbitrary Chapter Creator Bar */}
          <div className="bg-[#121212] border-2 border-[#d4af37]/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                  <Feather className="w-5 h-5 text-[#d4af37]" />
                  <span>Выбор и написание любой главы летописи</span>
                </h3>
                <p className="text-xs text-[#a1a1aa]">
                  Вы можете произвольно писать новую главу, дополнять существующие, настраивать трофеи и диалоги
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateNewChapterArbitrary}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow"
                >
                  <Plus className="w-4 h-4" />
                  + Написать новую главу
                </button>
                <button
                  onClick={handleSaveCurrentChapter}
                  className="px-4 py-2 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow"
                >
                  <Save className="w-4 h-4" />
                  💾 Применить в книгу
                </button>
              </div>
            </div>

            {/* Chapter Selection Pills */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#27272a]">
              {chapters.map(ch => (
                <button
                  key={ch.round}
                  onClick={() => handleSelectChapter(ch.round)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                    selectedChapterRound === ch.round
                      ? 'bg-[#d4af37] text-[#0c0c0c] font-bold shadow'
                      : 'bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Глава {ch.round}: {ch.title.replace(/^Глава \w+\.\s*/, '').substring(0, 20)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main Chapter Metadata & Prose Editor Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left: Prose & Chapters Text (8 cols) */}
            <div className="xl:col-span-8 bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#a1a1aa] mb-1">
                    Заголовок главы (для разворота книги):
                  </label>
                  <input
                    type="text"
                    value={chapterTitle}
                    onChange={e => setChapterTitle(e.target.value)}
                    className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl px-3 py-2 text-sm text-[#f4f4f5] font-bold focus:border-[#d4af37] focus:outline-none"
                    placeholder="Глава III. Сокрушение Алтаря"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#a1a1aa] mb-1">
                    Подзаголовок / Сводка раунда:
                  </label>
                  <input
                    type="text"
                    value={chapterSubtitle}
                    onChange={e => setChapterSubtitle(e.target.value)}
                    className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl px-3 py-2 text-sm text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                    placeholder="Раунд 3: Развязка битвы в святилище"
                  />
                </div>
              </div>

              {/* Prose Presets */}
              <div className="space-y-1.5 pt-2 border-t border-[#27272a]">
                <label className="text-xs font-medium text-[#d4d4d8]">Быстрые стилистические шаблоны:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {prosePresets.map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => {
                        setProseText(preset.text);
                        playSfx('dice_roll');
                      }}
                      className="p-2 bg-[#0c0c0c] hover:bg-[#18181b] border border-[#27272a] hover:border-[#d4af37]/50 rounded-xl text-left transition text-xs group"
                    >
                      <div className="text-sm mb-0.5">{preset.icon}</div>
                      <div className="font-bold text-[#f4f4f5] group-hover:text-[#d4af37] truncate">
                        {preset.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prose Textarea (Page 1) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#d4af37]">Текст страницы 1 (С буквицей и описанием битвы):</label>
                  <span className="text-xs text-[#a1a1aa] font-mono">{proseText.length} симв.</span>
                </div>
                <textarea
                  value={proseText}
                  onChange={e => setProseText(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-4 text-sm text-[#f4f4f5] font-serif leading-relaxed focus:outline-none focus:border-[#d4af37] transition"
                  placeholder="Опишите кульминацию раунда, действия персонажей и тактические последствия..."
                />
              </div>

              {/* Prose Textarea (Page 2) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#a1a1aa]">Текст страницы 2 (Продолжение / Эпилог раунда):</label>
                  <span className="text-xs text-[#a1a1aa] font-mono">{prosePage2Text.length} симв.</span>
                </div>
                <textarea
                  value={prosePage2Text}
                  onChange={e => setProsePage2Text(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-4 text-sm text-[#f4f4f5] font-serif leading-relaxed focus:outline-none focus:border-[#d4af37] transition"
                  placeholder="Продолжение повествования, исследование зала, открытие тайных ходов..."
                />
              </div>

              {/* Lexicon / Synonym Helper */}
              <div className="p-3 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#d4af37] font-mono">Лексический обогатитель (Синонимы):</span>
                  <select
                    value={selectedWord}
                    onChange={e => setSelectedWord(e.target.value)}
                    className="bg-[#18181b] border border-[#27272a] rounded text-xs p-1 text-[#f4f4f5]"
                  >
                    {Object.keys(synonymsMap).map(w => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {synonymsMap[selectedWord]?.map((syn, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => {
                        setProseText(prev => prev + ' ' + syn);
                        playSfx('dice_roll');
                      }}
                      className="px-2.5 py-1 bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] hover:text-[#d4af37] rounded-lg border border-[#27272a] text-xs transition"
                    >
                      + {syn}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Roleplay Quotes & Loot & Master Notes (4 cols) */}
            <div className="xl:col-span-4 space-y-6">
              {/* Loot & XP Rewards Box */}
              <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
                  <span className="text-xs font-bold uppercase text-[#d4af37] font-mono flex items-center gap-1.5">
                    <Gift className="w-4 h-4" />
                    Трофеи и награды раунда (Loot & XP)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[#a1a1aa] mb-1 font-semibold">Опыт (XP):</label>
                    <input
                      type="number"
                      value={rewardXp}
                      onChange={e => setRewardXp(Number(e.target.value))}
                      className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[#a1a1aa] mb-1 font-semibold">Кошелек монет:</label>
                    <input
                      type="text"
                      value={rewardCoins}
                      onChange={e => setRewardCoins(e.target.value)}
                      className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] text-xs"
                      placeholder="35 зм, 80 см"
                    />
                  </div>
                </div>

                {/* Loot Items List */}
                <div className="space-y-2 text-xs">
                  <label className="block text-[#a1a1aa] font-semibold">Найденные предметы и артефакты:</label>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                    {rewardItems.map((item, iIdx) => (
                      <div
                        key={iIdx}
                        className="p-2 bg-[#0c0c0c] border border-[#27272a] rounded-xl flex items-center justify-between text-xs"
                      >
                        <span className="text-[#f4f4f5]">{item}</span>
                        <button
                          onClick={() => handleRemoveLootItem(iIdx)}
                          className="text-red-400 hover:text-red-300 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newItemInput}
                      onChange={e => setNewItemInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddLootItem()}
                      placeholder="Название предмета..."
                      className="flex-1 bg-[#0c0c0c] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-[#f4f4f5]"
                    />
                    <button
                      onClick={handleAddLootItem}
                      className="px-3 py-1.5 bg-[#d4af37] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Добавить
                    </button>
                  </div>
                </div>
              </div>

              {/* Master Notes Box */}
              <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-3">
                <span className="text-xs font-bold uppercase text-[#d4af37] font-mono block border-b border-[#27272a] pb-2">
                  Заметки Мастера (Окружение & Сложность)
                </span>
                <textarea
                  value={masterNotes}
                  onChange={e => setMasterNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-3 text-xs text-[#f4f4f5] focus:outline-none focus:border-[#d4af37]"
                  placeholder="Освещение, погодные условия, DC проверок..."
                />
              </div>

              {/* Roleplay Dialogue Quotes Manager */}
              <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
                  <span className="text-xs font-bold uppercase text-[#d4af37] font-mono flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" />
                    Реплики и цитаты отыгрыша партии
                  </span>
                  <span className="text-xs text-[#a1a1aa] font-mono">{roleplayQuotes.length} шт.</span>
                </div>

                {/* Existing Quotes */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {roleplayQuotes.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="p-2.5 bg-[#0c0c0c] border border-[#27272a] rounded-xl text-xs space-y-1 relative group"
                    >
                      <div className="flex items-center justify-between font-bold text-[#d4af37]">
                        <span>{q.actorName} ({q.actorClass})</span>
                        <button
                          onClick={() => handleRemoveRoleplayQuote(qIdx)}
                          className="text-red-400 hover:text-red-300 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[#f4f4f5] font-serif italic">{q.speech}</div>
                      {q.thought && (
                        <div className="text-[11px] text-[#a1a1aa]">Мысль: {q.thought}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Quote Form */}
                <div className="p-3 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2 text-xs">
                  <div className="font-bold text-[#d4af37] text-[11px]">+ Добавить реплику героя:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newQuoteActor}
                      onChange={e => setNewQuoteActor(e.target.value)}
                      placeholder="Имя героя"
                      className="bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-xs text-[#f4f4f5]"
                    />
                    <input
                      type="text"
                      value={newQuoteClass}
                      onChange={e => setNewQuoteClass(e.target.value)}
                      placeholder="Класс и уровень"
                      className="bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-xs text-[#f4f4f5]"
                    />
                  </div>
                  <input
                    type="text"
                    value={newQuoteSpeech}
                    onChange={e => setNewQuoteSpeech(e.target.value)}
                    placeholder="Прямая речь («В бой!»)"
                    className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-xs text-[#f4f4f5]"
                  />
                  <input
                    type="text"
                    value={newQuoteThought}
                    onChange={e => setNewQuoteThought(e.target.value)}
                    placeholder="Внутренняя мысль..."
                    className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-xs text-[#f4f4f5]"
                  />
                  <button
                    onClick={handleAddRoleplayQuote}
                    disabled={!newQuoteSpeech.trim()}
                    className="w-full py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] font-bold rounded-lg text-xs transition"
                  >
                    + Добавить цитату в главу
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#27272a]">
            <button
              onClick={handleSaveCurrentChapter}
              className="px-6 py-3 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition shadow-xl"
            >
              <Save className="w-4 h-4" />
              💾 Сохранить главу в книгу
            </button>
            <button
              onClick={() => setActiveStep(4)}
              className="px-6 py-3 bg-[#18181b] hover:bg-[#27272a] text-[#f4f4f5] font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 border border-[#27272a] transition"
            >
              Перейти к озвучке и запечатыванию EML ➔
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Audio Narration & Sealing Publish */}
      {activeStep === 4 && (
        <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-6 shadow-xl space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
            <div>
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-[#d4af37]" />
                Звуковая режиссура и запечатывание раунда
              </h3>
              <p className="text-xs text-[#a1a1aa]">
                Прослушайте озвучку прозы или запишите собственный голос Мастера
              </p>
            </div>
            <span className="text-xs font-mono text-[#d4af37] bg-[#18181b] border border-[#27272a] px-3 py-1 rounded-lg">
              Раунд {round}
            </span>
          </div>

          {/* Voice Preview & Recording Tools */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-2xl space-y-3">
              <div className="font-bold text-xs text-[#f4f4f5]">Голосовой синтезатор Мастера:</div>
              <button
                onClick={handlePlayVoicePreview}
                className="w-full py-2.5 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#27272a] text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <Play className="w-4 h-4" />
                {isPlayingPreview ? 'Остановить воспроизведение' : 'Воспроизвести прозу Мастера'}
              </button>
            </div>

            <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-2xl space-y-3">
              <div className="font-bold text-xs text-[#f4f4f5]">Живая запись голоса Мастера (Микрофон):</div>
              <button
                onClick={handleToggleNarrationRecord}
                className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  isRecordingNarration
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a]'
                }`}
              >
                {isRecordingNarration ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-red-400" />}
                {isRecordingNarration ? `Идет запись (${narrationSeconds}с)` : 'Записать аудиоэпилог'}
              </button>
            </div>
          </div>

          {/* Master Sealing Button */}
          <div className="space-y-3 pt-2 border-t border-[#27272a]">
            <button
              onClick={handlePublishAndAdvance}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#eab308] to-[#b8860b] hover:from-[#eab308] hover:to-[#d4af37] text-[#0c0c0c] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-2xl shadow-[#d4af37]/30 transition active:scale-95"
            >
              <Sparkles className="w-5 h-5" />
              Запечатать резолюцию и перейти к Раунду {round + 1}
            </button>

            <button
              onClick={handleDownloadResolutionEml}
              className="w-full py-2 bg-[#18181b] hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] border border-[#27272a] rounded-xl text-xs font-mono flex items-center justify-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Скачать файл Master_Resolution_R{round}.eml
            </button>

            {isPublished && (
              <div className="p-3 bg-emerald-950 border border-emerald-700 rounded-xl text-emerald-200 text-xs text-center font-bold animate-fade-in flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Капсула раунда {round} запечатана в Vault! Переход к раунду {round + 1}...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
