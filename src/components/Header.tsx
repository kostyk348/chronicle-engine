import React from 'react';
import {
  Compass,
  Feather,
  Palette,
  BookOpen,
  Headphones,
  HardDrive,
  Sparkles,
  Dice5,
  Scroll,
  Users,
  Save,
  FolderOpen,
} from 'lucide-react';
import { playSfx } from '../utils/audioSynthesizer';

export type ActiveTab = 'tactical' | 'party' | 'dm_scribe' | 'artist' | 'book' | 'audiobook' | 'vault';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentRound: number;
  onRoundChange: (round: number) => void;
  onOpenDiceModal: () => void;
  emlCount: number;
  onSaveCampaign?: () => void;
  onLoadCampaign?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  currentRound,
  onRoundChange,
  onOpenDiceModal,
  emlCount,
  onSaveCampaign,
  onLoadCampaign,
}) => {
  const tabs = [
    { id: 'tactical', label: 'Тактический бой (WEGO)', icon: Compass },
    { id: 'party', label: 'Герои и Инвентарь (D&D 5e)', icon: Users },
    { id: 'dm_scribe', label: 'Кабинет Мастера (DM Scribe)', icon: Feather },
    { id: 'artist', label: 'Художник партии', icon: Palette },
    { id: 'book', label: 'Верстка книги (Typst)', icon: BookOpen },
    { id: 'audiobook', label: 'Аудиоспектакль (.M4B)', icon: Headphones },
    { id: 'vault', label: 'EML Vault', badge: emlCount, icon: HardDrive },
  ];

  return (
    <header className="bg-[#121212]/95 border-b border-[#27272a] sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Upper branding and status bar */}
        <div className="py-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#27272a]/70">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#d4af37] to-[#996515] rounded-xl text-[#0c0c0c] font-black shadow-lg shadow-[#d4af37]/20 flex items-center justify-center">
              <Scroll className="w-5 h-5 text-[#0c0c0c]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#f4f4f5] tracking-wide">
                  Chronicle Engine
                </h1>
                <span className="text-[10px] font-mono uppercase bg-[#18181b] text-[#d4af37] px-2 py-0.5 rounded border border-[#d4af37]/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse"></span>
                  RFC 5322 Zero-DB
                </span>
              </div>
              <p className="text-[11px] text-[#a1a1aa]">
                Мультимодальная платформа асинхронного TTRPG с модулем верстки книг и аудиоспектаклей
              </p>
            </div>
          </div>

          {/* Round Selector & Crypto Dice Trigger */}
          <div className="flex items-center gap-3">
            {/* Campaign file save/load (desktop only) */}
            {onSaveCampaign && onLoadCampaign && (
              <div className="flex items-center bg-[#0c0c0c] border border-[#27272a] rounded-xl p-1 text-xs">
                <button
                  onClick={() => { onSaveCampaign(); playSfx('dice_roll'); }}
                  className="px-3 py-1.5 rounded-lg font-mono font-bold text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#18181b] flex items-center gap-1.5 transition"
                  title="Сохранить кампанию в файл"
                >
                  <Save className="w-3.5 h-3.5" />
                  Сохранить
                </button>
                <button
                  onClick={() => { onLoadCampaign(); playSfx('dice_roll'); }}
                  className="px-3 py-1.5 rounded-lg font-mono font-bold text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#18181b] flex items-center gap-1.5 transition"
                  title="Загрузить кампанию из файла"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Открыть
                </button>
              </div>
            )}

            {/* Round Badge */}
            <div className="flex items-center bg-[#0c0c0c] border border-[#27272a] rounded-xl p-1 text-xs">
              <span className="text-[#a1a1aa] px-2 font-mono">Раунд:</span>
              {[1, 2, 3].map(r => (
                <button
                  key={r}
                  onClick={() => {
                    onRoundChange(r);
                    playSfx('dice_roll');
                  }}
                  className={`px-3 py-1 rounded-lg font-mono font-bold transition ${
                    currentRound === r
                      ? 'bg-[#d4af37] text-[#0c0c0c] shadow-sm font-black'
                      : 'text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#18181b]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Crypto Dice Proofs Modal Trigger */}
            <button
              onClick={() => {
                onOpenDiceModal();
                playSfx('dice_roll');
              }}
              className="px-3.5 py-2 bg-[#18181b] hover:bg-[#27272a] text-[#d4af37] border border-[#d4af37]/30 rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 transition shadow-sm hover:border-[#d4af37]/60"
              title="Открыть криптографический расчет бросков"
            >
              <Dice5 className="w-4 h-4 text-[#d4af37]" />
              <span>Crypto D20</span>
            </button>
          </div>
        </div>

        {/* Lower navigation tabs */}
        <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id as ActiveTab);
                  playSfx('dice_roll');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#d4af37]/15 text-[#d4af37] border border-[#d4af37]/40 shadow-sm'
                    : 'text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#18181b]/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#d4af37]' : 'text-[#71717a]'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'bg-[#27272a] text-[#a1a1aa]'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
