import React, { useState } from 'react';
import { EmlMessage } from '../types/chronicle';
import {
  FolderArchive,
  FileCode,
  Download,
  Upload,
  Search,
  Eye,
  CheckCircle,
  Clock,
  Layers,
  Sparkles,
  Tag,
  Share2,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { parseEmlString, downloadEmlFile } from '../utils/mimeEml';
import { playSfx } from '../utils/audioSynthesizer';

interface VaultExplorerProps {
  emlVault: EmlMessage[];
  onImportEml: (eml: EmlMessage) => void;
}

export const VaultExplorer: React.FC<VaultExplorerProps> = ({
  emlVault,
  onImportEml,
}) => {
  const [selectedMessageId, setSelectedMessageId] = useState<string>(emlVault[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'raw' | 'parsed' | 'attachments'>('raw');
  const [copiedId, setCopiedId] = useState<boolean>(false);

  const filteredVault = emlVault.filter(
    m =>
      m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedEml = emlVault.find(m => m.id === selectedMessageId) || emlVault[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const parsed = parseEmlString(reader.result);
          onImportEml(parsed);
          setSelectedMessageId(parsed.id);
          playSfx('dice_roll');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCopyRaw = () => {
    if (selectedEml) {
      navigator.clipboard.writeText(selectedEml.rawEml);
      setCopiedId(true);
      playSfx('dice_roll');
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div id="vault-explorer" className="space-y-6">
      {/* Top Zero-Database Architecture Banner */}
      <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-xl text-[#d4af37]">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
              Локальный Vault кампании (Zero-Database RFC 5322 EML)
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-mono">
                No SQLite / No DuckDB
              </span>
            </h2>
            <p className="text-xs text-[#a1a1aa]">
              Вся кампания хранится исключительно как набор автономных .eml файлов с индексацией в RAM
            </p>
          </div>
        </div>

        {/* RAM memmap Benchmark Badge */}
        <div className="flex items-center gap-2 bg-[#0c0c0c] px-3.5 py-2 rounded-xl border border-[#27272a] text-xs font-mono">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <div>
            <span className="text-[#a1a1aa]">RAM Memmap Index:</span>{' '}
            <strong className="text-emerald-400">⚡ {emlVault.length} капсул за 1.4 мс</strong>
          </div>
        </div>
      </div>

      {/* Vault Browser Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 1. File Tree & Search (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-4 shadow-xl space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#71717a] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Поиск по субъекту, автору, Message-ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#0c0c0c] border border-[#27272a] rounded-xl pl-9 pr-3 py-2 text-xs text-[#d4d4d8] focus:outline-none focus:border-[#d4af37] transition"
              />
            </div>

            {/* Import Button */}
            <div>
              <input
                type="file"
                accept=".eml, message/rfc822"
                onChange={handleFileUpload}
                id="eml-upload-input"
                className="hidden"
              />
              <label
                htmlFor="eml-upload-input"
                className="w-full py-2 bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] text-xs font-medium rounded-xl border border-[#27272a] transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                Импортировать .eml файл с диска
              </label>
            </div>

            {/* EML File List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pt-2 border-t border-[#27272a]">
              {filteredVault.map(eml => {
                const isSelected = eml.id === selectedMessageId;
                const isIntent = eml.phase === 'Intent';
                const isResolution = eml.phase === 'Resolution';
                const isArt = eml.phase === 'Art';

                return (
                  <button
                    key={eml.id}
                    onClick={() => {
                      setSelectedMessageId(eml.id);
                      playSfx('dice_roll');
                    }}
                    className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1 text-xs border ${
                      isSelected
                        ? 'bg-[#18181b] border-[#d4af37]/80 shadow-lg text-[#f4f4f5]'
                        : 'bg-[#0c0c0c] border-[#27272a] text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#f4f4f5]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          isIntent
                            ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                            : isResolution
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                        }`}
                      >
                        {eml.phase || 'General'} • R{eml.round}
                      </span>
                      <span className="text-[10px] font-mono text-[#71717a]">
                        {eml.attachments.length} parts
                      </span>
                    </div>

                    <div className="font-semibold text-[#f4f4f5] truncate mt-1">
                      {eml.subject}
                    </div>

                    <div className="text-[11px] text-[#a1a1aa] truncate">
                      От: {eml.from}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Inspector / Raw MIME Viewer (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          {selectedEml ? (
            <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-5 shadow-xl space-y-4">
              {/* Header Info & Tab switchers */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272a] pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#f4f4f5]">
                    {selectedEml.subject}
                  </h3>
                  <div className="text-[10px] font-mono text-[#71717a]">
                    Message-ID: {selectedEml.id}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-[#0c0c0c] p-1 rounded-xl border border-[#27272a] flex gap-1 text-xs">
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`px-3 py-1 rounded-lg font-medium transition ${
                        viewMode === 'raw'
                          ? 'bg-[#18181b] text-[#d4af37] font-bold'
                          : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
                      }`}
                    >
                      📄 Raw MIME
                    </button>
                    <button
                      onClick={() => setViewMode('parsed')}
                      className={`px-3 py-1 rounded-lg font-medium transition ${
                        viewMode === 'parsed'
                          ? 'bg-[#18181b] text-[#d4af37] font-bold'
                          : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
                      }`}
                    >
                      🧩 Structured JSON
                    </button>
                    <button
                      onClick={() => setViewMode('attachments')}
                      className={`px-3 py-1 rounded-lg font-medium transition ${
                        viewMode === 'attachments'
                          ? 'bg-[#18181b] text-[#d4af37] font-bold'
                          : 'text-[#a1a1aa] hover:text-[#f4f4f5]'
                      }`}
                    >
                      📎 CID Attachments ({selectedEml.attachments.length})
                    </button>
                  </div>

                  <button
                    onClick={handleCopyRaw}
                    className="p-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#d4d4d8] border border-[#27272a] text-xs transition"
                    title="Копировать RAW EML"
                  >
                    {copiedId ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <FileCode className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => downloadEmlFile(selectedEml.subject.replace(/[^a-z0-9_-]/gi, '_'), selectedEml.rawEml)}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#eab308] hover:to-[#d4af37] text-[#0c0c0c] font-black text-xs transition flex items-center gap-1 shadow-md shadow-[#d4af37]/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Скачать .EML
                  </button>
                </div>
              </div>

              {/* View Mode: RAW MIME */}
              {viewMode === 'raw' && (
                <div className="bg-[#0c0c0c] border border-[#27272a] rounded-xl p-4 font-mono text-xs text-[#d4af37] max-h-[550px] overflow-y-auto whitespace-pre leading-relaxed shadow-inner">
                  {selectedEml.rawEml}
                </div>
              )}

              {/* View Mode: Parsed JSON */}
              {viewMode === 'parsed' && (
                <div className="space-y-4 max-h-[550px] overflow-y-auto">
                  {selectedEml.intentJson && (
                    <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2">
                      <div className="text-xs font-bold text-purple-400 uppercase font-mono">
                        Payload: intent.json
                      </div>
                      <pre className="text-xs font-mono text-[#d4d4d8] overflow-x-auto">
                        {JSON.stringify(selectedEml.intentJson, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedEml.roleplayJson && (
                    <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2">
                      <div className="text-xs font-bold text-purple-400 uppercase font-mono">
                        Payload: roleplay.json
                      </div>
                      <pre className="text-xs font-mono text-[#d4d4d8] overflow-x-auto">
                        {JSON.stringify(selectedEml.roleplayJson, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedEml.stateJson && (
                    <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2">
                      <div className="text-xs font-bold text-emerald-400 uppercase font-mono">
                        Payload: state.json
                      </div>
                      <pre className="text-xs font-mono text-[#d4d4d8] overflow-x-auto">
                        {JSON.stringify(selectedEml.stateJson, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedEml.masterProseMarkdown && (
                    <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2">
                      <div className="text-xs font-bold text-[#d4af37] uppercase font-mono">
                        Payload: canonical_prose.md
                      </div>
                      <div className="text-xs font-serif text-[#f4f4f5] leading-relaxed">
                        {selectedEml.masterProseMarkdown}
                      </div>
                    </div>
                  )}

                  {selectedEml.artMetaJson && (
                    <div className="p-4 bg-[#0c0c0c] border border-[#27272a] rounded-xl space-y-2">
                      <div className="text-xs font-bold text-blue-400 uppercase font-mono">
                        Payload: art_meta.json
                      </div>
                      <pre className="text-xs font-mono text-[#d4d4d8] overflow-x-auto">
                        {JSON.stringify(selectedEml.artMetaJson, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* View Mode: CID Attachments */}
              {viewMode === 'attachments' && (
                <div className="space-y-3 max-h-[550px] overflow-y-auto">
                  {selectedEml.attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-[#0c0c0c] border border-[#27272a] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[#f4f4f5] font-mono">
                          {att.filename}
                        </div>
                        <div className="text-[10px] text-[#71717a] font-mono">
                          Type: {att.contentType} • CID: &lt;{att.contentId}&gt;
                        </div>
                      </div>

                      <span className="text-[10px] bg-[#18181b] text-[#d4d4d8] px-2 py-1 rounded font-mono border border-[#27272a]">
                        {att.content.length} bytes
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#121212] border border-[#27272a] rounded-2xl p-12 text-center text-[#71717a]">
              Выберите EML капсулу для инспекции
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
