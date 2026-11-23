import type { Board } from './types';
import type { Message } from '../parser/types';

const PREFIX = 'threadboard:v1:';
export const BOARDS_KEY = `${PREFIX}boards`;
const CONSENT_KEY = `${PREFIX}consent`;
const messagesKey = (boardId: string) => `${PREFIX}messages:${boardId}`;

/** Minimal key/value interface so tests can use an in-memory store. */
export type KV = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
};

function browserKV(): KV {
  const ls = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    getItem: (k) => {
      try {
        return ls()?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    setItem: (k, v) => {
      try {
        ls()?.setItem(k, v);
      } catch {
        // Storage full or blocked: the app keeps working in memory.
      }
    },
    removeItem: (k) => {
      try {
        ls()?.removeItem(k);
      } catch {
        /* ignore */
      }
    },
    keys: () => {
      const s = ls();
      if (!s) return [];
      const out: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k) out.push(k);
      }
      return out;
    },
  };
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

export const kv: KV = browserKV();

function readJson<T>(store: KV, key: string, fallback: T): T {
  const raw = store.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---- Consent (per chat) ----------------------------------------------------

export type ConsentStore = {
  has(chatId: string): boolean;
  grant(chatId: string): void;
  revoke(chatId: string): void;
};

export function consentStore(store: KV = kv): ConsentStore {
  const read = () => readJson<Record<string, string>>(store, CONSENT_KEY, {});
  return {
    has: (chatId) => typeof read()[chatId] === 'string',
    grant: (chatId) => store.setItem(CONSENT_KEY, JSON.stringify({ ...read(), [chatId]: new Date().toISOString() })),
    revoke: (chatId) => {
      const next = read();
      delete next[chatId];
      store.setItem(CONSENT_KEY, JSON.stringify(next));
    },
  };
}

// ---- Preferences -----------------------------------------------------------

export type Prefs = { anonymize: boolean; keepChat: boolean };
const PREFS_KEY = `${PREFIX}prefs`;

export function loadPrefs(store: KV = kv): Prefs {
  const p = readJson<Partial<Prefs>>(store, PREFS_KEY, {});
  return { anonymize: p.anonymize ?? true, keepChat: p.keepChat ?? true };
}

export function savePrefs(prefs: Prefs, store: KV = kv): void {
  store.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ---- Boards and messages ---------------------------------------------------

export function loadBoards(store: KV = kv): Board[] {
  const boards = readJson<unknown>(store, BOARDS_KEY, []);
  return Array.isArray(boards) ? (boards.filter((b) => b && (b as Board).schemaVersion === 1) as Board[]) : [];
}

export function saveBoards(boards: Board[], store: KV = kv): void {
  store.setItem(BOARDS_KEY, JSON.stringify(boards));
}

export function loadMessages(boardId: string, store: KV = kv): Message[] | null {
  const msgs = readJson<unknown>(store, messagesKey(boardId), null);
  return Array.isArray(msgs) ? (msgs as Message[]) : null;
}

export function saveMessages(boardId: string, messages: Message[], store: KV = kv): void {
  store.setItem(messagesKey(boardId), JSON.stringify(messages));
}

export function removeMessages(boardId: string, store: KV = kv): void {
  store.removeItem(messagesKey(boardId));
}

/** "Delete all my data": removes every ThreadBoard key, including consent. */
export function deleteAllData(store: KV = kv): void {
  for (const k of store.keys()) if (k.startsWith(PREFIX)) store.removeItem(k);
}
