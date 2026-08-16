import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  RotateCcw,
  CheckCircle,
  Copy,
  Hash,
  Dice5,
} from 'lucide-react';
import { calculateCommitRevealD20, generateRandomSeed, sha256Commitment } from '../utils/cryptoDice';
import { playSfx } from '../utils/audioSynthesizer';

interface CryptoDiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CryptoDiceModal: React.FC<CryptoDiceModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [playerSeed, setPlayerSeed] = useState<string>(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  const [masterSeed, setMasterSeed] = useState<string>(
    '8f4a1c90e2b3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9'
  );
  const [playerCommitment, setPlayerCommitment] = useState<string>('');
  const [masterCommitment, setMasterCommitment] = useState<string>('');
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      updateCommitments();
      runCalculation();
    }
  }, [isOpen, playerSeed, masterSeed]);

  const updateCommitments = async () => {
    const pc = await sha256Commitment(playerSeed);
    const mc = await sha256Commitment(masterSeed);
    setPlayerCommitment(pc);
    setMasterCommitment(mc);
  };

  const runCalculation = async () => {
    setIsCalculating(true);
    const res = await calculateCommitRevealD20(playerSeed, masterSeed);
    setCalculationResult(res);
    setIsCalculating(false);
  };

  const handleRollNew = () => {
    setPlayerSeed(generateRandomSeed('player_seed'));
    setMasterSeed(generateRandomSeed('master_seed'));
    playSfx('dice_roll');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-[#27272a] rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-fade-in">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-xl text-[#d4af37]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#f4f4f5]">
                Криптографический движок бросков (Commit-Reveal D20)
              </h3>
              <p className="text-xs text-[#a1a1aa]">
                Детерминированная проверка честности без доверия третьей стороне
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] hover:text-[#f4f4f5] text-lg font-bold p-1.5"
          >
            ✕
          </button>
        </div>

        {/* Formula Banner */}
        <div className="p-3.5 bg-[#0c0c0c] border border-[#27272a] rounded-2xl text-xs font-mono text-center text-[#d4af37]">
          <span className="text-[#a1a1aa]">Каноническая формула:</span>{' '}
          <strong>D20 = ( HMAC_SHA256( Seed_player, Seed_master ) mod 20 ) + 1</strong>
        </div>

        {/* Seeds Inputs */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[#d4d4d8] mb-1">
              <span>Сид игрока (Seed_player):</span>
              <span className="text-[10px] text-[#71717a] font-mono">
                SHA-256 Commit: {playerCommitment.substring(0, 16)}...
              </span>
            </div>
            <input
              type="text"
              value={playerSeed}
              onChange={e => setPlayerSeed(e.target.value)}
              className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[#d4d4d8] mb-1">
              <span>Сид Мастера (Seed_master):</span>
              <span className="text-[10px] text-[#71717a] font-mono">
                SHA-256 Commit: {masterCommitment.substring(0, 16)}...
              </span>
            </div>
            <input
              type="text"
              value={masterSeed}
              onChange={e => setMasterSeed(e.target.value)}
              className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl p-2.5 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Live Calculation Output Result */}
        {calculationResult && (
          <div className="p-5 bg-[#0c0c0c] border border-[#d4af37]/40 rounded-2xl flex items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <div className="text-xs text-[#a1a1aa] font-medium">Результат броска D20:</div>
              <div className="text-3xl font-black text-[#d4af37] font-mono flex items-center gap-2">
                <span>{calculationResult.d20}</span>
                {calculationResult.isCritSuccess && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-bold">
                    NATURAL 20! 🔥
                  </span>
                )}
                {calculationResult.isCritFail && (
                  <span className="text-xs px-2 py-0.5 bg-red-950 text-red-300 border border-red-800 rounded font-bold">
                    CRITICAL FAIL! 💀
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#71717a] font-mono">
                Formula: {calculationResult.formula}
              </div>
            </div>

            <div className="text-right font-mono text-[10px] text-[#71717a] max-w-[200px] truncate">
              HMAC: {calculationResult.hmacHex}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[#27272a]">
          <button
            onClick={handleRollNew}
            className="px-4 py-2 bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-[#27272a]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сгенерировать новые случайные сиды
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#eab308] hover:to-[#d4af37] text-[#0c0c0c] rounded-xl text-xs font-black transition shadow-md shadow-[#d4af37]/20"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
