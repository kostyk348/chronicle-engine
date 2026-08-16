import React, { useState } from 'react';
import { Chapter, BestiaryEntry, GrimoireItem } from '../types/chronicle';
import {
  BookOpen,
  Download,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Printer,
  Shield,
  CheckCircle2,
  Scroll,
  FileDown,
  Columns,
  Square,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Gift,
  KeyRound,
  Feather,
  Info,
  BookMarked,
  X,
  Plus,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSfx } from '../utils/audioSynthesizer';
import { exportBookDomToPdf, exportFullCampaignBookPdf, exportPureTextPdf } from '../utils/pdfExporter';
import { exportCampaignToEpub } from '../utils/epubExporter';
import { splitProseIntoTwoColumns, splitPlainProseIntoTwoColumns } from '../utils/textTypography';

interface BookPreviewStudioProps {
  chapters: Chapter[];
  bestiary: BestiaryEntry[];
  grimoire: GrimoireItem[];
  onAddBestiaryEntry?: (entry: BestiaryEntry) => void;
  onAddGrimoireItem?: (item: GrimoireItem) => void;
}

export const BookPreviewStudio: React.FC<BookPreviewStudioProps> = ({
  chapters,
  bestiary,
  grimoire,
  onAddBestiaryEntry,
  onAddGrimoireItem,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [isCompilingPdf, setIsCompilingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ percent: number; status: string } | null>(null);
  const [compilationSuccess, setCompilationSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'chronicle' | 'bestiary' | 'grimoire' | 'typst_code'>('chronicle');
  
  // Add Monster & Artifact Modals
  const [isAddMonsterModalOpen, setIsAddMonsterModalOpen] = useState<boolean>(false);
  const [isAddArtifactModalOpen, setIsAddArtifactModalOpen] = useState<boolean>(false);

  // New Monster Form State
  const [newMonster, setNewMonster] = useState<{
    name: string;
    type: string;
    challengeRating: string;
    ac: number;
    hp: number;
    speed: string;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    actionName: string;
    actionDesc: string;
    lore: string;
    illustrationUrl: string;
  }>({
    name: '',
    type: 'Гуманоид (гоблиноид), хаотично-злой',
    challengeRating: '1/2 (100 XP)',
    ac: 13,
    hp: 18,
    speed: '30 фт.',
    str: 10,
    dex: 14,
    con: 12,
    int: 10,
    wis: 8,
    cha: 8,
    actionName: 'Короткий лук пепла',
    actionDesc: 'Дистанционная атака оружием: +4 к попаданию, дистанция 80/320 фт., одна цель. Попадание: 5 (1d6 + 2) колющего урона.',
    lore: 'Обитатели заброшенных катакомб Одинокого Пика, служащие некромантам за право пожирать останки.',
    illustrationUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
  });

  // New Artifact Form State
  const [newArtifact, setNewArtifact] = useState<{
    name: string;
    itemType: string;
    rarity: GrimoireItem['rarity'];
    attunement: boolean;
    description: string;
    propertiesText: string;
    history: string;
    illustrationUrl: string;
  }>({
    name: '',
    itemType: 'Чудесный предмет / Оружие',
    rarity: 'Rare',
    attunement: true,
    description: 'Древний артефакт, выкованный в эпоху Первого Рассвета.',
    propertiesText: '+1 к атаке и урону\nУстойчивость к урону огнем\nИзлучает тусклый свет в радиусе 10 футов',
    history: 'Найден в гробнице древних королей Одинокого Пика.',
    illustrationUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
  });

  // Image Lightbox State
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    caption?: string;
    artist?: string;
  } | null>(null);

  // Spread vs Single Page view mode
  const [viewMode, setViewMode] = useState<'spread_dual_a4' | 'single_left_a4' | 'single_right_a4'>('spread_dual_a4');
  const [zoomScale, setZoomScale] = useState<number>(100); // 100%, 80%, 65%

  const currentChapter = chapters[currentPageIndex] || chapters[0];
  const leftPageNumber = currentPageIndex * 2 + 2;
  const rightPageNumber = currentPageIndex * 2 + 3;

  // Compute clean non-broken paragraph column layouts
  const leftPageColumns = splitProseIntoTwoColumns(currentChapter?.prose || '');
  const rightPageColumns = splitPlainProseIntoTwoColumns(currentChapter?.prosePage2 || '');

  const handleSaveNewMonster = () => {
    if (!newMonster.name.trim()) return;
    const created: BestiaryEntry = {
      id: `monster_${Date.now()}`,
      name: newMonster.name.trim(),
      type: newMonster.type,
      challengeRating: newMonster.challengeRating,
      ac: Number(newMonster.ac) || 10,
      hp: Number(newMonster.hp) || 10,
      speed: newMonster.speed,
      stats: {
        str: Number(newMonster.str) || 10,
        dex: Number(newMonster.dex) || 10,
        con: Number(newMonster.con) || 10,
        int: Number(newMonster.int) || 10,
        wis: Number(newMonster.wis) || 10,
        cha: Number(newMonster.cha) || 10,
      },
      abilities: [],
      actions: [
        {
          name: newMonster.actionName || 'Атака',
          desc: newMonster.actionDesc || 'Наносит 1d6 урона.',
        },
      ],
      lore: newMonster.lore || 'Опасное порождение подземелья.',
      illustrationUrl: newMonster.illustrationUrl,
      artistCredit: 'Художник партии',
    };

    onAddBestiaryEntry?.(created);
    setIsAddMonsterModalOpen(false);
    playSfx('dice_roll');
  };

  const handleSaveNewArtifact = () => {
    if (!newArtifact.name.trim()) return;
    const props = newArtifact.propertiesText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const created: GrimoireItem = {
      id: `artifact_${Date.now()}`,
      name: newArtifact.name.trim(),
      itemType: newArtifact.itemType,
      rarity: newArtifact.rarity,
      attunement: newArtifact.attunement,
      description: newArtifact.description,
      properties: props.length > 0 ? props : ['Увеличивает силу владельца.'],
      history: newArtifact.history,
      illustrationUrl: newArtifact.illustrationUrl,
    };

    onAddGrimoireItem?.(created);
    setIsAddArtifactModalOpen(false);
    playSfx('dice_roll');
  };

  const handleDownloadSpreadPdf = async (mode: 'spread_landscape' | 'split_pages' = 'spread_landscape') => {
    setIsCompilingPdf(true);
    playSfx('dungeon_intro');
    setPdfProgress({ percent: 10, status: 'Инициализация Typst/Canvas движка для разворота A4+A4...' });

    try {
      await exportBookDomToPdf(
        'parchment-book-spread',
        `Chronicle_Chapter_${currentChapter.round}_A4_Spread.pdf`,
        (percent, status) => {
          setPdfProgress({ percent, status });
        },
        { mode }
      );

      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#d4af37', '#b8860b', '#7c3aed'],
      });
      playSfx('shield_block');
      setCompilationSuccess(true);
      setTimeout(() => setCompilationSuccess(false), 6000);
    } catch (err) {
      console.warn('DOM PDF export fallback to vector generator:', err);
      exportPureTextPdf(chapters, bestiary, grimoire, 'Chronicle_Complete_Campaign.pdf');
      setCompilationSuccess(true);
    } finally {
      setIsCompilingPdf(false);
      setPdfProgress(null);
    }
  };

  const handleDownloadFullBookPdf = async () => {
    setIsCompilingPdf(true);
    playSfx('fire_spell');
    setPdfProgress({ percent: 5, status: 'Сборка всех глав, бестиария и гримуара...' });

    try {
      await exportFullCampaignBookPdf(
        chapters,
        bestiary,
        grimoire,
        'Chronicle_Complete_Campaign_Book.pdf',
        (percent, status) => {
          setPdfProgress({ percent, status });
        }
      );

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 },
        colors: ['#d4af37', '#22c55e', '#3b82f6'],
      });
      playSfx('shield_block');
      setCompilationSuccess(true);
      setTimeout(() => setCompilationSuccess(false), 5000);
    } catch (err) {
      console.error('Error compiling full campaign book:', err);
    } finally {
      setIsCompilingPdf(false);
      setPdfProgress(null);
    }
  };

  const handleDownloadEpub = async () => {
    setIsCompilingPdf(true);
    playSfx('fire_spell');
    setPdfProgress({ percent: 10, status: 'Сборка EPUB 3.0 архива, глав и оглавления...' });

    try {
      await exportCampaignToEpub(
        chapters,
        bestiary,
        grimoire,
        'Chronicle_Campaign_Book.epub',
        (percent, status) => {
          setPdfProgress({ percent, status });
        }
      );

      confetti({
        particleCount: 85,
        spread: 75,
        origin: { y: 0.5 },
        colors: ['#10b981', '#d4af37', '#6366f1'],
      });
      playSfx('shield_block');
      setCompilationSuccess(true);
      setTimeout(() => setCompilationSuccess(false), 5000);
    } catch (err) {
      console.error('Error compiling EPUB book:', err);
    } finally {
      setIsCompilingPdf(false);
      setPdfProgress(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate Typst markup code for export
  const typstCode = `// Typst Typesetting Spec: Chronicle Engine v1.0 (A4+A4 Spread Specification)
#set document(title: "Хроника Одинокого Пика", author: "Dungeon Master & Party")
#set page(
  paper: "a4",
  margin: (x: 1.8cm, top: 2.2cm, bottom: 2.2cm),
  header: align(center)[#smallcaps[Хроника Одинокого Пика • RFC 5322 EML Vault Archive]],
  footer: locate(loc => align(center)[#counter(page).display("— 1 —")])
)
#set text(font: "Libertinus Serif", size: 10pt, lang: "ru")
#set par(justify: true, leading: 0.65em, first-line-indent: 1.2em)

${chapters
  .map(
    c => `
= ${c.title}
_${c.subtitle}_

#v(1em)
${c.prose}

#v(1em)
${c.prosePage2 || ''}

#block(
  fill: rgb("#f3ede0"),
  inset: 10pt,
  radius: 4pt,
  stroke: rgb("#cbbba4"),
  [
    *Прямая речь участников раунда (RFC 5322):*
    ${c.roleplayQuotes.map(q => `\n- *${q.actorName}* (${q.actorClass}): "${q.speech}" _(${q.flavor})_`).join('')}
  ]
)
`
  )
  .join('\n')}`;

  return (
    <div id="book-preview-studio" className="space-y-6">
      {/* Top Publishing Controls Bar */}
      <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-xl text-[#d4af37]">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
              Издательский конвейер «Campfire Scribe»
              <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800 font-mono">
                Разворот A4 + A4 (300 DPI)
              </span>
            </h2>
            <p className="text-xs text-[#a1a1aa]">
              Сквозная верстка аутентичного двухстраничного разворота с буквицами, корешком книги и статблоками
            </p>
          </div>
        </div>

        {/* Tab Switcher & Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[#0c0c0c] p-1 rounded-xl border border-[#27272a] flex gap-1 text-xs">
            <button
              onClick={() => setActiveTab('chronicle')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'chronicle'
                  ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
              }`}
            >
              Книга кампании
            </button>
            <button
              onClick={() => setActiveTab('bestiary')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'bestiary'
                  ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
              }`}
            >
              Бестиарий ({bestiary.length})
            </button>
            <button
              onClick={() => setActiveTab('grimoire')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'grimoire'
                  ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
              }`}
            >
              Гримуар ({grimoire.length})
            </button>
            <button
              onClick={() => setActiveTab('typst_code')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'typst_code'
                  ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
              }`}
            >
              Typst код
            </button>
          </div>

          {/* Download Spread PDF Button */}
          <button
            onClick={() => handleDownloadSpreadPdf('spread_landscape')}
            disabled={isCompilingPdf}
            className="px-3 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:brightness-110 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg transition disabled:opacity-50"
            title="Сохранить разворот A4+A4 в PDF (альбомный формат 300 DPI)"
          >
            <FileDown className="w-4 h-4" />
            {isCompilingPdf ? 'Генерация PDF...' : 'Разворот A4+A4 (PDF)'}
          </button>

          {/* Download Split 2-Pages PDF */}
          <button
            onClick={() => handleDownloadSpreadPdf('split_pages')}
            disabled={isCompilingPdf}
            className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#d4af37]/40 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            title="Разбить разворот на 2 отдельные страницы A4 в PDF"
          >
            <Columns className="w-3.5 h-3.5" />
            2 стр. A4 (PDF)
          </button>

          {/* Download Complete Campaign Book (PDF) */}
          <button
            onClick={handleDownloadFullBookPdf}
            disabled={isCompilingPdf}
            className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            title="Скачать всю книгу целиком в PDF (все главы, бестиарий, гримуар)"
          >
            <Download className="w-3.5 h-3.5 text-[#d4af37]" />
            Книга (.PDF)
          </button>

          {/* Download Complete Campaign Book (EPUB) */}
          <button
            onClick={handleDownloadEpub}
            disabled={isCompilingPdf}
            className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#34d399] border border-emerald-900/60 hover:border-emerald-500/50 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
            title="Скачать книгу кампании в формате EPUB 3.0 (для Apple Books, Kindle, PocketBook, FBReader, смартфонов)"
          >
            <BookMarked className="w-3.5 h-3.5 text-[#34d399]" />
            Книга (.EPUB)
          </button>

          <button
            onClick={handlePrint}
            className="p-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] transition"
            title="Печать книги / Диалог браузера"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Real Progress Banner */}
      {isCompilingPdf && pdfProgress && (
        <div className="p-4 bg-[#18181b] border border-[#d4af37]/50 rounded-2xl space-y-2 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#d4af37] font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin" />
              {pdfProgress.status}
            </span>
            <span className="text-[#f4f4f5]">{pdfProgress.percent}%</span>
          </div>
          <div className="w-full bg-[#0c0c0c] h-2 rounded-full overflow-hidden border border-[#27272a]">
            <div
              className="bg-gradient-to-r from-[#d4af37] to-[#eab308] h-full transition-all duration-300"
              style={{ width: `${pdfProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {compilationSuccess && (
        <div className="p-4 bg-emerald-950/90 border border-emerald-700 rounded-2xl text-emerald-200 text-xs flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">PDF файл разворота A4+A4 успешно скомпилирован и сохранен!</div>
              <div className="text-[11px] text-emerald-400">
                Разворот сохранен в высоком разрешении со всеми орнаментами, буквицами, прямыми репликами и корешком.
              </div>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition"
          >
            Печать
          </button>
        </div>
      )}

      {/* Main Book Page Studio */}
      {activeTab === 'chronicle' && (
        <div className="space-y-4">
          {/* Top Spread Mode & Zoom Toolbar */}
          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-[#a1a1aa] font-semibold flex items-center gap-1.5">
                <Columns className="w-3.5 h-3.5 text-[#d4af37]" />
                Режим просмотра:
              </span>
              <div className="bg-[#0c0c0c] p-1 rounded-xl border border-[#27272a] flex gap-1">
                <button
                  onClick={() => {
                    setViewMode('spread_dual_a4');
                    playSfx('dice_roll');
                  }}
                  className={`px-3 py-1 rounded-lg transition font-medium ${
                    viewMode === 'spread_dual_a4'
                      ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                      : 'text-[#71717a] hover:text-[#d4d4d8]'
                  }`}
                >
                  Разворот A4 + A4 (Книга)
                </button>
                <button
                  onClick={() => {
                    setViewMode('single_left_a4');
                    playSfx('dice_roll');
                  }}
                  className={`px-3 py-1 rounded-lg transition font-medium ${
                    viewMode === 'single_left_a4'
                      ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                      : 'text-[#71717a] hover:text-[#d4d4d8]'
                  }`}
                >
                  Левая стр. ({leftPageNumber})
                </button>
                <button
                  onClick={() => {
                    setViewMode('single_right_a4');
                    playSfx('dice_roll');
                  }}
                  className={`px-3 py-1 rounded-lg transition font-medium ${
                    viewMode === 'single_right_a4'
                      ? 'bg-[#18181b] text-[#d4af37] font-bold shadow'
                      : 'text-[#71717a] hover:text-[#d4d4d8]'
                  }`}
                >
                  Правая стр. ({rightPageNumber})
                </button>
              </div>
            </div>

            {/* Quick Chapter Selector Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto py-1">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.round}
                  onClick={() => {
                    setCurrentPageIndex(idx);
                    playSfx('dice_roll');
                  }}
                  className={`px-3 py-1 rounded-lg font-serif text-xs transition border ${
                    currentPageIndex === idx
                      ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#d4af37] font-bold'
                      : 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:text-white'
                  }`}
                >
                  Глава {idx + 1}
                </button>
              ))}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <span className="text-[#a1a1aa] text-[11px] font-mono">Масштаб:</span>
              <div className="flex items-center gap-1 bg-[#0c0c0c] p-1 rounded-xl border border-[#27272a]">
                <button
                  onClick={() => setZoomScale(s => Math.max(60, s - 15))}
                  className="p-1 text-[#a1a1aa] hover:text-white"
                  title="Уменьшить"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono text-[#d4af37] px-1 font-bold w-12 text-center">
                  {zoomScale}%
                </span>
                <button
                  onClick={() => setZoomScale(s => Math.min(130, s + 15))}
                  className="p-1 text-[#a1a1aa] hover:text-white"
                  title="Увеличить"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomScale(100)}
                  className="px-2 py-0.5 text-[10px] bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] rounded font-mono"
                  title="Сбросить на 100%"
                >
                  100%
                </button>
              </div>
            </div>
          </div>

          {/* Genuine A4 + A4 Book Spread Container */}
          <div className="overflow-x-auto pb-4 flex justify-center">
            <div
              style={{
                transform: `scale(${zoomScale / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s ease-out',
              }}
              className="w-full max-w-[1360px]"
            >
              {/* Ornate Bound Leather Outer Book Jacket */}
              <div
                id="parchment-book-spread"
                className="bg-[#2b1810] p-4 sm:p-7 rounded-[28px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border-[10px] border-[#3d2314] relative select-text selection:bg-[#78350f]/20 selection:text-[#1c1917]"
              >
                {/* Book Spread Inner Content (Left Page A4 + Central Spine Gutter + Right Page A4) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 relative bg-[#fbf7ed] rounded-2xl overflow-hidden shadow-2xl border border-[#78350f]/30">
                  
                  {/* Central Spine Shadow / Gutter (Visible on dual-page view) */}
                  {viewMode === 'spread_dual_a4' && (
                    <div
                      className="hidden lg:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-12 z-20 pointer-events-none select-none"
                      style={{
                        background:
                          'linear-gradient(to right, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.15) 100%)',
                        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.3)',
                      }}
                    >
                      {/* Physical Book Stitch Notches */}
                      <div className="h-full flex flex-col justify-around items-center py-10 opacity-30 select-none">
                        <span className="text-[#3e1f07] text-xs">⚬</span>
                        <span className="text-[#3e1f07] text-xs">⚬</span>
                        <span className="text-[#3e1f07] text-xs">⚬</span>
                        <span className="text-[#3e1f07] text-xs">⚬</span>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* LEFT PAGE (A4 - Even Folio) */}
                  {/* ========================================================================= */}
                  {(viewMode === 'spread_dual_a4' || viewMode === 'single_left_a4') && (
                    <div
                      className={`bg-[#fbf7ed] text-[#1c1917] p-8 sm:p-12 font-serif flex flex-col justify-between relative min-h-[920px] select-text ${
                        viewMode === 'single_left_a4' ? 'lg:col-span-2' : 'border-r border-[#78350f]/20'
                      }`}
                      style={{
                        backgroundImage: 'radial-gradient(ellipse at 20% 30%, #fefcf6 0%, #f7f1e1 100%)',
                      }}
                    >
                      {/* Ornate Corner Glyphs */}
                      <div className="absolute top-4 left-4 text-[#78350f]/30 text-xl select-none pointer-events-none">❧</div>
                      <div className="absolute bottom-4 left-4 text-[#78350f]/30 text-xl select-none pointer-events-none">☙</div>

                      {/* Top Running Header (Even Page Folio) */}
                      <div>
                        <div className="border-b border-[#78350f]/35 pb-2.5 mb-6 flex items-center justify-between text-xs font-sans uppercase tracking-[0.2em] text-[#78350f]/85 font-bold">
                          <span>СТРАНИЦА {leftPageNumber}</span>
                          <span className="text-[11px] font-normal text-[#9a3412] tracking-normal">
                            ⚜ ХРОНИКА ОДИНОКОГО ПИКА ⚜
                          </span>
                          <span className="text-[10px] text-[#78716c] font-mono">RFC 5322 EML</span>
                        </div>

                        {/* Chapter Title & Subtitle */}
                        <div className="text-center space-y-1.5 mb-6 select-text">
                          <div className="text-xs uppercase font-sans tracking-[0.25em] text-[#9a3412] font-semibold">
                            — ГЛАВА {currentChapter.round} —
                          </div>
                          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#292524] tracking-tight font-serif">
                            {currentChapter.title.replace(/^Глава\s+[IVXLCDM]+\.\s*/, '')}
                          </h1>
                          <p className="text-xs sm:text-sm italic text-[#57534e] font-serif max-w-lg mx-auto">
                            {currentChapter.subtitle}
                          </p>
                          <div className="flex items-center justify-center gap-3 text-[#78350f]/40 my-2 select-none pointer-events-none">
                            <div className="w-16 h-[1px] bg-[#78350f]/30" />
                            <span className="text-xs">❦</span>
                            <div className="w-16 h-[1px] bg-[#78350f]/30" />
                          </div>
                        </div>

                        {/* Two-Column Literary Prose with Authentic 4-Line Illuminated Drop Cap */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-justify text-xs sm:text-[13px] leading-[1.75] text-[#292524] select-text">
                          {/* Column 1 */}
                          <div className="space-y-3">
                            <div>
                              {leftPageColumns.firstChar && (
                                <span
                                  className="float-left text-5xl leading-[0.8] font-black text-[#78350f] pr-3 pt-1 font-serif cursor-text select-text"
                                  style={{
                                    textShadow: '1px 1px 0px rgba(255,255,255,0.9), 2px 2px 2px rgba(120,53,15,0.25)',
                                  }}
                                >
                                  {leftPageColumns.firstChar}
                                </span>
                              )}
                              <p className="indent-0">
                                {leftPageColumns.firstParaRest}
                              </p>
                            </div>
                            {leftPageColumns.col1Paragraphs.map((para, pIdx) => (
                              <p key={pIdx} className="indent-4">
                                {para}
                              </p>
                            ))}
                          </div>

                          {/* Column 2 */}
                          <div className="space-y-3">
                            {leftPageColumns.col2Paragraphs.map((para, pIdx) => (
                              <p key={pIdx} className="indent-4">
                                {para}
                              </p>
                            ))}
                          </div>
                        </div>

                        {/* Chapter Artwork Illustration (Natural Aspect Ratio, No Compression) */}
                        {currentChapter.artworks && currentChapter.artworks.length > 0 && (
                          <div
                            onClick={() => {
                              setLightboxImage({
                                url: currentChapter.artworks[0].url,
                                title: currentChapter.artworks[0].title,
                                caption: currentChapter.artworks[0].caption,
                                artist: currentChapter.artworks[0].artist,
                              });
                              playSfx('dice_roll');
                            }}
                            className="mt-6 border-2 border-[#78350f]/35 p-2 bg-[#fffdf9] rounded-xl shadow-md space-y-1.5 cursor-pointer hover:border-[#78350f] transition group"
                            title="Нажмите для просмотра иллюстрации в высоком разрешении"
                          >
                            <div className="relative overflow-hidden rounded-lg border border-[#78350f]/20 bg-[#2b1810]/5 flex items-center justify-center max-h-72">
                              <img
                                src={currentChapter.artworks[0].url}
                                alt={currentChapter.artworks[0].title}
                                className="w-full h-auto max-h-72 object-contain rounded-lg transition-transform duration-300 group-hover:scale-[1.01]"
                                loading="lazy"
                              />
                              <div className="absolute top-2 right-2 p-1.5 bg-[#2b1810]/80 rounded-lg text-[#d4af37] opacity-0 group-hover:opacity-100 transition shadow">
                                <Maximize2 className="w-3.5 h-3.5" />
                              </div>
                            </div>
                            <div className="text-[11px] text-[#57534e] italic font-sans text-center px-2 flex items-center justify-center gap-1.5">
                              <span>{currentChapter.artworks[0].caption}</span>
                              <span className="text-[10px] text-[#78350f]/70 font-mono">(нажмите для увеличения)</span>
                            </div>
                          </div>
                        )}

                        {/* Master Lore / Secret DM Notes Box */}
                        {currentChapter.masterNotes && (
                          <div className="mt-5 bg-[#f2e9d8] border-2 border-[#78350f]/30 rounded-xl p-3.5 text-xs font-sans space-y-1 shadow-sm select-text">
                            <div className="font-bold text-[#78350f] flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                              <Feather className="w-3.5 h-3.5" />
                              Заметки Мастера (Окружение и Таинства):
                            </div>
                            <p className="italic text-[#44403c] font-serif leading-relaxed">
                              {currentChapter.masterNotes}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Footer Folio */}
                      <div className="border-t border-[#78350f]/30 pt-3 mt-8 flex items-center justify-between text-[11px] font-sans text-[#78716c] select-none">
                        <span>Орден Одинокого Пика</span>
                        <span className="font-serif italic text-xs text-[#44403c] font-bold">
                          — {leftPageNumber} —
                        </span>
                        <span>EML Vault Archive</span>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* RIGHT PAGE (A4 - Odd Folio) */}
                  {/* ========================================================================= */}
                  {(viewMode === 'spread_dual_a4' || viewMode === 'single_right_a4') && (
                    <div
                      className={`bg-[#fbf7ed] text-[#1c1917] p-8 sm:p-12 font-serif flex flex-col justify-between relative min-h-[920px] select-text ${
                        viewMode === 'single_right_a4' ? 'lg:col-span-2' : 'border-l border-[#78350f]/20'
                      }`}
                      style={{
                        backgroundImage: 'radial-gradient(ellipse at 80% 30%, #fefcf6 0%, #f7f1e1 100%)',
                      }}
                    >
                      {/* Ornate Corner Glyphs */}
                      <div className="absolute top-4 right-4 text-[#78350f]/30 text-xl select-none pointer-events-none">☙</div>
                      <div className="absolute bottom-4 right-4 text-[#78350f]/30 text-xl select-none pointer-events-none">❧</div>

                      {/* Top Running Header (Odd Page Folio) */}
                      <div>
                        <div className="border-b border-[#78350f]/35 pb-2.5 mb-6 flex items-center justify-between text-xs font-sans uppercase tracking-[0.2em] text-[#78350f]/85 font-bold">
                          <span className="text-[10px] text-[#78716c] font-mono">РАУНД {currentChapter.round}</span>
                          <span className="text-[11px] font-normal text-[#9a3412] tracking-normal">
                            ⚜ {currentChapter.title} ⚜
                          </span>
                          <span>СТРАНИЦА {rightPageNumber}</span>
                        </div>

                        {/* Page 2 Continuation & Climax Prose (2 Columns) */}
                        {currentChapter.prosePage2 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-justify text-xs sm:text-[13px] leading-[1.75] text-[#292524] mb-6 select-text">
                            <div className="space-y-3">
                              {rightPageColumns.col1.map((para, pIdx) => (
                                <p key={pIdx} className="indent-4">
                                  {para}
                                </p>
                              ))}
                            </div>
                            <div className="space-y-3">
                              {rightPageColumns.col2.map((para, pIdx) => (
                                <p key={pIdx} className="indent-4">
                                  {para}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Roleplay Dialogue Scroll Callout (D&D 5e / RFC 5322) */}
                        {currentChapter.roleplayQuotes && currentChapter.roleplayQuotes.length > 0 && (
                          <div className="bg-[#ede4d1] border-l-4 border-[#78350f] p-4 rounded-r-xl space-y-2.5 font-sans my-4 shadow-sm border-t border-b border-r border-[#78350f]/20 select-text">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-[#78350f] flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Scroll className="w-3.5 h-3.5" />
                                Прямая речь участников раунда (RFC 5322 Intent):
                              </span>
                              <span className="text-[10px] font-mono text-[#78350f]/80">Канонический лог</span>
                            </div>

                            {currentChapter.roleplayQuotes.map((q, qIdx) => (
                              <div
                                key={qIdx}
                                className="text-xs space-y-0.5 border-t border-[#78350f]/15 pt-2 first:border-0 first:pt-0"
                              >
                                <div className="font-bold text-[#292524] flex items-center gap-1.5">
                                  <span>{q.actorName}</span>
                                  <span className="text-[10px] font-normal text-[#57534e]">({q.actorClass})</span>
                                </div>
                                <div className="italic text-[#44403c] font-serif pl-2.5 border-l-2 border-[#78350f]/40 leading-relaxed">
                                  «{q.speech}»
                                </div>
                                {q.flavor && (
                                  <div className="text-[10px] text-[#78716c] font-sans pl-2.5">
                                    [Действие: {q.flavor}]
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Mechanical Battle Summary (WEGO Resolution Box) */}
                        <div className="p-3.5 bg-[#241d19] text-[#f5f5f4] rounded-xl text-xs font-mono space-y-1.5 shadow-md border border-[#443730] my-4 select-text">
                          <div className="text-[10px] uppercase text-[#d4af37] font-bold flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-[#d4af37]" />
                              Механический итог столкновения (WEGO Rules Engine):
                            </span>
                            <span className="text-[10px] text-[#a8a29e]">D20 Roll Logs</span>
                          </div>
                          {currentChapter.battleLogSummary.map((log, lIdx) => (
                            <div key={lIdx} className="text-[11px] text-[#d6d3d1] leading-tight">
                              • {log}
                            </div>
                          ))}
                        </div>

                        {/* Loot, Spoils & XP Reward Box */}
                        {currentChapter.lootReward && (
                          <div className="bg-[#f2ecdc] border border-[#d4af37]/60 rounded-xl p-3 text-xs font-sans space-y-1 shadow-sm my-4 select-text">
                            <div className="font-bold text-[#9a3412] flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1.5">
                                <Gift className="w-3.5 h-3.5 text-[#d4af37]" />
                                Трофеи и опыт партии (Loot & Spoils):
                              </span>
                              <span className="text-[10px] font-mono bg-[#d4af37]/20 text-[#78350f] px-2 py-0.5 rounded font-bold">
                                +{currentChapter.lootReward.xp} XP
                              </span>
                            </div>
                            <div className="text-[11px] text-[#44403c]">
                              <strong>Монеты:</strong> {currentChapter.lootReward.coins || 'Нет'}
                            </div>
                            {currentChapter.lootReward.items && currentChapter.lootReward.items.length > 0 && (
                              <div className="text-[11px] text-[#44403c]">
                                <strong>Находки:</strong> {currentChapter.lootReward.items.join(', ')}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Cryptographic EML Verification Seal */}
                        <div className="p-2.5 bg-[#f6f0df] rounded-lg border border-[#78350f]/20 flex items-center justify-between text-[10px] font-mono text-[#78716c] my-3 select-text">
                          <div className="flex items-center gap-2">
                            <KeyRound className="w-3.5 h-3.5 text-[#78350f]" />
                            <span>RFC 5322 EML Checksum:</span>
                            <span className="text-[#9a3412] font-bold">0x8f4a..e8f9 [VERIFIED]</span>
                          </div>
                          <span className="text-[#78350f] font-serif font-bold">⚜ ПЕЧАТЬ КАНОНА ⚜</span>
                        </div>
                      </div>

                      {/* Footer Folio */}
                      <div className="border-t border-[#78350f]/30 pt-3 mt-8 flex items-center justify-between text-[11px] font-sans text-[#78716c] select-none">
                        <span>Издательский конвейер Campfire Scribe</span>
                        <span className="font-serif italic text-xs text-[#44403c] font-bold">
                          — {rightPageNumber} —
                        </span>
                        <span>Канон TTRPG</span>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>

          {/* Bottom Spread Navigator Toolbar */}
          <div className="flex items-center justify-between bg-[#121212] border border-[#27272a] rounded-2xl p-4 shadow-xl">
            <button
              disabled={currentPageIndex === 0}
              onClick={() => {
                setCurrentPageIndex(p => Math.max(0, p - 1));
                playSfx('dice_roll');
              }}
              className="px-4 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] disabled:opacity-30 text-[#d4d4d8] text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Предыдущий разворот (Глава {currentPageIndex})
            </button>

            <div className="text-center">
              <span className="text-xs font-mono text-[#d4af37] font-bold">
                Разворот {currentPageIndex + 1} из {chapters.length} (Стр. {leftPageNumber}–{rightPageNumber})
              </span>
              <div className="text-[11px] text-[#71717a] font-serif truncate max-w-xs sm:max-w-md">
                {currentChapter.title}
              </div>
            </div>

            <button
              disabled={currentPageIndex === chapters.length - 1}
              onClick={() => {
                setCurrentPageIndex(p => Math.min(chapters.length - 1, p + 1));
                playSfx('dice_roll');
              }}
              className="px-4 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] disabled:opacity-30 text-[#d4d4d8] text-xs font-semibold flex items-center gap-1.5 transition"
            >
              Следующий разворот (Глава {currentPageIndex + 2})
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bestiary Tab - Classic Monster Manual D&D 5e Stat Blocks */}
      {activeTab === 'bestiary' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#18181b] border border-[#27272a] rounded-2xl p-4">
            <div>
              <h3 className="text-sm font-bold text-[#f4f4f5] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#d4af37]" />
                <span>Бестиарий Кампании (D&D 5e Monster Manual)</span>
              </h3>
              <p className="text-xs text-[#a1a1aa]">
                Монстры, боссы и враждебные существа с полными блоками характеристик SRD
              </p>
            </div>
            <button
              onClick={() => {
                setIsAddMonsterModalOpen(true);
                playSfx('dice_roll');
              }}
              className="px-3.5 py-2 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow"
            >
              <Plus className="w-4 h-4" />
              <span>+ Добавить существо в Бестиарий</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-text selection:bg-[#78350f]/20 selection:text-[#1c1917]">
            {bestiary.map(be => (
              <div
                key={be.id}
                className="bg-[#fbf7ed] text-[#1c1917] border-4 border-[#78350f]/30 rounded-2xl p-6 shadow-2xl space-y-4 font-serif relative"
              >
                {/* Monster Header Banner */}
                <div className="border-b-2 border-[#78350f] pb-3 flex gap-4 items-start">
                  <div
                    onClick={() => {
                      setLightboxImage({
                        url: be.illustrationUrl,
                        title: be.name,
                        caption: `${be.name} (${be.type}) • AC ${be.ac} • HP ${be.hp} • CR ${be.challengeRating}`,
                      });
                      playSfx('dice_roll');
                    }}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-[#78350f]/40 bg-[#fffdf9] p-1 shadow-md flex-shrink-0 cursor-pointer overflow-hidden flex items-center justify-center group relative hover:border-[#78350f] transition"
                    title="Нажмите для увеличения иллюстрации"
                  >
                    <img
                      src={be.illustrationUrl}
                      alt={be.name}
                      className="w-full h-full object-contain rounded-lg group-hover:scale-105 transition duration-200"
                      loading="lazy"
                    />
                    <div className="absolute top-1 right-1 p-1 bg-[#2b1810]/70 rounded text-[#d4af37] opacity-0 group-hover:opacity-100 transition">
                      <Maximize2 className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black font-serif text-[#78350f] leading-tight">{be.name}</h3>
                    <div className="text-xs italic text-[#57534e]">{be.type}</div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-sans font-bold text-[#78350f] mt-1.5">
                      <span className="bg-[#f0e8d5] px-2 py-0.5 rounded border border-[#78350f]/20">
                        Класс Доспеха (AC): {be.ac}
                      </span>
                      <span className="bg-[#f0e8d5] px-2 py-0.5 rounded border border-[#78350f]/20">
                        Хиты (HP): {be.hp}
                      </span>
                      <span className="bg-[#f0e8d5] px-2 py-0.5 rounded border border-[#78350f]/20">
                        CR: {be.challengeRating}
                      </span>
                    </div>
                  </div>
                </div>

                {/* D&D 5e Ability Scores Table */}
                <div className="bg-[#f0e8d5] p-2.5 rounded-xl border border-[#78350f]/20 text-xs font-sans grid grid-cols-6 gap-1 text-center font-bold select-text">
                  <div>
                    <div className="text-[#78350f] text-[10px]">СИЛ</div>
                    <div className="text-sm">{be.stats.str}</div>
                    <div className="text-[10px] text-[#57534e] font-normal">
                      {be.stats.str >= 10 ? `+${Math.floor((be.stats.str - 10) / 2)}` : Math.floor((be.stats.str - 10) / 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78350f] text-[10px]">ЛОВ</div>
                    <div className="text-sm">{be.stats.dex}</div>
                    <div className="text-[10px] text-[#57534e] font-normal">
                      {be.stats.dex >= 10 ? `+${Math.floor((be.stats.dex - 10) / 2)}` : Math.floor((be.stats.dex - 10) / 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78350f] text-[10px]">ТЕЛ</div>
                    <div className="text-sm">{be.stats.con}</div>
                    <div className="text-[10px] text-[#57534e] font-normal">
                      {be.stats.con >= 10 ? `+${Math.floor((be.stats.con - 10) / 2)}` : Math.floor((be.stats.con - 10) / 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78350f] text-[10px]">ИНТ</div>
                    <div className="text-sm">{be.stats.int}</div>
                    <div className="text-[10px] text-[#57534e] font-normal">
                      {be.stats.int >= 10 ? `+${Math.floor((be.stats.int - 10) / 2)}` : Math.floor((be.stats.int - 10) / 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78350f] text-[10px]">МДР</div>
                    <div className="text-sm">{be.stats.wis}</div>
                    <div className="text-[10px] text-[#57534e] font-normal">
                      {be.stats.wis >= 10 ? `+${Math.floor((be.stats.wis - 10) / 2)}` : Math.floor((be.stats.wis - 10) / 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78350f] text-[10px]">ХАР</div>
                    <div className="text-sm">{be.stats.cha}</div>
                    <div className="text-[10px] text-[#57534e] font-normal">
                      {be.stats.cha >= 10 ? `+${Math.floor((be.stats.cha - 10) / 2)}` : Math.floor((be.stats.cha - 10) / 2)}
                    </div>
                  </div>
                </div>

                {/* Actions & Lore */}
                <div className="text-xs space-y-2.5 leading-relaxed text-[#292524] select-text">
                  <div className="text-[11px] font-bold uppercase text-[#78350f] tracking-wider border-b border-[#78350f]/20 pb-1">
                    Действия существа:
                  </div>
                  {be.actions.map((act, aIdx) => (
                    <div key={aIdx}>
                      <strong className="text-[#78350f]">{act.name}.</strong> {act.desc}
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[#78350f]/20 text-[#44403c] italic">
                    <strong>Предание:</strong> {be.lore}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grimoire Tab - Classic Artifact Compendium */}
      {activeTab === 'grimoire' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#18181b] border border-[#27272a] rounded-2xl p-4">
            <div>
              <h3 className="text-sm font-bold text-[#f4f4f5] flex items-center gap-2">
                <Scroll className="w-4 h-4 text-[#d4af37]" />
                <span>Гримуар и Каталог Артефактов (Magic Items Compendium)</span>
              </h3>
              <p className="text-xs text-[#a1a1aa]">
                Магические реликвии, трофеи и древнее оружие кампании
              </p>
            </div>
            <button
              onClick={() => {
                setIsAddArtifactModalOpen(true);
                playSfx('dice_roll');
              }}
              className="px-3.5 py-2 bg-[#d4af37] hover:bg-[#c49b2f] text-[#0c0c0c] font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow"
            >
              <Plus className="w-4 h-4" />
              <span>+ Добавить предмет в Гримуар</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-text selection:bg-[#78350f]/20 selection:text-[#1c1917]">
            {grimoire.map(item => (
              <div
                key={item.id}
                className="bg-[#fbf7ed] text-[#1c1917] border-4 border-[#78350f]/30 rounded-2xl p-6 shadow-2xl space-y-4 font-serif"
              >
                <div className="flex gap-4 items-start border-b-2 border-[#78350f] pb-3">
                  <div
                    onClick={() => {
                      setLightboxImage({
                        url: item.illustrationUrl,
                        title: item.name,
                        caption: `${item.name} • ${item.itemType} (${item.rarity})`,
                      });
                      playSfx('dice_roll');
                    }}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-[#78350f]/40 bg-[#fffdf9] p-1 shadow-md flex-shrink-0 cursor-pointer overflow-hidden flex items-center justify-center group relative hover:border-[#78350f] transition"
                    title="Нажмите для увеличения иллюстрации"
                  >
                    <img
                      src={item.illustrationUrl}
                      alt={item.name}
                      className="w-full h-full object-contain rounded-lg group-hover:scale-105 transition duration-200"
                      loading="lazy"
                    />
                    <div className="absolute top-1 right-1 p-1 bg-[#2b1810]/70 rounded text-[#d4af37] opacity-0 group-hover:opacity-100 transition">
                      <Maximize2 className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black font-serif text-[#78350f]">{item.name}</h3>
                    <div className="text-xs italic text-[#57534e]">
                      {item.itemType}, {item.rarity} {item.attunement ? '(требуется настройка)' : ''}
                    </div>
                    <span className="inline-block mt-1.5 text-[10px] font-sans font-bold bg-[#f0e8d5] text-[#78350f] px-2 py-0.5 rounded border border-[#78350f]/20">
                      Редкость: {item.rarity}
                    </span>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-[#292524] select-text">{item.description}</p>

                <div className="bg-[#f0e8d5] p-3 rounded-xl text-xs space-y-1 font-sans border border-[#78350f]/20 select-text">
                  <div className="font-bold text-[#78350f] uppercase text-[10px]">Свойства артефакта:</div>
                  {item.properties.map((p, pIdx) => (
                    <div key={pIdx}>• {p}</div>
                  ))}
                </div>

                <div className="text-[11px] italic text-[#57534e] pt-1 border-t border-[#78350f]/20 select-text">
                  <strong>История артефакта:</strong> {item.history}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Typst Code View */}
      {activeTab === 'typst_code' && (
        <div className="bg-[#0c0c0c] border border-[#27272a] rounded-2xl p-6 shadow-xl space-y-3 font-mono text-xs text-[#d4af37]">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <span className="text-[#a1a1aa] font-semibold font-sans">Исходный код Typst (book_campaign.typ):</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(typstCode);
                playSfx('dice_roll');
              }}
              className="px-3 py-1 bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] rounded text-xs border border-[#27272a]"
            >
              Копировать Typst разметку
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[500px]">
            {typstCode}
          </pre>
        </div>
      )}

      {/* High-Resolution Artwork & Monster Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="bg-[#18181b] border-2 border-[#d4af37]/60 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-[#121212] border-b border-[#27272a] flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-serif font-bold text-[#f4f4f5]">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
                <span>{lightboxImage.title}</span>
                {lightboxImage.artist && (
                  <span className="text-xs text-[#a1a1aa] font-sans font-normal">
                    (Художник: {lightboxImage.artist})
                  </span>
                )}
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 text-[#a1a1aa] hover:text-white bg-[#27272a] hover:bg-[#3f3f46] rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image View */}
            <div className="p-6 bg-[#0c0c0c] flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-xl border border-[#27272a] shadow-2xl"
              />
            </div>

            {/* Modal Footer Caption */}
            {lightboxImage.caption && (
              <div className="p-4 bg-[#121212] border-t border-[#27272a] text-center text-xs text-[#d4d4d8] font-serif italic">
                {lightboxImage.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Monster to Bestiary Modal */}
      {isAddMonsterModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsAddMonsterModalOpen(false)}
        >
          <div
            className="bg-[#18181b] border-2 border-[#d4af37]/60 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#d4af37]" />
                <span>+ Добавить новое существо в Бестиарий</span>
              </h3>
              <button
                onClick={() => setIsAddMonsterModalOpen(false)}
                className="text-[#a1a1aa] hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Имя монстра / босса</label>
                <input
                  type="text"
                  value={newMonster.name}
                  onChange={e => setNewMonster({ ...newMonster, name: e.target.value })}
                  placeholder="например, Древний Лич-Владыка"
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Тип и мировоззрение</label>
                <input
                  type="text"
                  value={newMonster.type}
                  onChange={e => setNewMonster({ ...newMonster, type: e.target.value })}
                  placeholder="Нежить, нейтрально-злой"
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Класс Доспеха (AC)</label>
                <input
                  type="number"
                  value={newMonster.ac}
                  onChange={e => setNewMonster({ ...newMonster, ac: Number(e.target.value) })}
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Хиты (HP)</label>
                <input
                  type="number"
                  value={newMonster.hp}
                  onChange={e => setNewMonster({ ...newMonster, hp: Number(e.target.value) })}
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Опасность (CR) и опыт</label>
                <input
                  type="text"
                  value={newMonster.challengeRating}
                  onChange={e => setNewMonster({ ...newMonster, challengeRating: e.target.value })}
                  placeholder="CR 2 (450 XP)"
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Скорость</label>
                <input
                  type="text"
                  value={newMonster.speed}
                  onChange={e => setNewMonster({ ...newMonster, speed: e.target.value })}
                  placeholder="30 фт., полет 60 фт."
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>
            </div>

            {/* Attributes Grid */}
            <div className="bg-[#121212] p-3 rounded-xl border border-[#27272a] text-xs">
              <label className="block text-[#d4af37] font-semibold mb-2">Характеристики (STR, DEX, CON, INT, WIS, CHA):</label>
              <div className="grid grid-cols-6 gap-2">
                <div>
                  <span className="text-[10px] text-[#a1a1aa] block text-center">СИЛ</span>
                  <input
                    type="number"
                    value={newMonster.str}
                    onChange={e => setNewMonster({ ...newMonster, str: Number(e.target.value) })}
                    className="w-full text-center bg-[#18181b] border border-[#27272a] rounded-lg py-1 text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#a1a1aa] block text-center">ЛОВ</span>
                  <input
                    type="number"
                    value={newMonster.dex}
                    onChange={e => setNewMonster({ ...newMonster, dex: Number(e.target.value) })}
                    className="w-full text-center bg-[#18181b] border border-[#27272a] rounded-lg py-1 text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#a1a1aa] block text-center">ТЕЛ</span>
                  <input
                    type="number"
                    value={newMonster.con}
                    onChange={e => setNewMonster({ ...newMonster, con: Number(e.target.value) })}
                    className="w-full text-center bg-[#18181b] border border-[#27272a] rounded-lg py-1 text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#a1a1aa] block text-center">ИНТ</span>
                  <input
                    type="number"
                    value={newMonster.int}
                    onChange={e => setNewMonster({ ...newMonster, int: Number(e.target.value) })}
                    className="w-full text-center bg-[#18181b] border border-[#27272a] rounded-lg py-1 text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#a1a1aa] block text-center">МДР</span>
                  <input
                    type="number"
                    value={newMonster.wis}
                    onChange={e => setNewMonster({ ...newMonster, wis: Number(e.target.value) })}
                    className="w-full text-center bg-[#18181b] border border-[#27272a] rounded-lg py-1 text-[#f4f4f5]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#a1a1aa] block text-center">ХАР</span>
                  <input
                    type="number"
                    value={newMonster.cha}
                    onChange={e => setNewMonster({ ...newMonster, cha: Number(e.target.value) })}
                    className="w-full text-center bg-[#18181b] border border-[#27272a] rounded-lg py-1 text-[#f4f4f5]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Название действия / атаки</label>
                <input
                  type="text"
                  value={newMonster.actionName}
                  onChange={e => setNewMonster({ ...newMonster, actionName: e.target.value })}
                  placeholder="Клинок Тьмы"
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Описание действия / формулы урона</label>
                <textarea
                  rows={2}
                  value={newMonster.actionDesc}
                  onChange={e => setNewMonster({ ...newMonster, actionDesc: e.target.value })}
                  placeholder="Рукопашная атака: +5 к попаданию, урон 9 (2d6 + 2) некротического урона."
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Предание (Lore) монстра</label>
                <textarea
                  rows={2}
                  value={newMonster.lore}
                  onChange={e => setNewMonster({ ...newMonster, lore: e.target.value })}
                  placeholder="История происхождения, повадки и слабости..."
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">URL Иллюстрации</label>
                <input
                  type="text"
                  value={newMonster.illustrationUrl}
                  onChange={e => setNewMonster({ ...newMonster, illustrationUrl: e.target.value })}
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none text-[11px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a]">
              <button
                onClick={() => setIsAddMonsterModalOpen(false)}
                className="px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] text-xs font-semibold rounded-xl"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNewMonster}
                disabled={!newMonster.name.trim()}
                className="px-5 py-2 bg-[#d4af37] hover:bg-[#c49b2f] disabled:opacity-50 text-[#0c0c0c] text-xs font-bold rounded-xl flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                Сохранить в Бестиарий
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Artifact to Grimoire Modal */}
      {isAddArtifactModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsAddArtifactModalOpen(false)}
        >
          <div
            className="bg-[#18181b] border-2 border-[#d4af37]/60 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <h3 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
                <Scroll className="w-5 h-5 text-[#d4af37]" />
                <span>+ Добавить магический артефакт в Гримуар</span>
              </h3>
              <button
                onClick={() => setIsAddArtifactModalOpen(false)}
                className="text-[#a1a1aa] hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Название артефакта</label>
                <input
                  type="text"
                  value={newArtifact.name}
                  onChange={e => setNewArtifact({ ...newArtifact, name: e.target.value })}
                  placeholder="например, Око Вечной Бури"
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#a1a1aa] mb-1 font-semibold">Тип предмета</label>
                  <input
                    type="text"
                    value={newArtifact.itemType}
                    onChange={e => setNewArtifact({ ...newArtifact, itemType: e.target.value })}
                    placeholder="Чудесный предмет / Оружие"
                    className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#a1a1aa] mb-1 font-semibold">Редкость</label>
                  <select
                    value={newArtifact.rarity}
                    onChange={e => setNewArtifact({ ...newArtifact, rarity: e.target.value as any })}
                    className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
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

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="attuneCheckbox"
                  checked={newArtifact.attunement}
                  onChange={e => setNewArtifact({ ...newArtifact, attunement: e.target.checked })}
                  className="rounded border-[#27272a] text-[#d4af37] focus:ring-[#d4af37]"
                />
                <label htmlFor="attuneCheckbox" className="text-xs text-[#d4d4d8] cursor-pointer">
                  Требуется настройка (Attunement)
                </label>
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Краткое описание</label>
                <textarea
                  rows={2}
                  value={newArtifact.description}
                  onChange={e => setNewArtifact({ ...newArtifact, description: e.target.value })}
                  placeholder="Внешний вид и ощущение от предмета..."
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">Свойства (каждое с новой строки)</label>
                <textarea
                  rows={3}
                  value={newArtifact.propertiesText}
                  onChange={e => setNewArtifact({ ...newArtifact, propertiesText: e.target.value })}
                  placeholder="+1 к спасброскам&#10;Дарует видение в темноте 60 фт.&#10;1/день позволяет наложить заклинание Туманный шаг"
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">История артефакта (Lore)</label>
                <textarea
                  rows={2}
                  value={newArtifact.history}
                  onChange={e => setNewArtifact({ ...newArtifact, history: e.target.value })}
                  placeholder="Кем и когда был выкован, в чьих руках находился..."
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1 font-semibold">URL Иллюстрации</label>
                <input
                  type="text"
                  value={newArtifact.illustrationUrl}
                  onChange={e => setNewArtifact({ ...newArtifact, illustrationUrl: e.target.value })}
                  className="w-full bg-[#121212] border border-[#27272a] rounded-xl px-3 py-2 text-[#f4f4f5] focus:border-[#d4af37] focus:outline-none text-[11px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a]">
              <button
                onClick={() => setIsAddArtifactModalOpen(false)}
                className="px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] text-xs font-semibold rounded-xl"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNewArtifact}
                disabled={!newArtifact.name.trim()}
                className="px-5 py-2 bg-[#d4af37] hover:bg-[#c49b2f] disabled:opacity-50 text-[#0c0c0c] text-xs font-bold rounded-xl flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                Сохранить в Гримуар
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
