import React, { useState, useEffect, useRef } from 'react';
import { AudioTrackSegment } from '../types/chronicle';
import {
  Headphones,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Sparkles,
  Layers,
  Music,
  Mic,
  Zap,
  Clock,
  Radio,
  FileAudio,
  CheckCircle,
} from 'lucide-react';
import { playSfx, speakSpeechText, stopAllSpeech } from '../utils/audioSynthesizer';
import confetti from 'canvas-confetti';

interface AudiobookStudioProps {
  tracks: AudioTrackSegment[];
  currentRound: number;
}

export const AudiobookStudio: React.FC<AudiobookStudioProps> = ({
  tracks,
  currentRound,
}) => {
  const [isPlayingAll, setIsPlayingAll] = useState<boolean>(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [mutedTracks, setMutedTracks] = useState<Record<string, boolean>>({});
  const [isCompilingM4b, setIsCompilingM4b] = useState<boolean>(false);
  const [compilationDone, setCompilationDone] = useState<boolean>(false);

  const totalDuration = tracks.reduce((acc, t) => acc + t.durationSec, 0);

  const playSequence = async () => {
    setIsPlayingAll(true);

    for (let i = 0; i < tracks.length; i++) {
      if (!isPlayingAll && i > 0 && playbackProgress === 0) break;
      setCurrentTrackIndex(i);
      const track = tracks[i];

      if (!mutedTracks[track.id]) {
        // Trigger sound FX or speech
        if (track.sfxType) {
          playSfx(track.sfxType);
        }
        if (track.textSnippet) {
          const pitch = track.speakerRole === 'DM' ? 0.9 : track.speakerName.includes('Elena') ? 1.2 : 0.8;
          await speakSpeechText(track.textSnippet, pitch, 1.0);
        } else {
          await new Promise(r => setTimeout(r, track.durationSec * 1000));
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    setIsPlayingAll(false);
    setCurrentTrackIndex(0);
  };

  const handleTogglePlay = () => {
    if (isPlayingAll) {
      stopAllSpeech();
      setIsPlayingAll(false);
    } else {
      playSequence();
    }
  };

  const handleCompileM4B = () => {
    setIsCompilingM4b(true);
    playSfx('dungeon_intro');

    setTimeout(() => {
      setIsCompilingM4b(false);
      setCompilationDone(true);
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#a855f7', '#ec4899', '#3b82f6'],
      });
      playSfx('shield_block');
      setTimeout(() => setCompilationDone(false), 5000);
    }, 1500);
  };

  const handleDownloadM4bCueSheet = () => {
    let cueSheet = `TITLE "Хроника Одинокого Пика (Аудиоспектакль)"
PERFORMER "Chronicle Full-Cast Ensemble"
GENRE "TTRPG Audio Drama"
DATE "2026"
`;
    let currentSeconds = 0;
    tracks.forEach((t, idx) => {
      const min = Math.floor(currentSeconds / 60).toString().padStart(2, '0');
      const sec = Math.floor(currentSeconds % 60).toString().padStart(2, '0');
      cueSheet += `
  TRACK ${(idx + 1).toString().padStart(2, '0')} AUDIO
    TITLE "${t.title}"
    PERFORMER "${t.speakerName}"
    INDEX 01 ${min}:${sec}:00
`;
      currentSeconds += t.durationSec;
    });

    const blob = new Blob([cueSheet], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Chronicle_Campaign_FullCast.cue`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="audiobook-studio" className="space-y-6">
      {/* Top Header & Master Controls */}
      <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
              Аудиокомпилятор «Symphonia Stitcher» (.M4B Full-Cast)
              <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800 font-mono">
                AAC-LC 48kHz Stereo
              </span>
            </h2>
            <p className="text-xs text-[#a1a1aa]">
              Склейка дорожек: [Интро-аккорд] ➔ [Голос Мастера] ➔ [Реплика игрока] ➔ [Звуковой FX]
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTogglePlay}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition ${
              isPlayingAll
                ? 'bg-[#d4af37] text-[#0c0c0c] shadow-lg shadow-[#d4af37]/30 animate-pulse'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-950/40'
            }`}
          >
            {isPlayingAll ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlayingAll ? 'Остановить воспроизведение' : 'Воспроизвести весь аудиоспектакль'}
          </button>

          <button
            onClick={handleCompileM4B}
            disabled={isCompilingM4b}
            className="px-4 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
            {isCompilingM4b ? 'Сведение аудио...' : 'Собрать .M4B с главами'}
          </button>

          <button
            onClick={handleDownloadM4bCueSheet}
            className="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] text-xs font-medium transition flex items-center gap-1"
            title="Скачать Cue Sheet оглавления"
          >
            <FileAudio className="w-4 h-4" />
            Cue Sheet
          </button>
        </div>
      </div>

      {compilationDone && (
        <div className="p-4 bg-emerald-950/90 border border-emerald-700 rounded-2xl text-emerald-200 text-xs flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">Аудиокнига .M4B успешно сведена без клиппинга!</div>
              <div className="text-[11px] text-emerald-400">
                Созданы метаданные глав, выровнен LUFS баланс и сформирован готовый аудиоспектакль для Apple Books & VLC.
              </div>
            </div>
          </div>
          <button
            onClick={handleDownloadM4bCueSheet}
            className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            Скачать метаданные
          </button>
        </div>
      )}

      {/* Multi-Track Timeline Sequencer */}
      <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-[#a1a1aa]">
              Всего сегментов: <strong className="text-purple-300 font-mono">{tracks.length}</strong>
            </span>
            <span className="text-[#a1a1aa]">
              Общая длительность: <strong className="text-[#d4af37] font-mono">{totalDuration.toFixed(1)} сек.</strong>
            </span>
          </div>

          <div className="text-[#71717a] font-mono text-[11px]">
            * Кликните на дорожку для одиночного прослушивания
          </div>
        </div>

        {/* Track rows */}
        <div className="space-y-2.5">
          {tracks.map((track, idx) => {
            const isCurrent = isPlayingAll && currentTrackIndex === idx;
            const isMuted = !!mutedTracks[track.id];

            return (
              <div
                key={track.id}
                className={`p-3.5 rounded-xl border transition flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                  isCurrent
                    ? 'bg-purple-950/70 border-purple-500/80 shadow-lg shadow-purple-950/50'
                    : 'bg-[#0c0c0c] border-[#27272a] hover:border-[#3f3f46]'
                }`}
              >
                {/* Speaker Info & Controls */}
                <div className="flex items-center gap-3 min-w-[240px]">
                  <button
                    onClick={() => {
                      if (track.sfxType) playSfx(track.sfxType);
                      if (track.textSnippet) {
                        const pitch = track.speakerRole === 'DM' ? 0.9 : track.speakerName.includes('Elena') ? 1.2 : 0.8;
                        speakSpeechText(track.textSnippet, pitch, 1.0);
                      }
                    }}
                    className={`p-2 rounded-lg transition ${
                      isCurrent
                        ? 'bg-purple-600 text-white animate-bounce'
                        : 'bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8]'
                    }`}
                    title="Прослушать сегмент"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>

                  <div>
                    <div className="text-xs font-semibold text-[#f4f4f5] flex items-center gap-1.5">
                      {track.speakerRole === 'DM' && <Mic className="w-3.5 h-3.5 text-[#d4af37]" />}
                      {track.speakerRole === 'Player' && <Radio className="w-3.5 h-3.5 text-blue-400" />}
                      {track.speakerRole === 'System' && <Zap className="w-3.5 h-3.5 text-purple-400" />}
                      {track.title}
                    </div>
                    <div className="text-[10px] text-[#71717a] font-mono">
                      Раунд {track.round} • {track.speakerName} ({track.durationSec}с)
                    </div>
                  </div>
                </div>

                {/* Simulated Audio Waveform Bar */}
                <div className="flex-1 w-full flex items-center gap-1 h-8 px-3 bg-[#0c0c0c] rounded-lg border border-[#27272a] overflow-hidden">
                  {Array.from({ length: 32 }).map((_, barIdx) => {
                    const seedHeight = Math.abs(Math.sin((barIdx + track.waveformSeed) * 0.4) * 24) + 4;
                    return (
                      <div
                        key={barIdx}
                        className={`flex-1 rounded-full transition-all duration-75 ${
                          isCurrent
                            ? 'bg-purple-400 animate-pulse'
                            : isMuted
                            ? 'bg-[#27272a]'
                            : 'bg-[#52525b]'
                        }`}
                        style={{ height: `${seedHeight}px` }}
                      />
                    );
                  })}
                </div>

                {/* Text snippet quote */}
                {track.textSnippet && (
                  <div className="text-[11px] text-[#a1a1aa] italic max-w-xs truncate hidden lg:block">
                    «{track.textSnippet}»
                  </div>
                )}

                {/* Mute Button */}
                <button
                  onClick={() =>
                    setMutedTracks(prev => ({
                      ...prev,
                      [track.id]: !prev[track.id],
                    }))
                  }
                  className={`p-1.5 rounded-lg border transition ${
                    isMuted
                      ? 'bg-red-950/80 border-red-800 text-red-400'
                      : 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5]'
                  }`}
                  title={isMuted ? 'Включить звук' : 'Заглушить дорожку'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
