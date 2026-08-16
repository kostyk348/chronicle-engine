// Desktop I/O bridge for Chronicle Engine (Tauri shell).
// Real filesystem save/load + native dialogs. Falls back to browser
// downloads when running as a plain web app.
import { invoke } from '@tauri-apps/api/core';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

/** Convert a Blob to base64 (no leading data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Native "Save As…" dialog + write. Returns true on success, false if cancelled.
 * For binary payloads (EPUB/PDF) pass a Blob; for text pass a string.
 */
export async function saveViaDialog(
  content: Blob | string,
  defaultName: string
): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const path = await invoke<string | null>('pick_save_path', { defaultName });
    if (!path) return false; // cancelled
    if (typeof content === 'string') {
      await invoke('write_text_file', { path, content });
    } else {
      const b64 = await blobToBase64(content);
      await invoke('write_binary_file', { path, base64Content: b64 });
    }
    return true;
  } catch (e) {
    console.warn('desktopIO: save failed', e);
    return false;
  }
}

/** Native "Open…" dialog + read text. Returns content or null. */
export async function openTextViaDialog(filterExt?: string): Promise<{
  path: string;
  content: string;
} | null> {
  if (!isDesktop()) return null;
  try {
    const path = await invoke<string | null>('pick_open_path', { filterExt });
    if (!path) return null;
    const content = await invoke<string>('read_text_file', { path });
    return { path, content };
  } catch (e) {
    console.warn('desktopIO: open failed', e);
    return null;
  }
}

const CAMPAIGN_FILE = 'campaign.json';
let cachedPath: string | null = null;

/** Resolve campaign autosave path (app data dir). */
export async function resolveCampaignPath(): Promise<string | null> {
  if (!isDesktop()) return null;
  if (cachedPath) return cachedPath;
  try {
    const dir = await invoke<string>('app_data_dir');
    cachedPath = `${dir}/${CAMPAIGN_FILE}`;
    return cachedPath;
  } catch (e) {
    return null;
  }
}

/** Load autosaved campaign state from disk. */
export async function loadCampaignFromDisk<T>(): Promise<T | null> {
  const path = await resolveCampaignPath();
  if (!path) return null;
  try {
    const content = await invoke<string>('read_text_file', { path });
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Autosave campaign state to disk. */
export async function saveCampaignToDisk(state: unknown): Promise<boolean> {
  const path = await resolveCampaignPath();
  if (!path) return false;
  try {
    await invoke('write_text_file', {
      path,
      content: JSON.stringify(state, null, 2),
    });
    return true;
  } catch (e) {
    console.warn('desktopIO: campaign autosave failed', e);
    return false;
  }
}

/** Browser download fallback (used when not in Tauri). */
export function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
