import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type {
  ListenTogetherMessage,
  ListenTogetherSession,
  ListenTogetherTrack,
} from "./listen-together-types";

const SESSIONS_KEY = "ai_phone_listen_together_v1";
export const LISTEN_TOGETHER_UPDATED_EVENT = "listen-together-updated";

registerKvMigration(SESSIONS_KEY);

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function dispatchUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_UPDATED_EVENT));
}

function readJson<T>(key: string, fallback: T): T {
  const raw = kvGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  kvSet(key, JSON.stringify(value));
  dispatchUpdated();
}

function normalizeTrack(value: unknown): ListenTogetherTrack | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ListenTogetherTrack>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  return {
    id: item.id,
    title: item.title,
    artist: typeof item.artist === "string" ? item.artist : "",
    coverUrl: typeof item.coverUrl === "string" && item.coverUrl.trim() ? item.coverUrl : undefined,
  };
}

function normalizeMessage(value: unknown): ListenTogetherMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ListenTogetherMessage>;
  if (typeof item.id !== "string" || typeof item.text !== "string") return null;
  return {
    id: item.id,
    author: item.author === "character" ? "character" : "user",
    text: item.text,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
}

function normalizeSession(value: unknown): ListenTogetherSession | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ListenTogetherSession>;
  if (typeof item.id !== "string" || typeof item.characterId !== "string") return null;
  return {
    id: item.id,
    characterId: item.characterId,
    characterName: typeof item.characterName === "string" ? item.characterName : "对方",
    startedAt: typeof item.startedAt === "string" ? item.startedAt : new Date().toISOString(),
    endedAt: typeof item.endedAt === "string" ? item.endedAt : undefined,
    tracks: Array.isArray(item.tracks) ? item.tracks.map(normalizeTrack).filter(Boolean) as ListenTogetherTrack[] : [],
    messages: Array.isArray(item.messages) ? item.messages.map(normalizeMessage).filter(Boolean) as ListenTogetherMessage[] : [],
    status: item.status === "active" ? "active" : "ended",
  };
}

export function loadListenTogetherSessions(): ListenTogetherSession[] {
  const items = readJson<unknown[]>(SESSIONS_KEY, []);
  return Array.isArray(items) ? items.map(normalizeSession).filter(Boolean) as ListenTogetherSession[] : [];
}

function saveSessions(items: ListenTogetherSession[]): void {
  writeJson(SESSIONS_KEY, items);
}

export function getActiveListenTogetherSession(): ListenTogetherSession | null {
  return loadListenTogetherSessions().find(item => item.status === "active") || null;
}

export function getListenTogetherSession(id: string): ListenTogetherSession | null {
  return loadListenTogetherSessions().find(item => item.id === id) || null;
}

export function startListenTogetherSession(input: {
  characterId: string;
  characterName: string;
  track?: ListenTogetherTrack;
}): ListenTogetherSession {
  const now = new Date().toISOString();
  const current = loadListenTogetherSessions().map(item => (
    item.status === "active" ? { ...item, status: "ended" as const, endedAt: item.endedAt || now } : item
  ));
  const session: ListenTogetherSession = {
    id: generateId("listen"),
    characterId: input.characterId,
    characterName: input.characterName,
    startedAt: now,
    tracks: input.track ? [input.track] : [],
    messages: [],
    status: "active",
  };
  saveSessions([session, ...current]);
  return session;
}

export function updateListenTogetherSession(
  sessionId: string,
  patch: Partial<Pick<ListenTogetherSession, "tracks" | "messages" | "status" | "endedAt">>,
): ListenTogetherSession | null {
  const items = loadListenTogetherSessions();
  let updated: ListenTogetherSession | null = null;
  const next = items.map(item => {
    if (item.id !== sessionId) return item;
    updated = { ...item, ...patch };
    return updated;
  });
  if (updated) saveSessions(next);
  return updated;
}

export function appendListenTogetherTrack(sessionId: string, track: ListenTogetherTrack): ListenTogetherSession | null {
  const session = getListenTogetherSession(sessionId);
  if (!session || session.status !== "active") return session;
  if (session.tracks.some(item => item.id === track.id)) return session;
  return updateListenTogetherSession(sessionId, { tracks: [...session.tracks, track] });
}

export function appendListenTogetherMessage(
  sessionId: string,
  input: { author: ListenTogetherMessage["author"]; text: string },
): ListenTogetherMessage | null {
  const session = getListenTogetherSession(sessionId);
  if (!session || session.status !== "active") return null;
  const message: ListenTogetherMessage = {
    id: generateId("lmsg"),
    author: input.author,
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!message.text) return null;
  updateListenTogetherSession(sessionId, { messages: [...session.messages, message] });
  return message;
}

export function endListenTogetherSession(sessionId: string): ListenTogetherSession | null {
  const session = getListenTogetherSession(sessionId);
  if (!session) return null;
  if (session.status === "ended") return session;
  return updateListenTogetherSession(sessionId, {
    status: "ended",
    endedAt: new Date().toISOString(),
  });
}

export function formatListenDuration(session: ListenTogetherSession): string {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt || Date.now()).getTime();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}
