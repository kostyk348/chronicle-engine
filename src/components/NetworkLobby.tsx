/**
 * Chronicle Link — сетевой стол (лобби + фазы честного раунда).
 *
 * Хост открывает стол (TCP, порт), игроки подключаются по host:port.
 * Кампания переезжает одним свитком (welcome.campaign_eml). Раунд:
 * коммит → раскрытие → сверка чексумм канона. Без Tauri (браузер)
 * панель показывает оффлайн-заглушку, приложение не падает.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link2, Crown, Users, Send, ShieldCheck, ScrollText, Radio,
  Lock, Unlock, CheckCircle2, XCircle, LogOut, Copy, AlertTriangle, Dices,
} from 'lucide-react';
import {
  linkHost, linkJoin, linkSend, linkLeave, onLinkEvent,
  linkIntentCommit, linkIntentReveal, linkRoundResult,
  LinkPlayerInfo, LinkUiEvent,
} from '../utils/linkClient';
import {
  commitIntent, upsertCommit, upsertOutcome,
  newRoundState, upsertReveal, LinkRoundState, cheats as findCheats,
} from '../utils/linkProtocol';
import {
  parseFormula, seedToRng, rollDice, diceCommit, verifyDiceReveal,
  upsertDiceCommit, applyDiceReveal, DiceRollEntry, DiceRevealBody,
} from '../utils/diceEngine';
import { diffCanon, CanonState, CanonEntity } from '../utils/canonSync';
import { generateRandomSeed } from '../utils/cryptoDice';
import { Entity } from '../types/chronicle';

const TOKEN_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#ec4899', '#14b8a6'];

const DICE_PRESETS = ['d20', 'd100', '2d6+3', '4d6kh3', '2d20kl1'];

interface NetworkLobbyProps {
  round: number;
  entities: Entity[];
  /** сериализованный снапшот кампании — уедет игрокам в welcome */
  campaignScroll: string;
  /** строки журнала боя — уедут игрокам в каноне раунда */
  mechanicalLogs: string[];
  /** применить принятый свиток к локальной кампании */
  onApplyScroll: (text: string) => void;
  /** применить канон раунда (сущности + журнал) к локальной кампании */
  onApplyCanon: (canon: CanonState) => void;
}

interface LogLine {
  at: string;
  text: string;
  tone: 'info' | 'ok' | 'warn' | 'chat';
}

function nowStamp(): string {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false });
}

const NetworkLobby: React.FC<NetworkLobbyProps> = ({
  round, entities, campaignScroll, mechanicalLogs, onApplyScroll, onApplyCanon,
}) => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<'host' | 'client' | ''>('');
  const [myName, setMyName] = useState('Мастер');
  const [tableName, setTableName] = useState('Пепельная крипта');
  const [port, setPort] = useState(7788);
  const [addr, setAddr] = useState('127.0.0.1:7788');
  const [shareScroll, setShareScroll] = useState(true);
  const [players, setPlayers] = useState<LinkPlayerInfo[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [incomingScroll, setIncomingScroll] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roundState, setRoundState] = useState<LinkRoundState | null>(null);
  const [intentDraft, setIntentDraft] = useState('{"type":"attack","target_id":"mob_shaman"}');
  const [diceSeed, setDiceSeed] = useState('');
  const [pendingIntent, setPendingIntent] = useState<{ commit: string; intent: unknown; seed: string } | null>(null);
  const [hostAddr, setHostAddr] = useState<string | null>(null);
  const [diceRolls, setDiceRolls] = useState<DiceRollEntry[]>([]);
  const [diceFormula, setDiceFormula] = useState('d20');
  const [incomingCanon, setIncomingCanon] = useState<{ from: string; canon: CanonState } | null>(null);
  /** свои нераскрытые броски: сид и результат не видны столу до раскрытия */
  const mySecretRolls = useRef<Map<string, { label: string; commit: string; total: number; detail: string; seed: string }>>(new Map());
  const logRef = useRef<HTMLDivElement>(null);

  const push = useCallback((text: string, tone: LogLine['tone'] = 'info') => {
    setLog(prev => [...prev.slice(-200), { at: nowStamp(), text, tone }]);
  }, []);

  useEffect(() => {
    setIsDesktop(typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  }, []);

  const handleEnvelope = useCallback((env: { kind: string; from: string; body: unknown }) => {
    if (env.kind === 'welcome') {
      const body = env.body as { campaign_eml?: string | null; table?: string };
      if (body.table) push(`Стол «${body.table}» приветствует тебя`, 'ok');
      if (body.campaign_eml) {
        setIncomingScroll(body.campaign_eml);
        push(`Свиток кампании принят (${body.campaign_eml.length} байт) — готов к применению`, 'ok');
      }
      return;
    }
    if (env.kind === 'roster') {
      setPlayers(env.body as LinkPlayerInfo[]);
      return;
    }
    if (env.kind === 'chat') {
      // своё эхо не печатаем: doChat уже показал реплику локально
      if (env.from === myName) return;
      const body = env.body as { text?: string };
      push(`${env.from}: ${body.text ?? ''}`, 'chat');
      return;
    }
    if (env.kind === 'error') {
      const body = env.body as { text?: string };
      push(`Хост: ${body.text ?? 'ошибка протокола'}`, 'warn');
      return;
    }
    if (env.kind === 'intent_commit') {
      const body = env.body as { round: number; commit: string };
      setRoundState(prev => (prev && prev.round === body.round ? upsertCommit(prev, env.from, body.commit) : prev));
      push(`🔒 ${env.from} зафиксировал интент (коммит ${body.commit.slice(0, 10)}…)`, 'info');
      return;
    }
    if (env.kind === 'intent_reveal') {
      const body = env.body as { round: number; commit: string; intent: unknown; dice_seed: string };
      setRoundState(prev => {
        if (!prev || prev.round !== body.round) return prev;
        // upsertReveal проверяет: commit(intent, seed) === опубликованный коммит
        return upsertReveal(prev, env.from, body.commit, body.intent, body.dice_seed, commitIntent);
      });
      push(`🔓 ${env.from} раскрыл интент — коммит будет проверен`, 'info');
      return;
    }
    if (env.kind === 'round_result') {
      const body = env.body as { round: number; checksum: string; state: unknown };
      setRoundState(prev => (prev && prev.round === body.round ? upsertOutcome(prev, { from: env.from, checksum: body.checksum, state: body.state }) : prev));
      // чужой канон — предложение применить к своей кампании (диф покажем в карточке)
      if (env.from !== myName && body.state && typeof body.state === 'object') {
        const st = body.state as { round?: number; entities?: CanonEntity[]; logs?: string[] };
        if (Array.isArray(st.entities)) {
          setIncomingCanon({ from: env.from, canon: { round: st.round ?? body.round, entities: st.entities, logs: st.logs } });
        }
      }
      push(`📜 ${env.from} прислал канон раунда ${body.round} (${body.checksum.slice(0, 10)}…)`, 'info');
      return;
    }
    if (env.kind === 'dice_commit') {
      const body = env.body as { roll_id: string; label: string; commit: string };
      if (typeof body.roll_id !== 'string' || typeof body.label !== 'string' || typeof body.commit !== 'string') return;
      setDiceRolls(prev => upsertDiceCommit(prev, { rollId: body.roll_id, from: env.from, label: body.label, commit: body.commit }));
      if (env.from !== myName) push(`🎲 ${env.from} зафиксировал бросок «${body.label}» — сид под замком`, 'info');
      return;
    }
    if (env.kind === 'dice_reveal') {
      const body = env.body as DiceRevealBody;
      if (typeof body.roll_id !== 'string' || typeof body.label !== 'string' || typeof body.commit !== 'string') return;
      const entry: DiceRevealBody & { from: string } = { ...body, from: env.from };
      verifyDiceReveal(body).then(ok => {
        setDiceRolls(prev => applyDiceReveal(prev, entry, ok));
        if (env.from === myName) return;
        push(
          ok
            ? `🎲 ${env.from}: ${body.label} → ${body.total} ✓ проверен по сиду`
            : `⚠️ ${env.from}: раскрытие «${body.label}» не сошлось с коммитом — бросок подменён!`,
          ok ? 'ok' : 'warn'
        );
      });
    }
  }, [push, myName]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let alive = true;
    onLinkEvent((ev: LinkUiEvent) => {
      if (!alive) return;
      switch (ev.kind) {
        case 'roster':
          setPlayers(ev.players);
          break;
        case 'notice':
          push(ev.text, 'info');
          break;
        case 'closed':
          push(ev.reason, 'warn');
          setConnected(false);
          setRole('');
          break;
        case 'message':
          handleEnvelope(ev.envelope);
          break;
      }
    }).then(fn => {
      // если компонент размонтировался раньше ответа — отписываемся сразу,
      // иначе слушатель навсегда останется в глобальном наборе
      if (alive) unsub = fn; else fn();
    });
    return () => { alive = false; unsub?.(); };
  }, [handleEnvelope, push]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const playerColor = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p, i) => map.set(p.name, TOKEN_COLORS[i % TOKEN_COLORS.length]));
    return map;
  }, [players]);

  // ------------------------------------------------------------- подключения

  const doHost = async () => {
    setBusy(true);
    try {
      const masterCommit = await commitIntent({ table: tableName, round }, `${tableName}#${round}`);
      const info = await linkHost({
        port, table: tableName, playerName: myName,
        actors: entities.filter(e => e.role === 'player').map(e => e.id),
        masterSeedCommit: masterCommit,
        campaignEml: shareScroll && campaignScroll ? campaignScroll : null,
      });
      setRole('host');
      setConnected(true);
      setPort(info.port);
      setHostAddr(info.addr);
      const invite = info.addr ? `${info.addr}:${info.port}` : `127.0.0.1:${info.port}`;
      push(`Стол «${tableName}» открыт: ${invite}`, 'ok');
      if (!info.addr) push('Локальный IP не определён — игрокам подойдёт адрес из ipconfig/ifconfig', 'info');
    } catch (e) {
      push(String(e), 'warn');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    setBusy(true);
    try {
      const server = await linkJoin({ addr, playerName: myName, actors: [] });
      setRole('client');
      setConnected(true);
      push(`Подключено к ${server}`, 'ok');
    } catch (e) {
      push(String(e), 'warn');
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async () => {
    await linkLeave();
    setConnected(false);
    setRole('');
    setPlayers([]);
    setIncomingScroll(null);
    setIncomingCanon(null);
    setRoundState(null);
    setDiceRolls([]);
    mySecretRolls.current.clear();
    setHostAddr(null);
    push('Стол покинут', 'info');
  };

  // ------------------------------------------------------------- фазы раунда

  const beginRound = async () => {
    const names = players.length > 0 ? players.map(p => p.name) : [myName];
    const rs = newRoundState(round, names);
    setRoundState(rs);
    setPendingIntent(null);
    setIncomingCanon(null);
    const seed = `seed_${Math.random().toString(36).slice(2, 10)}`;
    setDiceSeed(seed);
    push(`Раунд ${round}: фаза коммита. Игроков: ${names.length}`, 'info');
  };

  const doCommit = async () => {
    if (!roundState) return;
    try {
      const intent = JSON.parse(intentDraft);
      const seed = diceSeed || 'default-seed';
      // Rust считает SHA-256 канона и рассылает intent_commit — хеш возвращается нам
      const commit = await linkIntentCommit(roundState.round, intent, seed);
      // свой коммит вносим сами: эхо хоста придёт с его именем, чужой клиент своего
      // конверта обратно не получает — без этого фаза никогда не дойдёт до Reveal
      setRoundState(prev => (prev && prev.round === roundState.round ? upsertCommit(prev, myName, commit) : prev));
      setPendingIntent({ commit, intent, seed });
      push(`Коммит опубликован: ${commit.slice(0, 12)}…`, 'ok');
    } catch (e) {
      push(`Интент не является JSON: ${e}`, 'warn');
    }
  };

  const doReveal = async () => {
    if (!roundState || !pendingIntent) return;
    await linkIntentReveal(roundState.round, pendingIntent.intent, pendingIntent.seed);
    // своё раскрытие проверяем локально, как чужое — по опубликованному коммиту
    setRoundState(prev =>
      prev && prev.round === roundState.round
        ? upsertReveal(prev, myName, pendingIntent.commit, pendingIntent.intent, pendingIntent.seed, commitIntent)
        : prev
    );
    push('Интент раскрыт — все столы могут проверить честность', 'ok');
  };

  const doShareCanon = async () => {
    if (!roundState) return;
    // канон = детерминированный срез сущностей + журнал боя: клиенты смогут
    // не только сверить чексумму, но и применить состояние к своей кампании
    const state = {
      round: roundState.round,
      entities: entities.map(e => ({ id: e.id, hp: e.hp, pos: e.pos, status: e.status })),
      logs: mechanicalLogs,
    };
    const checksum = await linkRoundResult(roundState.round, state);
    // свой канон учитываем в машине фаз, как и каноны других столов
    setRoundState(prev => (prev && prev.round === roundState.round ? upsertOutcome(prev, { from: myName, checksum, state }) : prev));
    push(`Канон разослан (сущности + журнал), чексумма ${checksum.slice(0, 12)}…`, 'ok');
  };

  const doChat = async () => {
    if (!chatDraft.trim()) return;
    await linkSend('chat', { text: chatDraft.trim() });
    push(`${myName}: ${chatDraft.trim()}`, 'chat');
    setChatDraft('');
  };

  // ------------------------------------------------------------- честные кости

  const doDiceRoll = async () => {
    if (!connected) return;
    const f = parseFormula(diceFormula);
    if (!f) {
      push(`«${diceFormula}» — не формула. Примеры: d20, 2d6+3, 4d6kh3, 2d20kl1`, 'warn');
      return;
    }
    const seed = generateRandomSeed('dice');
    const res = rollDice(f, seedToRng(seed));
    const commit = await diceCommit(f.label, seed);
    const rollId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    mySecretRolls.current.set(rollId, { label: f.label, commit, total: res.total, detail: res.detail, seed });
    await linkSend('dice_commit', { roll_id: rollId, label: f.label, commit });
    setDiceRolls(prev => upsertDiceCommit(prev, { rollId, from: myName, label: f.label, commit }));
    push(`🎲 Коммит «${f.label}» опубликован — сид под замком до раскрытия`, 'ok');
  };

  const doRevealMyRolls = async () => {
    const mine = diceRolls.filter(r => r.from === myName && r.phase === 'committed');
    if (mine.length === 0) {
      push('Нечего раскрывать — сначала зафиксируй бросок', 'info');
      return;
    }
    for (const r of mine) {
      const secret = mySecretRolls.current.get(r.rollId);
      if (!secret) continue;
      const body: DiceRevealBody = {
        roll_id: r.rollId, label: secret.label, commit: secret.commit,
        total: secret.total, detail: secret.detail, seed: secret.seed,
      };
      await linkSend('dice_reveal', body);
      const ok = await verifyDiceReveal(body);
      setDiceRolls(prev => applyDiceReveal(prev, { ...body, from: myName }, ok));
      mySecretRolls.current.delete(r.rollId);
    }
    push(`🎲 Раскрыто бросков: ${mine.length} — любой стол пересчитает и проверит`, 'ok');
  };

  const copyInvite = async () => {
    const invite = hostAddr ? `${hostAddr}:${port}` : `${port}`;
    try { await navigator.clipboard.writeText(invite); push(`Скопировано: ${invite}`, 'info'); } catch { /* clipboard недоступен */ }
  };

  const cheaters = roundState ? findCheats(roundState) : [];
  // расхождение канонов: два и более столов прислали разные чексуммы одного раунда
  const splitBrain = !!roundState && roundState.outcomes.length >= 2 && new Set(roundState.outcomes.map(o => o.checksum)).size > 1;
  const phaseBadge = (phase: string) => {
    const order = ['Commit', 'Reveal', 'Resolved'];
    const idx = order.indexOf(phase);
    return order.map((p, i) => (
      <span key={p} className={`text-xs px-2 py-0.5 rounded-full ${i <= idx ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'bg-[#27272a] text-[#71717a]'}`}>
        {p === 'Commit' ? 'Коммит' : p === 'Reveal' ? 'Раскрытие' : 'Сверка'}
      </span>
    ));
  };

  // ------------------------------------------------------------- оффлайн-заглушка

  if (!isDesktop && !connected) {
    const steps = [
      { icon: Lock, title: '1. Коммит', text: 'Каждый игрок публикует SHA-256 своего интента и сида дайсов — до того, как увидит чужие.' },
      { icon: Unlock, title: '2. Раскрытие', text: 'Все раскрывают интенты. Коммит проверяется: перекинуть дайс после фиксации невозможно.' },
      { icon: ScrollText, title: '3. Канон', text: 'Детерминированный WEGO-резолвер даёт одинаковый лог на всех столах — сверяется чексуммой.' },
    ];
    return (
      <div className="space-y-6">
        <SectionTitle />
        <div className="border border-[#27272a] rounded-xl bg-[#121212] p-8 text-center">
          <Radio className="w-10 h-10 mx-auto text-[#52525b] mb-3" />
          <p className="text-[#a1a1aa] max-w-xl mx-auto">
            Сетевой стол работает в нативной сборке (Tauri): прямой P2P по TCP,
            без серверов и облаков — по локальной сети или VPN. Запусти{' '}
            <code className="text-[#d4af37]">npm run tauri dev</code>, чтобы открыть стол для своей партии.
          </p>
          <div className="grid md:grid-cols-3 gap-4 mt-6 text-left">
            {steps.map(st => (
              <div key={st.title} className="border border-[#27272a] rounded-lg p-4 bg-[#0c0c0c]">
                <div className="flex items-center gap-2 text-[#d4af37] text-sm font-semibold mb-2">
                  <st.icon className="w-4 h-4" /> {st.title}
                </div>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">{st.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Левая колонка: подключение/ростер/фазы */}
        <div className="lg:col-span-2 space-y-6">
          {!connected ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-[#27272a] rounded-xl bg-[#121212] p-5 space-y-4">
                <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold">
                  <Crown className="w-4 h-4" /> Стать хостом
                </h3>
                <Field label="Название стола">
                  <input className={inputCls} value={tableName} onChange={e => setTableName(e.target.value)} />
                </Field>
                <Field label="Твоё имя">
                  <input className={inputCls} value={myName} onChange={e => setMyName(e.target.value)} />
                </Field>
                <Field label="Порт">
                  <div className="flex gap-2">
                    <input type="number" className={inputCls} value={port} onChange={e => setPort(Number(e.target.value) || 7788)} />
                    <button onClick={copyInvite} className={ghostBtn} title="Скопировать адрес для игроков"><Copy className="w-4 h-4" /></button>
                  </div>
                </Field>
                <label className="flex items-center gap-2 text-sm text-[#a1a1aa]">
                  <input type="checkbox" checked={shareScroll} onChange={e => setShareScroll(e.target.checked)} className="accent-[#d4af37]" />
                  Передать свиток кампании игрокам при входе
                </label>
                <button onClick={doHost} disabled={busy} className={goldBtn}>
                  <Radio className="w-4 h-4" /> {busy ? 'Открываю…' : 'Открыть стол'}
                </button>
              </div>

              <div className="border border-[#27272a] rounded-xl bg-[#121212] p-5 space-y-4">
                <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold">
                  <Link2 className="w-4 h-4" /> Присоединиться
                </h3>
                <Field label="Адрес стола (host:port)">
                  <input className={inputCls} value={addr} onChange={e => setAddr(e.target.value)} placeholder="192.168.1.10:7788" />
                </Field>
                <Field label="Твоё имя">
                  <input className={inputCls} value={myName} onChange={e => setMyName(e.target.value)} />
                </Field>
                <button onClick={doJoin} disabled={busy} className={goldBtn}>
                  <Link2 className="w-4 h-4" /> {busy ? 'Подключаюсь…' : 'Подключиться'}
                </button>
                <p className="text-xs text-[#71717a]">
                  Один компьютер в сети открывает стол — остальные подключаются по локальной сети или VPN
                  (Tailscale, WireGuard). Без регистрации, без облака.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Ростер */}
              <div className="border border-[#27272a] rounded-xl bg-[#121212] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold">
                    <Users className="w-4 h-4" /> За столом {players.length > 0 ? `— ${players.length}` : ''}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={copyInvite} className={ghostBtn} title="Скопировать адрес стола для игроков">
                      <Copy className="w-3.5 h-3.5" /> {hostAddr ? `${hostAddr}:${port}` : `порт ${port}`}
                    </button>
                    <button onClick={doLeave} className={ghostBtn}><LogOut className="w-4 h-4" /> Покинуть</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {players.map(p => (
                    <span key={p.name} className="inline-flex items-center gap-2 border border-[#27272a] rounded-full pl-1.5 pr-3 py-1 bg-[#0c0c0c]">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
                        style={{ backgroundColor: playerColor.get(p.name) ?? '#d4af37' }}>
                        {p.name.slice(0, 1)}
                      </span>
                      {p.name}
                      {p.is_host && <Crown className="w-3 h-3 text-[#d4af37]" />}
                    </span>
                  ))}
                </div>
              </div>

              {/* Фазы раунда */}
              <div className="border border-[#27272a] rounded-xl bg-[#121212] p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold">
                    <ShieldCheck className="w-4 h-4" /> Честный раунд (commit-reveal)
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {phaseBadge(roundState?.phase ?? '')}
                  </div>
                </div>

                {!roundState ? (
                  <button onClick={beginRound} className={goldBtn}><Lock className="w-4 h-4" /> Начать раунд {round}</button>
                ) : (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="Интент (JSON)">
                        <textarea className={`${inputCls} h-20 font-mono text-xs`} value={intentDraft} onChange={e => setIntentDraft(e.target.value)} />
                      </Field>
                      <div className="space-y-3">
                        <Field label="Сид дайсов (секрет до раскрытия)">
                          <div className="flex gap-2">
                            <input className={`${inputCls} font-mono text-xs`} value={diceSeed} onChange={e => setDiceSeed(e.target.value)} readOnly={!!pendingIntent} />
                          </div>
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          {!pendingIntent ? (
                            <button onClick={doCommit} className={goldBtn}><Lock className="w-4 h-4" /> Зафиксировать</button>
                          ) : (
                            <button onClick={doReveal} className={goldBtn}><Unlock className="w-4 h-4" /> Раскрыть</button>
                          )}
                          <button onClick={doShareCanon} className={ghostBtn}><ScrollText className="w-4 h-4" /> Разослать канон</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div className="border border-[#27272a] rounded-lg p-3 bg-[#0c0c0c]">
                        <p className="text-[#71717a] text-xs mb-2">Коммиты ({roundState.commits.length}/{roundState.expectedPlayers.length})</p>
                        {roundState.commits.map(c => (
                          <p key={c.from} className="font-mono text-xs text-[#d4d4d8] truncate">🔒 {c.from}: {c.commit.slice(0, 16)}…</p>
                        ))}
                        {roundState.commits.length === 0 && <p className="text-xs text-[#52525b]">Ждём первый коммит…</p>}
                      </div>
                      <div className="border border-[#27272a] rounded-lg p-3 bg-[#0c0c0c]">
                        <p className="text-[#71717a] text-xs mb-2">Раскрытия</p>
                        {roundState.reveals.map((r, i) => (
                          <p key={i} className="font-mono text-xs text-[#d4d4d8] truncate">
                            {r.valid ? <CheckCircle2 className="w-3 h-3 inline text-green-500" /> : <XCircle className="w-3 h-3 inline text-red-500" />} {r.from}: {r.commit.slice(0, 12)}…
                          </p>
                        ))}
                        {roundState.reveals.length === 0 && <p className="text-xs text-[#52525b]">Пока никто не раскрылся.</p>}
                      </div>
                    </div>

                    {cheaters.length > 0 && (
                      <p className="flex items-center gap-2 text-sm text-red-400">
                        <AlertTriangle className="w-4 h-4" /> Коммит не совпал с раскрытием: {cheaters.join(', ')} — дайс перекинут!
                      </p>
                    )}

                    {splitBrain && (
                      <p className="flex items-center gap-2 text-sm text-red-400">
                        <AlertTriangle className="w-4 h-4" /> Столы разошлись: каноны одного раунда не совпали
                        ({new Set(roundState.outcomes.map(o => o.checksum)).size} версий) — сверьте версии кампании и решите, чей канон верен.
                      </p>
                    )}

                    {roundState.agreedChecksum && (
                      <p className="flex items-center gap-2 text-sm text-green-400">
                        <CheckCircle2 className="w-4 h-4" /> Все столы сошлись на каноне: {roundState.agreedChecksum.slice(0, 16)}…
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Честные кости: коммит сида до броска, раскрытие с проверкой */}
              <div className="border border-[#27272a] rounded-xl bg-[#121212] p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold">
                    <Dices className="w-4 h-4" /> Честные кости (commit-reveal)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {DICE_PRESETS.map(p => (
                      <button
                        key={p}
                        onClick={() => setDiceFormula(p)}
                        className={`text-xs px-2 py-0.5 rounded-full transition ${diceFormula === p ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'bg-[#27272a] text-[#71717a] hover:text-[#a1a1aa]'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    className={`${inputCls} font-mono text-xs w-36`}
                    value={diceFormula}
                    onChange={e => setDiceFormula(e.target.value)}
                    placeholder="2d6+3"
                    title="Формула: NdM, NdM+K, NdMkhN (оставить старшие), NdMklN (младшие)"
                  />
                  <button onClick={doDiceRoll} className={goldBtn}><Lock className="w-4 h-4" /> Зафиксировать бросок</button>
                  {diceRolls.some(r => r.from === myName && r.phase === 'committed') && (
                    <button onClick={doRevealMyRolls} className={goldBtn}>
                      <Unlock className="w-4 h-4" /> Раскрыть ({diceRolls.filter(r => r.from === myName && r.phase === 'committed').length})
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {diceRolls.length === 0 && (
                    <p className="text-xs text-[#52525b]">
                      Бросков ещё не было. Коммит sha256(формула|сид) уезжает до броска,
                      сид раскрывается позже — перекинуть результат невозможно.
                    </p>
                  )}
                  {diceRolls.map(r => (
                    <p
                      key={r.rollId}
                      className={`font-mono text-xs truncate ${r.phase === 'revealed' && !r.valid ? 'text-red-400' : 'text-[#d4d4d8]'}`}
                      title={r.detail ?? `коммит ${r.commit}`}
                    >
                      {r.phase === 'committed' ? '🔒' : r.valid ? '🎲 ✅' : '🎲 ⚠️'} {r.from}: {r.label}
                      {r.phase === 'revealed' ? ` → ${r.total}${r.valid ? ' ✓ проверен' : ' ✗ ПОДМЕНА'}` : ' — ждёт раскрытия'}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Правая колонка: канон + свиток + журнал */}
        <div className="space-y-6">
          {incomingCanon && (
            <div className="border border-[#d4af37]/40 rounded-xl bg-[#121212] p-5 space-y-3">
              <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold">
                <ScrollText className="w-4 h-4" /> Канон раунда {incomingCanon.canon.round} от {incomingCanon.from}
              </h3>
              <CanonCardBody canon={incomingCanon.canon} entities={entities} />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    onApplyCanon(incomingCanon.canon);
                    push(`Канон раунда ${incomingCanon.canon.round} применён к кампании`, 'ok');
                    setIncomingCanon(null);
                  }}
                  className={goldBtn}
                >
                  <CheckCircle2 className="w-4 h-4" /> Применить канон
                </button>
                <button
                  onClick={() => { setIncomingCanon(null); push('Канон отклонён — стол остаётся на своей версии', 'info'); }}
                  className={ghostBtn}
                >
                  Отклонить
                </button>
              </div>
            </div>
          )}

          {incomingScroll && (
            <div className="border border-[#d4af37]/40 rounded-xl bg-[#121212] p-5 space-y-3">
              <h3 className="flex items-center gap-2 text-[#d4af37] font-semibold"><ScrollText className="w-4 h-4" /> Свиток кампании</h3>
              <p className="text-sm text-[#a1a1aa]">Хост передал архив кампании ({incomingScroll.length} байт). Применить к своей копии?</p>
              <button onClick={() => { onApplyScroll(incomingScroll); push('Свиток применён к кампании', 'ok'); }} className={goldBtn}>
                <CheckCircle2 className="w-4 h-4" /> Применить свиток
              </button>
            </div>
          )}

          <div className="border border-[#27272a] rounded-xl bg-[#121212] flex flex-col h-80">
            <div className="px-4 py-2.5 border-b border-[#27272a] text-xs text-[#71717a] flex items-center gap-2">
              <Send className="w-3.5 h-3.5" /> Журнал стола
            </div>
            <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1 text-sm">
              {log.length === 0 && <p className="text-[#52525b] text-xs">Здесь появятся события стола и реплики игроков.</p>}
              {log.map((l, i) => (
                <p key={i} className={
                  l.tone === 'chat' ? 'text-[#d4d4d8]' :
                  l.tone === 'ok' ? 'text-green-400' :
                  l.tone === 'warn' ? 'text-amber-400' : 'text-[#a1a1aa]'
                }>
                  <span className="text-[#52525b] mr-2 font-mono text-xs">{l.at}</span>{l.text}
                </p>
              ))}
            </div>
            {connected && (
              <div className="p-3 border-t border-[#27272a] flex gap-2">
                <input
                  className={inputCls}
                  value={chatDraft}
                  placeholder="Реплика за столом…"
                  onChange={e => setChatDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doChat(); }}
                />
                <button onClick={doChat} className={goldBtn}><Send className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Превью канона: что изменится у этого стола, если применить. */
const CanonCardBody: React.FC<{ canon: CanonState; entities: Entity[] }> = ({ canon, entities }) => {
  const d = diffCanon(entities, canon.entities);
  return (
    <p className="text-sm text-[#a1a1aa]">
      Совпадает сущностей: <span className="text-[#f4f4f5]">{d.matched}</span> · изменения: hp — {d.hp.length},
      позиции — {d.pos.length}, статусы — {d.status.length}
      {d.unknown.length > 0 ? <> · <span className="text-amber-400">незнакомых id: {d.unknown.length} (будут пропущены)</span></> : null}
      {canon.logs ? ` · журнал боя: ${canon.logs.length} строк` : ''}.
    </p>
  );
};

const SectionTitle: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-[#f4f4f5] flex items-center gap-3">
      <Link2 className="w-6 h-6 text-[#d4af37]" /> Chronicle Link — сетевой стол
    </h2>    <p className="text-[#a1a1aa] mt-1">
      P2P по TCP: один игрок открывает стол, остальные подключаются. Кампания переезжает одним свитком,
      раунды резолвятся commit-reveal — перекинуть дайс невозможно, а канон боя сверяется чексуммой на всех столах.
    </p>
  </div>
);

const inputCls = 'bg-[#0c0c0c] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#d4d4d8] w-full focus:outline-none focus:border-[#d4af37]/60';
const goldBtn = 'inline-flex items-center gap-2 bg-gradient-to-br from-[#d4af37] to-[#996515] text-[#0c0c0c] font-semibold text-sm px-4 py-2 rounded-lg hover:brightness-110 disabled:opacity-50 transition';
const ghostBtn = 'inline-flex items-center gap-2 border border-[#27272a] text-[#a1a1aa] text-sm px-3 py-2 rounded-lg hover:border-[#d4af37]/40 hover:text-[#d4af37] transition';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs text-[#71717a]">{label}</span>
    {children}
  </label>
);

export default NetworkLobby;
