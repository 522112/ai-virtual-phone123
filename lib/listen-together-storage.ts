import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type {
  ListenTogetherInvite,
  ListenTogetherMessage,
  ListenTogetherPlaylist,
  ListenTogetherSession,
  ListenTogetherTrack,
  TogetherPlayMode,
} from "./listen-together-types";

const SESSIONS_KEY = "ai_phone_listen_together_v1";
const INVITES_KEY = "ai_phone_listen_together_invites_v1";
export const LISTEN_TOGETHER_UPDATED_EVENT = "listen-together-updated";
export const LISTEN_INVITE_UPDATED_EVENT = "listen-invite-updated";

registerKvMigration(SESSIONS_KEY);
registerKvMigration(INVITES_KEY);

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
    lyrics: typeof item.lyrics === "string" && item.lyrics.trim() ? item.lyrics : undefined,
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
    kind: item.kind === "emoji" ? "emoji" : "text",
  };
}

function normalizePlaylist(value: unknown): ListenTogetherPlaylist | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<ListenTogetherPlaylist>;
  if (typeof item.name !== "string" && typeof item.description !== "string" && typeof item.coverUrl !== "string") return undefined;
  return {
    name: typeof item.name === "string" && item.name.trim() ? item.name.slice(0, 60) : "一起听歌单",
    description: typeof item.description === "string" ? item.description.slice(0, 300) : "",
    coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
    updatedBy: item.updatedBy === "character" ? "character" : "user",
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
    // (endedAt 由下方回填逻辑统一处理)
    tracks: Array.isArray(item.tracks) ? item.tracks.map(normalizeTrack).filter(Boolean) as ListenTogetherTrack[] : [],
    messages: Array.isArray(item.messages) ? item.messages.map(normalizeMessage).filter(Boolean) as ListenTogetherMessage[] : [],
    status: item.status === "active" ? "active" : "ended",
    playlist: normalizePlaylist((item as { playlist?: unknown }).playlist),
    heardTrackIds: Array.isArray(item.heardTrackIds) ? item.heardTrackIds.filter((x): x is string => typeof x === "string") : [],
    // 老数据：已结束但缺 endedAt 的，用最后一条消息时间回填，避免时长随“现在”越长越大
    endedAt: (() => {
      if (typeof item.endedAt === "string" && item.endedAt) return item.endedAt;
      if (item.status === "active") return undefined;
      try {
        const msgs = Array.isArray(item.messages) ? item.messages : [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        const t = last && typeof (last as { createdAt?: unknown }).createdAt === "string"
          ? (last as { createdAt: string }).createdAt
          : null;
        if (t && !Number.isNaN(Date.parse(t))) return t;
      } catch { /* 忽略 */ }
      return typeof item.startedAt === "string" ? item.startedAt : new Date().toISOString();
    })(),
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
  // 幂等：同角色已有进行中会话就直接复用，不再新建（避免 accept/open 连点产生重复记录）
  const existing = loadListenTogetherSessions().find(
    item => item.status === "active" && item.characterId === input.characterId,
  );
  if (existing) {
    if (input.track && !existing.tracks.some(t => t.id === input.track!.id)) {
      updateListenTogetherSession(existing.id, { tracks: [...existing.tracks, input.track] });
      return getListenTogetherSession(existing.id) || existing;
    }
    return existing;
  }
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
  patch: Partial<Pick<ListenTogetherSession, "tracks" | "messages" | "status" | "endedAt" | "playlist" | "heardTrackIds">>,
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
  input: { author: ListenTogetherMessage["author"]; text: string; kind?: "text" | "emoji" },
): ListenTogetherMessage | null {
  const session = getListenTogetherSession(sessionId);
  if (!session || session.status !== "active") return null;
  const message: ListenTogetherMessage = {
    id: generateId("lmsg"),
    author: input.author,
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
    kind: input.kind === "emoji" ? "emoji" : "text",
  };
  if (!message.text) return null;
  updateListenTogetherSession(sessionId, { messages: [...session.messages, message] });
  return message;
}

export function endListenTogetherSession(sessionId: string): ListenTogetherSession | null {  const session = getListenTogetherSession(sessionId);
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

const LISTEN_BG_KEY = "ai_phone_listen_bg_v1";

// 删除单条消息（长按删除用）。记忆相关自动清空：
// 一起听回复 prompt 的最近对话取自 session.messages，删掉即不再进入大模型上下文。
export function deleteListenTogetherMessage(sessionId: string, messageId: string): ListenTogetherSession | null {
  const session = getListenTogetherSession(sessionId);
  if (!session) return null;
  const next = session.messages.filter(item => item.id !== messageId);
  if (next.length === session.messages.length) return session;
  return updateListenTogetherSession(sessionId, { messages: next });
}

/** 记录本次实际听过一首歌（去重计数） */
export function markListenTogetherHeard(sessionId: string, trackId: string): void {
  const session = getListenTogetherSession(sessionId);
  if (!session || session.status !== "active" || !trackId) return;
  const heard = session.heardTrackIds || [];
  if (heard.includes(trackId)) return;
  updateListenTogetherSession(sessionId, { heardTrackIds: [...heard, trackId] });
}

/** 清空整个一起听歌单（保留会话与聊天记录） */
export function clearListenTogetherPlaylist(sessionId: string): ListenTogetherSession | null {
  return updateListenTogetherSession(sessionId, { tracks: [] });
}

// ── 一起听头像框方案库（全局，可存多套，任意角色可复用） ──

export type AvatarFramePreset = {
  id: string;
  name: string;
  frameUrl: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  createdAt: string;
};

export type AvatarFrameTarget = "me" | "character";

const AVATAR_FRAME_PRESETS_KEY = "ai_phone_listen_avatar_frame_presets_v1";
const AVATAR_FRAME_APPLIED_KEY = "ai_phone_listen_avatar_frame_applied_v1";

function normalizePreset(value: unknown): AvatarFramePreset | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<AvatarFramePreset>;
  if (typeof item.id !== "string" || typeof item.frameUrl !== "string" || !item.frameUrl) return null;
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const clamp = (v: number) => Math.max(-80, Math.min(80, Math.round(v)));
  return {
    id: item.id,
    name: typeof item.name === "string" && item.name.trim() ? item.name : "方案",
    frameUrl: item.frameUrl,
    scale: num(item.scale, 1),
    // 偏移统一为“相对头像自身尺寸的百分比”，多大头像显示都一致
    offsetX: clamp(num(item.offsetX, 0)),
    offsetY: clamp(num(item.offsetY, 0)),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
}

// 一次性迁移：老方案存的是 px（基于 96px 预览），换算成百分比
function migrateAvatarFrameOffsetsOnce(): void {
  try {
    const flag = readJson<string | null>("ai_phone_listen_avatar_frame_migrated_v1", null);
    if (flag === "done") return;
    const items = readJson<unknown[]>(AVATAR_FRAME_PRESETS_KEY, []);
    let touched = false;
    const next = items.map(raw => {
      const p = normalizePreset(raw);
      if (!p) return raw;
      const px2pct = (px: number) => Math.max(-80, Math.min(80, Math.round((px / 96) * 100)));
      const converted: AvatarFramePreset = { ...p, offsetX: px2pct(p.offsetX), offsetY: px2pct(p.offsetY) };
      if (converted.offsetX !== p.offsetX || converted.offsetY !== p.offsetY) touched = true;
      return converted;
    });
    if (touched) writeJson(AVATAR_FRAME_PRESETS_KEY, next);
    writeJson("ai_phone_listen_avatar_frame_migrated_v1", "done");
  } catch { /* 忽略 */ }
}

export function listAvatarFramePresets(): AvatarFramePreset[] {
  migrateAvatarFrameOffsetsOnce();
  const items = readJson<unknown[]>(AVATAR_FRAME_PRESETS_KEY, []);
  return items.map(normalizePreset).filter((x): x is AvatarFramePreset => Boolean(x));
}

export function saveAvatarFramePreset(input: {
  id?: string;
  name?: string;
  frameUrl: string;
  scale: number;
  offsetX: number;
  offsetY: number;
}): AvatarFramePreset {
  const presets = listAvatarFramePresets();
  const id = input.id || generateId("aframe");
  const preset: AvatarFramePreset = {
    id,
    name: input.name?.trim() || `方案 ${presets.length + 1}`,
    frameUrl: input.frameUrl,
    scale: input.scale,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    createdAt: new Date().toISOString(),
  };
  const next = presets.some(p => p.id === id)
    ? presets.map(p => (p.id === id ? preset : p))
    : [...presets, preset];
  writeJson(AVATAR_FRAME_PRESETS_KEY, next);
  emitAvatarFrameUpdated();
  return preset;
}

export function deleteAvatarFramePreset(id: string): void {
  const next = listAvatarFramePresets().filter(p => p.id !== id);
  writeJson(AVATAR_FRAME_PRESETS_KEY, next);
  const applied = loadAppliedAvatarFrames();
  let changed = false;
  for (const target of ["me", "character"] as AvatarFrameTarget[]) {
    if (applied[target] === id) { delete applied[target]; changed = true; }
  }
  if (changed) writeJson(AVATAR_FRAME_APPLIED_KEY, applied);
  emitAvatarFrameUpdated();
}

function loadAppliedAvatarFrames(): Partial<Record<AvatarFrameTarget, string>> {
  return readJson<Partial<Record<AvatarFrameTarget, string>>>(AVATAR_FRAME_APPLIED_KEY, {});
}

export function getAppliedAvatarFrameTargetId(target: AvatarFrameTarget): string | null {
  return loadAppliedAvatarFrames()[target] || null;
}

export function getAppliedAvatarFrame(target: AvatarFrameTarget): AvatarFramePreset | null {
  const id = getAppliedAvatarFrameTargetId(target);
  if (!id) return null;
  return listAvatarFramePresets().find(p => p.id === id) || null;
}

export function applyAvatarFramePreset(target: AvatarFrameTarget, presetId: string | null): void {
  const applied = loadAppliedAvatarFrames();
  if (presetId) applied[target] = presetId;
  else delete applied[target];
  writeJson(AVATAR_FRAME_APPLIED_KEY, applied);
  emitAvatarFrameUpdated();
}

function emitAvatarFrameUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("avatar-frame-updated"));
  }
}

// ── 一起听歌单播放模式（全局持久） ──

const TOGETHER_PLAY_MODE_KEY = "ai_phone_listen_together_play_mode_v1";

export function getTogetherPlayMode(): TogetherPlayMode {
  const v = readJson<string>(TOGETHER_PLAY_MODE_KEY, "repeat-one");
  return v === "sequence" || v === "shuffle" ? v : "repeat-one";
}

export function setTogetherPlayMode(mode: TogetherPlayMode): void {
  writeJson(TOGETHER_PLAY_MODE_KEY, mode);
}

export function cycleTogetherPlayMode(): TogetherPlayMode {
  const order: TogetherPlayMode[] = ["repeat-one", "sequence", "shuffle"];
  const next = order[(order.indexOf(getTogetherPlayMode()) + 1) % order.length];
  setTogetherPlayMode(next);
  return next;
}

// 一起听背景：按角色 id 长久保存（dataURL 进 kv，随备份走）
export function getListenTogetherBg(characterId: string): string {  const map = readJson<Record<string, string>>(LISTEN_BG_KEY, {});
  return typeof map[characterId] === "string" ? map[characterId] : "";
}

export function setListenTogetherBg(characterId: string, dataUrl: string): void {
  const map = readJson<Record<string, string>>(LISTEN_BG_KEY, {});
  if (!dataUrl) delete map[characterId];
  else map[characterId] = dataUrl;
  writeJson(LISTEN_BG_KEY, map);
}

// ── 一起听歌单：持久化保存，双方添加/改名/改详情/换封面/删歌都长久保存 ──

export function getListenTogetherPlaylist(sessionId: string): ListenTogetherPlaylist {
  const session = getListenTogetherSession(sessionId);
  return session?.playlist || {
    name: `和${session?.characterName || "TA"}的一起听`,
    description: "",
    coverUrl: session?.tracks.find(t => t.coverUrl)?.coverUrl || "",
    updatedAt: new Date().toISOString(),
    updatedBy: "user",
  };
}

export function updateListenTogetherPlaylist(
  sessionId: string,
  patch: Partial<Pick<ListenTogetherPlaylist, "name" | "description" | "coverUrl">>,
  updatedBy: "user" | "character" = "user",
): ListenTogetherSession | null {
  const session = getListenTogetherSession(sessionId);
  if (!session) return null;
  const current = getListenTogetherPlaylist(sessionId);
  const next: ListenTogetherPlaylist = {
    name: patch.name !== undefined ? patch.name.slice(0, 60) || current.name : current.name,
    description: patch.description !== undefined ? patch.description.slice(0, 300) : current.description,
    coverUrl: patch.coverUrl !== undefined ? patch.coverUrl : current.coverUrl,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  return updateListenTogetherSession(sessionId, { playlist: next });
}

/** 歌单加歌：持久化进 session.tracks，去重 */
export function addListenTogetherPlaylistTrack(
  sessionId: string,
  track: ListenTogetherTrack,
): { session: ListenTogetherSession | null; added: boolean } {
  const session = getListenTogetherSession(sessionId);
  if (!session) return { session: null, added: false };
  if (session.tracks.some(t => t.id === track.id)) return { session, added: false };
  const updated = updateListenTogetherSession(sessionId, { tracks: [...session.tracks, track] });
  return { session: updated, added: true };
}

/** 歌单批量加歌：一次写入多首，去重，返回实际加入的 */
export function addManyListenTogetherPlaylistTracks(
  sessionId: string,
  tracks: ListenTogetherTrack[],
): { session: ListenTogetherSession | null; added: ListenTogetherTrack[]; skipped: number } {
  const session = getListenTogetherSession(sessionId);
  if (!session) return { session: null, added: [], skipped: tracks.length };
  const seen = new Set(session.tracks.map(t => t.id));
  const fresh = tracks.filter(t => t.id && t.title && !seen.has(t.id) && (seen.add(t.id), true));
  if (fresh.length === 0) return { session, added: [], skipped: tracks.length };
  const updated = updateListenTogetherSession(sessionId, { tracks: [...session.tracks, ...fresh] });
  return { session: updated, added: fresh, skipped: tracks.length - fresh.length };
}

/** 歌单删歌：按 trackId 移除 */
export function removeListenTogetherPlaylistTrack(sessionId: string, trackId: string): ListenTogetherSession | null {
  const session = getListenTogetherSession(sessionId);
  if (!session) return null;
  return updateListenTogetherSession(sessionId, { tracks: session.tracks.filter(t => t.id !== trackId) });
}

// ── 一起听邀约（情侣空间式卡片：接受才进入，不接受不进入） ──

function normalizeInvite(value: unknown): ListenTogetherInvite | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ListenTogetherInvite>;
  if (typeof item.id !== "string" || typeof item.characterId !== "string") return null;
  const direction = item.direction === "outgoing" ? "outgoing" : "incoming";
  const rawStatus = item.status;
  const status = rawStatus === "accepted" || rawStatus === "declined" || rawStatus === "expired"
    ? rawStatus
    : "pending";
  return {
    id: item.id,
    characterId: item.characterId,
    characterName: typeof item.characterName === "string" ? item.characterName : "对方",
    track: item.track && typeof item.track === "object" ? normalizeTrack(item.track) || undefined : undefined,
    inviteText: typeof item.inviteText === "string" ? item.inviteText.slice(0, 120) : undefined,
    direction,
    status,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    decidedAt: typeof item.decidedAt === "string" ? item.decidedAt : undefined,
  };
}

function dispatchInviteUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LISTEN_INVITE_UPDATED_EVENT));
}

function loadInvites(): ListenTogetherInvite[] {
  const items = readJson<unknown[]>(INVITES_KEY, []);
  return Array.isArray(items) ? items.map(normalizeInvite).filter(Boolean) as ListenTogetherInvite[] : [];
}

function saveInvites(items: ListenTogetherInvite[]): void {
  kvSet(INVITES_KEY, JSON.stringify(items));
  dispatchInviteUpdated();
}

export function getListenTogetherInvite(id: string): ListenTogetherInvite | null {
  return loadInvites().find(item => item.id === id) || null;
}

export function getPendingListenInvite(characterId: string): ListenTogetherInvite | null {
  return loadInvites().find(item => item.characterId === characterId && item.status === "pending") || null;
}

export function createListenTogetherInvite(input: {
  characterId: string;
  characterName: string;
  track?: ListenTogetherTrack | null;
  inviteText?: string;
  direction: ListenTogetherInvite["direction"];
}): ListenTogetherInvite {
  const now = new Date().toISOString();
  const expired = loadInvites().map(item => (
    item.characterId === input.characterId && item.status === "pending"
      ? { ...item, status: "expired" as const, decidedAt: now }
      : item
  ));
  const invite: ListenTogetherInvite = {
    id: generateId("linvite"),
    characterId: input.characterId,
    characterName: input.characterName,
    track: input.track || undefined,
    inviteText: input.inviteText?.slice(0, 120) || undefined,
    direction: input.direction,
    status: "pending",
    createdAt: now,
  };
  saveInvites([invite, ...expired]);
  return invite;
}

/** 角色选歌后补进邀请卡（发出时可能还没定歌） */
export function updateListenTogetherInviteTrack(id: string, track: ListenTogetherTrack): ListenTogetherInvite | null {
  const items = loadInvites();
  let updated: ListenTogetherInvite | null = null;
  const next = items.map(item => {
    if (item.id !== id) return item;
    updated = { ...item, track };
    return updated;
  });
  if (updated) saveInvites(next);
  return updated;
}

export function decideListenTogetherInvite(  id: string,
  decision: "accepted" | "declined",
): ListenTogetherInvite | null {
  const items = loadInvites();
  let updated: ListenTogetherInvite | null = null;
  const next = items.map(item => {
    if (item.id !== id) return item;
    if (item.status !== "pending") {
      updated = item;
      return item;
    }
    updated = { ...item, status: decision, decidedAt: new Date().toISOString() };
    return updated;
  });
  if (updated) saveInvites(next);
  return updated;
}
