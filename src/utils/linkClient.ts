/**
 * Chronicle Link — Tauri bridge поверх src-tauri/src/link.rs.
 *
 * Веб-фолбэк: без Tauri сетевые функции недоступны (возвращают ошибку),
 * UI деградирует в оффлайн-режим, а не падает.
 */

import { isDesktop } from './desktopIO';

export interface LinkPlayerInfo {
  name: string;
  actors: string[];
  is_host: boolean;
}

export interface LinkStatus {
  active: boolean;
  role: string;
  table: string;
}

export type LinkUiEvent =
  | { kind: 'roster'; players: LinkPlayerInfo[] }
  | { kind: 'message'; envelope: { kind: string; from: string; seq: number; body: unknown } }
  | { kind: 'closed'; reason: string }
  | { kind: 'notice'; text: string };

type EventListener = (ev: LinkUiEvent) => void;

const listeners = new Set<EventListener>();

async function tauri(): Promise<typeof import('@tauri-apps/api/core')> {
  if (!isDesktop()) throw new Error('Сетевой стол доступен только в нативной сборке (Tauri)');
  return import('@tauri-apps/api/core');
}

let subscribed = false;

/** Подписка на события сетевого слоя; возвращает функцию отписки. */
export async function onLinkEvent(listener: EventListener): Promise<() => void> {
  listeners.add(listener);
  if (!subscribed && isDesktop()) {
    subscribed = true;
    const { listen } = await import('@tauri-apps/api/event');
    await listen<LinkUiEvent>('link-event', ev => {
      for (const l of listeners) l(ev.payload);
    });
  }
  return () => listeners.delete(listener);
}

export async function linkHost(opts: {
  port: number;
  table: string;
  playerName: string;
  actors: string[];
  masterSeedCommit: string;
  campaignEml: string | null;
}): Promise<number> {
  const { invoke } = await tauri();
  return invoke<number>('link_host', {
    port: opts.port,
    table: opts.table,
    playerName: opts.playerName,
    actors: opts.actors,
    masterSeedCommit: opts.masterSeedCommit,
    campaignEml: opts.campaignEml,
  });
}

export async function linkJoin(opts: {
  addr: string;
  playerName: string;
  actors: string[];
}): Promise<string> {
  const { invoke } = await tauri();
  return invoke<string>('link_join', {
    addr: opts.addr,
    playerName: opts.playerName,
    actors: opts.actors,
  });
}

/** Отправка конверта: host рассылает всем, client шлёт хосту. */
export async function linkSend(kind: string, body: unknown): Promise<void> {
  const { invoke } = await tauri();
  await invoke('link_send', { kind, bodyJson: JSON.stringify(body) });
}

export async function linkLeave(): Promise<void> {
  if (!isDesktop()) return;
  const { invoke } = await tauri();
  await invoke('link_leave');
}

export async function linkStatus(): Promise<LinkStatus> {
  if (!isDesktop()) return { active: false, role: '', table: '' };
  const { invoke } = await tauri();
  return invoke<LinkStatus>('link_status');
}
