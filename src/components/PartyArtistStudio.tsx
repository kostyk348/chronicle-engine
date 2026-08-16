import React, { useState } from 'react';
import { BookPlacement, ArtMetaPayload } from '../types/chronicle';
import {
  Palette,
  Upload,
  Image as ImageIcon,
  CheckCircle,
  FileCode,
  Sparkles,
  Layers,
  Layout,
  Send,
  Eye,
} from 'lucide-react';
import { buildPartyArtEml, downloadEmlFile } from '../utils/mimeEml';
import { playSfx } from '../utils/audioSynthesizer';

interface PartyArtistStudioProps {
  currentRound: number;
  onAddArtPiece: (rawEml: string, artMeta: ArtMetaPayload, imageUrl: string) => void;
}

export const PartyArtistStudio: React.FC<PartyArtistStudioProps> = ({
  currentRound,
  onAddArtPiece,
}) => {
  const [artistCredit, setArtistCredit] = useState<string>('Анна (Эльф-Следопыт / Художник партии)');
  const [caption, setCaption] = useState<string>('Торин наносит решающий удар по алтарю');
  const [bookPlacement, setBookPlacement] = useState<BookPlacement>('FullPageSpread');
  const [targetRound, setTargetRound] = useState<number>(3);
  const [imageUrl, setImageUrl] = useState<string>(
    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80'
  );
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isTransmitted, setIsTransmitted] = useState<boolean>(false);

  const presets = [
    {
      title: 'Торин добивает шамана у алтаря',
      url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
      placement: 'FullPageSpread' as BookPlacement,
      caption: 'Рис. 3.1. Решающий удар секирой по каменному алтарю. Автор: @Anna_Ranger (300 DPI)',
      round: 3,
    },
    {
      title: 'Врата Древнего Склепа',
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
      placement: 'ChapterHeader' as BookPlacement,
      caption: 'Рис. 1.1. Базальтовые кованые врата крипты. Автор: @Anna_Ranger',
      round: 1,
    },
    {
      title: 'Схватка в зале саркофагов',
      url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
      placement: 'Inline' as BookPlacement,
      caption: 'Рис. 2.1. Тени и клинки в зале предков. Автор: @Anna_Ranger',
      round: 2,
    },
    {
      title: 'Гоблинский Пепельный Шаман (Бестиарий)',
      url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80',
      placement: 'Bestiary' as BookPlacement,
      caption: 'Иллюстрация к статье Бестиария: Пепельный Шаман. Автор: @Anna_Ranger',
      round: 3,
    },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageUrl(reader.result);
          playSfx('dice_roll');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageUrl(reader.result);
          playSfx('dice_roll');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTransmitArt = () => {
    const artMeta: ArtMetaPayload = {
      artist_credit: artistCredit,
      caption,
      book_placement: bookPlacement,
      link_to_scene_id: `round-${targetRound.toString().padStart(2, '0')}-resolution@vault.local`,
    };

    const rawEml = buildPartyArtEml(
      {
        from: `${artistCredit} <anna@player.local>`,
        to: 'Campaign Vault <vault@chronicle.local>',
        subject: `[Art Asset] ${caption}`,
        messageId: `<art-r${targetRound.toString().padStart(2, '0')}-${Date.now().toString(36)}@vault.local>`,
        targetRound,
        assetType: 'Illustration',
      },
      artMeta,
      imageUrl.startsWith('data:') ? imageUrl.split(',')[1] : undefined
    );

    onAddArtPiece(rawEml, artMeta, imageUrl);
    setIsTransmitted(true);
    playSfx('shield_block');
    setTimeout(() => setIsTransmitted(false), 4000);
  };

  const handleDownloadArtEml = () => {
    const artMeta: ArtMetaPayload = {
      artist_credit: artistCredit,
      caption,
      book_placement: bookPlacement,
      link_to_scene_id: `round-${targetRound.toString().padStart(2, '0')}-resolution@vault.local`,
    };

    const rawEml = buildPartyArtEml(
      {
        from: `${artistCredit} <anna@player.local>`,
        to: 'Campaign Vault <vault@chronicle.local>',
        subject: `[Art Asset] ${caption}`,
        messageId: `<art-r${targetRound.toString().padStart(2, '0')}-torin-kill@vault.local>`,
        targetRound,
        assetType: 'Illustration',
      },
      artMeta
    );

    downloadEmlFile(`Party_Art_R${targetRound}`, rawEml);
  };

  return (
    <div id="party-artist-studio" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* 1. Artwork Upload & Metadata Form (6 cols) */}
      <div className="lg:col-span-6 space-y-4">
        <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-[#d4af37]" />
              <div>
                <h3 className="text-sm font-semibold text-[#f4f4f5]">
                  Модуль «Художник партии» (Party Artist Subsystem)
                </h3>
                <p className="text-[11px] text-[#a1a1aa]">
                  Загрузка иллюстраций 300 DPI и привязка к сценам для верстки в книгу
                </p>
              </div>
            </div>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition flex flex-col items-center justify-center gap-3 cursor-pointer ${
              isDragOver
                ? 'border-[#d4af37] bg-[#d4af37]/10'
                : 'border-[#27272a] bg-[#0c0c0c] hover:border-[#3f3f46]'
            }`}
          >
            <input
              type="file"
              accept="image/png, image/jpeg, image/svg+xml"
              onChange={handleFileUpload}
              className="hidden"
              id="art-file-input"
            />
            <label htmlFor="art-file-input" className="cursor-pointer flex flex-col items-center gap-2">
              <div className="p-3 bg-[#18181b] rounded-full text-[#d4af37] border border-[#27272a] shadow-md">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-xs font-semibold text-[#f4f4f5]">
                Перетащите изображение сюда или выберите файл
              </div>
              <div className="text-[10px] text-[#71717a] font-mono">
                Поддерживаются PNG, JPEG, SVG (300 DPI, CMYK профиль)
              </div>
            </label>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-semibold text-[#a1a1aa]">Готовые иллюстрации кампании:</div>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setImageUrl(p.url);
                    setCaption(p.caption);
                    setBookPlacement(p.placement);
                    setTargetRound(p.round);
                    playSfx('dice_roll');
                  }}
                  className="p-2 bg-[#0c0c0c] hover:bg-[#18181b] border border-[#27272a] rounded-xl text-left transition flex items-center gap-2 group"
                >
                  <img src={p.url} alt={p.title} className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
                  <div className="overflow-hidden">
                    <div className="text-xs font-medium text-[#d4d4d8] truncate group-hover:text-[#d4af37]">
                      {p.title}
                    </div>
                    <div className="text-[10px] text-[#71717a] font-mono">Раунд {p.round} • {p.placement}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3 pt-2 border-t border-[#27272a]">
            <div>
              <label className="text-xs font-medium text-[#d4d4d8]">Автор иллюстрации (Artist Credit):</label>
              <input
                type="text"
                value={artistCredit}
                onChange={e => setArtistCredit(e.target.value)}
                className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#d4d4d8] focus:outline-none focus:border-[#d4af37] transition mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-[#d4d4d8]">Подпись к иллюстрации (Caption):</label>
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-[#d4d4d8] focus:outline-none focus:border-[#d4af37] transition mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#d4d4d8]">Привязка к Раунду:</label>
                <select
                  value={targetRound}
                  onChange={e => setTargetRound(parseInt(e.target.value, 10))}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2 text-xs text-[#d4af37] mt-1"
                >
                  <option value={1}>Раунд 1 (Врата склепа)</option>
                  <option value={2}>Раунд 2 (Саркофаги)</option>
                  <option value={3}>Раунд 3 (Алтарь пепла)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#d4d4d8]">Роль в верстке книги:</label>
                <select
                  value={bookPlacement}
                  onChange={e => setBookPlacement(e.target.value as BookPlacement)}
                  className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2 text-xs text-[#d4af37] mt-1"
                >
                  <option value="FullPageSpread">Разворот (FullPageSpread)</option>
                  <option value="ChapterHeader">Обложка главы (ChapterHeader)</option>
                  <option value="Inline">Врезка в текст (Inline)</option>
                  <option value="Margin">Боковая колонка (Margin)</option>
                  <option value="Bestiary">Иллюстрация Бестиария</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleTransmitArt}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#eab308] hover:to-[#d4af37] text-[#0c0c0c] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#d4af37]/20 transition active:scale-[0.98]"
            >
              <Send className="w-4 h-4" />
              Отправить Party_Art.eml в Vault
            </button>

            <button
              onClick={handleDownloadArtEml}
              className="px-4 py-3 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] text-xs font-semibold border border-[#27272a] transition flex items-center justify-center gap-1.5"
            >
              <FileCode className="w-4 h-4" />
              Скачать .EML
            </button>
          </div>

          {isTransmitted && (
            <div className="p-3 bg-emerald-950/90 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Иллюстрация и капсула <strong>Party_Art.eml</strong> успешно добавлены в верстку книги!</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Live Placement Preview on Book Page (6 cols) */}
      <div className="lg:col-span-6 space-y-4">
        <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#d4af37] flex items-center gap-2">
              <Layout className="w-4 h-4 text-[#d4af37]" />
              Предпросмотр макета страницы (Typst Layout)
            </h3>
            <span className="text-xs font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/50">
              {bookPlacement}
            </span>
          </div>

          {/* Book Page Frame on Aged Parchment */}
          <div className="bg-[#f7f3e8] border border-[#d4af37]/20 rounded-xl p-5 shadow-2xl text-stone-900 font-serif space-y-4">
            <div className="text-[10px] uppercase font-sans font-bold tracking-widest text-stone-600 border-b border-stone-300 pb-1 flex justify-between">
              <span>ХРОНИКА ОДИНОКОГО ПИКА</span>
              <span>РАУНД {targetRound} • СТР. {targetRound * 2 + 1}</span>
            </div>

            {/* Placement Layout rendering */}
            {bookPlacement === 'FullPageSpread' && (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border border-stone-300 shadow-md">
                  <img src={imageUrl} alt={caption} className="w-full h-64 object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-stone-950/80 p-2 text-stone-200 text-[11px] font-sans">
                    {caption} • Автор: {artistCredit}
                  </div>
                </div>
              </div>
            )}

            {bookPlacement === 'ChapterHeader' && (
              <div className="space-y-3">
                <div className="h-44 rounded-lg overflow-hidden border border-stone-300 shadow-md">
                  <img src={imageUrl} alt={caption} className="w-full h-full object-cover" />
                </div>
                <h2 className="text-xl font-bold font-serif text-stone-950">Глава {targetRound}. Сражение за Алтарь</h2>
                <p className="text-xs text-stone-700 leading-relaxed font-serif">
                  <span className="float-left text-3xl leading-none font-bold text-stone-950 pr-1.5">В</span>
                  оздух в крипте задрожал от запаха озона. Древние стены усыпальницы хранили молчание столетий, пока в зал не ворвалось пламя...
                </p>
              </div>
            )}

            {bookPlacement === 'Inline' && (
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="text-xs text-stone-700 leading-relaxed space-y-1.5 font-serif">
                  <p>
                    Секира Торина опустилась на алтарь, расколов ритуальный сосуд. Вспышка синего света озарила лица героев.
                  </p>
                  <p className="text-[10px] text-stone-500 italic">
                    «Каждый удар был выверен до дюйма...»
                  </p>
                </div>
                <div className="space-y-1">
                  <img src={imageUrl} alt={caption} className="w-full h-36 object-cover rounded-lg border border-stone-300 shadow" />
                  <div className="text-[9px] text-stone-600 font-sans italic text-center">
                    {caption}
                  </div>
                </div>
              </div>
            )}

            {bookPlacement === 'Bestiary' && (
              <div className="p-3 bg-amber-50 border border-amber-800/30 rounded-lg space-y-2">
                <div className="flex gap-3">
                  <img src={imageUrl} alt={caption} className="w-24 h-24 object-cover rounded border border-amber-900/30 shadow" />
                  <div className="text-xs font-sans space-y-1">
                    <div className="font-bold text-amber-950">Статья Бестиария: Пепельный Шаман</div>
                    <div className="text-[10px] text-stone-600">КД: 13 | HP: 28 | Скорость: 30 фт.</div>
                    <div className="text-[10px] text-stone-700 italic font-serif">
                      «Обитатели погребальных курганов, черпающие силу в пламени костров...»
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
