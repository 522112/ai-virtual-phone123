import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import {
  RELATIONSHIP_KIND_META,
  isRelationshipKind,
  relationshipKindLabel,
  type RelationshipAnniversary,
  type RelationshipBinding,
  type RelationshipCheckin,
  type RelationshipComment,
  type RelationshipKind,
  type RelationshipPost,
} from "./relationship-types";

export const RELATIONSHIP_CHANGED_EVENT = "ai-relationship-changed";

const BINDINGS_KEY = "ai_phone_relationships_v1";
const POSTS_KEY = "ai_phone_rel_posts_v1";
const COMMENTS_KEY = "ai_phone_rel_comments_v1";
const CHECKINS_KEY = "ai_phone_rel_checkins_v1";
const ANNIVERSARIES_KEY = "ai_phone_rel_anniversaries_v1";

registerKvMigration(BINDINGS_KEY);
registerKvMigration(POSTS_KEY);
registerKvMigration(COMMENTS_KEY);
registerKvMigration(CHECKINS_KEY);
registerKvMigration(ANNIVERSARIES_KEY);

function emitChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RELATIONSHIP_CHANGED_EVENT));
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

function writeJson(key: string, value: unknown) {
  kvSet(key, JSON.stringify(value));
  emitChanged();
}

export function loadRelationshipBindings(): RelationshipBinding[] {
  const items = readJson<RelationshipBinding[]>(BINDINGS_KEY, []);
  return Array.isArray(items) ? items : [];
}

function saveBindings(items: RelationshipBinding[]) {
  writeJson(BINDINGS_KEY, items);
}

export function getActiveRelationship(): RelationshipBinding | null {
  return loadRelationshipBindings().find(item => item.status === "active") || null;
}

export function getPendingRelationship(): RelationshipBinding | null {
  return loadRelationshipBindings().find(item => item.status === "pending") || null;
}

export function getRelationshipById(id: string): RelationshipBinding | null {
  return loadRelationshipBindings().find(item => item.id === id) || null;
}

export function getRelationshipByCharacter(characterId: string): RelationshipBinding | null {
  return loadRelationshipBindings().find(item =>
    item.characterId === characterId && (item.status === "active" || item.status === "pending"),
  ) || null;
}

export function canStartRelationship(characterId: string): { ok: true } | { ok: false; reason: string } {
  const active = getActiveRelationship();
  if (active) {
    if (active.characterId === characterId) return { ok: false, reason: "你们已经绑定了这段关系" };
    return { ok: false, reason: "一个人只能绑定一段关系" };
  }
  const pending = getPendingRelationship();
  if (pending) {
    if (pending.characterId === characterId) {
      return { ok: false, reason: pending.invitedBy === "user" ? "等待对方接受邀请" : "对方已发出邀请，请在聊天卡片里处理" };
    }
    return { ok: false, reason: "已有待处理的关系邀请" };
  }
  return { ok: true };
}

function createBinding(input: {
  characterId: string;
  kind: RelationshipKind;
  invitedBy: "user" | "character";
  inviteMessageId?: string;
}): RelationshipBinding | { error: string } {
  const gate = canStartRelationship(input.characterId);
  if (!gate.ok) return { error: gate.reason };
  const binding: RelationshipBinding = {
    id: generateId("rel"),
    characterId: input.characterId,
    kind: input.kind,
    status: "pending",
    invitedBy: input.invitedBy,
    inviteMessageId: input.inviteMessageId,
    invitedAt: new Date().toISOString(),
  };
  saveBindings([binding, ...loadRelationshipBindings()]);
  return binding;
}

export function createOutgoingInvite(characterId: string, kind: RelationshipKind, inviteMessageId?: string) {
  return createBinding({ characterId, kind, invitedBy: "user", inviteMessageId });
}

export function createIncomingInvite(characterId: string, kind: RelationshipKind, inviteMessageId?: string) {
  return createBinding({ characterId, kind, invitedBy: "character", inviteMessageId });
}

export function attachInviteMessageId(relationshipId: string, inviteMessageId: string) {
  const items = loadRelationshipBindings();
  const next = items.map(item => item.id === relationshipId ? { ...item, inviteMessageId } : item);
  saveBindings(next);
}

export function acceptRelationship(relationshipId: string): RelationshipBinding | null {
  const items = loadRelationshipBindings();
  const current = items.find(item => item.id === relationshipId);
  if (!current || current.status !== "pending") return null;
  const acceptedAt = new Date().toISOString();
  const next = items.map(item => {
    if (item.id === relationshipId) return { ...item, status: "active" as const, acceptedAt };
    if (item.status === "pending") return { ...item, status: "declined" as const };
    return item;
  });
  saveBindings(next);
  const existingTogether = loadAnniversaries(relationshipId).some(item => item.title === "在一起的日子");
  if (!existingTogether) {
    addAnniversary(relationshipId, "在一起的日子", acceptedAt.slice(0, 10));
  }
  return next.find(item => item.id === relationshipId) || null;
}

export function declineRelationship(relationshipId: string): RelationshipBinding | null {
  const items = loadRelationshipBindings();
  const current = items.find(item => item.id === relationshipId);
  if (!current || current.status !== "pending") return null;
  const next = items.map(item => item.id === relationshipId ? { ...item, status: "declined" as const } : item);
  saveBindings(next);
  return next.find(item => item.id === relationshipId) || null;
}

export function dissolveRelationship(relationshipId: string): RelationshipBinding | null {
  const items = loadRelationshipBindings();
  const current = items.find(item => item.id === relationshipId);
  if (!current || current.status !== "active") return null;
  const dissolvedAt = new Date().toISOString();
  const next = items.map(item => item.id === relationshipId ? { ...item, status: "dissolved" as const, dissolvedAt } : item);
  saveBindings(next);
  return next.find(item => item.id === relationshipId) || null;
}

export function findPendingInviteForCharacter(characterId: string, invitedBy?: "user" | "character"): RelationshipBinding | null {
  return loadRelationshipBindings().find(item =>
    item.characterId === characterId
    && item.status === "pending"
    && (!invitedBy || item.invitedBy === invitedBy),
  ) || null;
}

export function daysTogether(binding: RelationshipBinding): number {
  const start = Date.parse(binding.acceptedAt || binding.invitedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1);
}

export function loadRelationshipPosts(relationshipId: string): RelationshipPost[] {
  const items = readJson<RelationshipPost[]>(POSTS_KEY, []);
  return items.filter(item => item.relationshipId === relationshipId);
}

export function addRelationshipPost(input: Omit<RelationshipPost, "id" | "likes" | "createdAt">): RelationshipPost {
  const post: RelationshipPost = {
    ...input,
    id: generateId("rpost"),
    likes: [],
    createdAt: new Date().toISOString(),
  };
  writeJson(POSTS_KEY, [post, ...readJson<RelationshipPost[]>(POSTS_KEY, [])]);
  return post;
}

export function toggleRelationshipPostLike(postId: string, authorType: "user" | "character", authorId: string): RelationshipPost | null {
  const items = readJson<RelationshipPost[]>(POSTS_KEY, []);
  let updated: RelationshipPost | null = null;
  const next = items.map(post => {
    if (post.id !== postId) return post;
    const exists = post.likes.some(like => like.authorType === authorType && like.authorId === authorId);
    updated = {
      ...post,
      likes: exists
        ? post.likes.filter(like => !(like.authorType === authorType && like.authorId === authorId))
        : [...post.likes, { authorType, authorId, createdAt: new Date().toISOString() }],
    };
    return updated;
  });
  if (updated) writeJson(POSTS_KEY, next);
  return updated;
}

export function loadRelationshipComments(postId: string): RelationshipComment[] {
  return readJson<RelationshipComment[]>(COMMENTS_KEY, [])
    .filter(item => item.postId === postId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addRelationshipComment(input: Omit<RelationshipComment, "id" | "createdAt">): RelationshipComment {
  const comment: RelationshipComment = {
    ...input,
    id: generateId("rcomment"),
    createdAt: new Date().toISOString(),
  };
  writeJson(COMMENTS_KEY, [...readJson<RelationshipComment[]>(COMMENTS_KEY, []), comment]);
  return comment;
}

function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function loadCheckins(relationshipId: string): RelationshipCheckin[] {
  return readJson<RelationshipCheckin[]>(CHECKINS_KEY, [])
    .filter(item => item.relationshipId === relationshipId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function hasCheckedInToday(relationshipId: string, authorId: string, authorType: "user" | "character" = "user"): boolean {
  const date = todayKey();
  return loadCheckins(relationshipId).some(item =>
    item.authorId === authorId && item.authorType === authorType && item.date === date,
  );
}

export function addCheckin(relationshipId: string, authorType: "user" | "character", authorId: string, note?: string): RelationshipCheckin | { error: string } {
  if (hasCheckedInToday(relationshipId, authorId, authorType)) {
    return { error: "今天已经打过卡了" };
  }
  const checkin: RelationshipCheckin = {
    id: generateId("rcheck"),
    relationshipId,
    authorType,
    authorId,
    date: todayKey(),
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  writeJson(CHECKINS_KEY, [checkin, ...readJson<RelationshipCheckin[]>(CHECKINS_KEY, [])]);
  return checkin;
}

export function checkinStreak(relationshipId: string): number {
  const dates = [...new Set(loadCheckins(relationshipId).map(item => item.date))].sort().reverse();
  if (dates.length === 0) return 0;
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  let streak = 0;
  let cursor = new Date(`${dates[0]}T00:00:00`);
  for (const date of dates) {
    const expected = todayKey(cursor);
    if (date !== expected) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

export function loadAnniversaries(relationshipId: string): RelationshipAnniversary[] {
  return readJson<RelationshipAnniversary[]>(ANNIVERSARIES_KEY, [])
    .filter(item => item.relationshipId === relationshipId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function addAnniversary(relationshipId: string, title: string, date: string): RelationshipAnniversary | { error: string } {
  const cleanTitle = title.trim();
  if (!cleanTitle) return { error: "请填写纪念日名称" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "请选择日期" };
  const item: RelationshipAnniversary = {
    id: generateId("ranniv"),
    relationshipId,
    title: cleanTitle,
    date,
    createdAt: new Date().toISOString(),
  };
  writeJson(ANNIVERSARIES_KEY, [...readJson<RelationshipAnniversary[]>(ANNIVERSARIES_KEY, []), item]);
  return item;
}

export function removeAnniversary(id: string) {
  writeJson(ANNIVERSARIES_KEY, readJson<RelationshipAnniversary[]>(ANNIVERSARIES_KEY, []).filter(item => item.id !== id));
}

export function anniversaryCountdown(date: string): { days: number; nextDate: string; occurred: boolean } {
  const now = new Date();
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return { days: 0, nextDate: date, occurred: false };
  const thisYear = new Date(now.getFullYear(), m - 1, d);
  thisYear.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = thisYear >= today ? thisYear : new Date(now.getFullYear() + 1, m - 1, d);
  const days = Math.round((next.getTime() - today.getTime()) / 86400000);
  return {
    days,
    nextDate: todayKey(next),
    occurred: days === 0,
  };
}

export function parseRelationshipKindLabel(raw: string | undefined): RelationshipKind | null {
  const text = (raw || "").trim();
  if (isRelationshipKind(text)) return text;
  for (const [kind, meta] of Object.entries(RELATIONSHIP_KIND_META) as [RelationshipKind, typeof RELATIONSHIP_KIND_META[RelationshipKind]][]) {
    if (meta.label === text || meta.short === text) return kind;
  }
  return null;
}

export type RelationshipSpaceActionKind = "post" | "post_from_chat" | "comment" | "reply" | "checkin" | "anniversary";

export function buildRelationshipChatExcerpt(messages: Array<{ role: string; content?: string; mediaType?: string }>): string {
  return messages
    .filter(msg => (msg.role === "user" || msg.role === "assistant") && (msg.content || "").trim() && !msg.mediaType)
    .slice(-6)
    .map(msg => `${msg.role === "user" ? "我" : "对方"}：${(msg.content || "").trim().slice(0, 80)}`)
    .join("\n");
}

export function applyCharacterSpaceAction(input: {
  characterId: string;
  characterName: string;
  action: RelationshipSpaceActionKind;
  content?: string;
  replyToAuthor?: string;
  anniversaryDate?: string;
  chatExcerpt?: string;
}): { notice: string } {
  const binding = getRelationshipByCharacter(input.characterId);
  if (!binding || binding.status !== "active") {
    return { notice: `${input.characterName}想在关系空间里做点什么，但你们还没有绑定关系` };
  }
  const spaceLabel = relationshipKindLabel(binding.kind);
  const content = (input.content || "").trim();

  if (input.action === "post" || input.action === "post_from_chat") {
    const excerpt = input.action === "post_from_chat" ? (input.chatExcerpt || "").trim() : "";
    if (!content && !excerpt) {
      return { notice: `${input.characterName}想发动态，但没有写下内容` };
    }
    addRelationshipPost({
      relationshipId: binding.id,
      authorType: "character",
      authorId: input.characterId,
      content,
      fromChat: input.action === "post_from_chat" && !!excerpt,
      chatExcerpt: excerpt || undefined,
    });
    return { notice: `${input.characterName}在${spaceLabel}空间发布了动态` };
  }

  if (input.action === "comment" || input.action === "reply") {
    if (!content) return { notice: `${input.characterName}想评论，但没有写下内容` };
    const latest = loadRelationshipPosts(binding.id)[0];
    if (!latest) return { notice: `${input.characterName}想评论，但空间里还没有动态` };
    const replyName = input.action === "reply" ? (input.replyToAuthor || "").trim() : "";
    const comments = loadRelationshipComments(latest.id);
    const replyTo = replyName
      ? [...comments].reverse().find(item =>
          item.replyToAuthorName === replyName
          || (item.authorType === "character" && input.characterName === replyName)
          || (item.authorType === "user" && (replyName === "我" || replyName === "你"))
        )
      : undefined;
    addRelationshipComment({
      postId: latest.id,
      relationshipId: binding.id,
      authorType: "character",
      authorId: input.characterId,
      content,
      replyToCommentId: replyTo?.id,
      replyToAuthorName: replyName || undefined,
    });
    return { notice: replyName ? `${input.characterName}回复了${replyName}` : `${input.characterName}评论了空间动态` };
  }

  if (input.action === "checkin") {
    const result = addCheckin(binding.id, "character", input.characterId, content || undefined);
    if ("error" in result) return { notice: `${input.characterName}想打卡，但${result.error}` };
    return { notice: `${input.characterName}在${spaceLabel}空间打了卡` };
  }

  const result = addAnniversary(binding.id, content, input.anniversaryDate || "");
  if ("error" in result) return { notice: `${input.characterName}想添加纪念日，但${result.error}` };
  return { notice: `${input.characterName}添加了纪念日「${result.title}」` };
}

export function materializeRelationshipSpacePart(input: {
  characterId: string;
  characterName: string;
  mediaData?: {
    label?: string;
    spaceAction?: RelationshipSpaceActionKind;
    spaceReplyTo?: string;
    anniversaryDate?: string;
  };
  messages?: Array<{ role: string; content?: string; mediaType?: string }>;
}): { notice: string } {
  const action = input.mediaData?.spaceAction || "post";
  return applyCharacterSpaceAction({
    characterId: input.characterId,
    characterName: input.characterName,
    action,
    content: input.mediaData?.label,
    replyToAuthor: input.mediaData?.spaceReplyTo,
    anniversaryDate: input.mediaData?.anniversaryDate,
    chatExcerpt: action === "post_from_chat" ? buildRelationshipChatExcerpt(input.messages || []) : undefined,
  });
}

export function buildRelationshipSpaceInstruction(characterId: string | undefined, isGroup?: boolean): string {
  if (isGroup || !characterId) return "";
  const binding = getRelationshipByCharacter(characterId);
  const inviteHint = "若想邀请对方，输出 [关系邀请:情侣]（或闺蜜/死党/基友）。邀请后对方会收到待接收卡片。一个人同时只能绑定一段关系。";
  if (!binding) {
    return `【关系空间】\n${inviteHint}`;
  }
  const label = relationshipKindLabel(binding.kind);
  if (binding.status === "pending") {
    if (binding.invitedBy === "user") {
      return `【关系空间】\n对方邀请你成为「${label}」。同意输出 [同意关系]，拒绝输出 [拒绝关系]。不要重复发送邀请。一个人同时只能绑定一段关系。`;
    }
    return `【关系空间】\n你已向对方发出「${label}」邀请，等待对方在卡片上处理。不要重复发送邀请。`;
  }
  return [
    `【关系空间】`,
    `你们已绑定「${label}」，可在双方空间发动态、评论、打卡和纪念日。一个人同时只能绑定一段关系。`,
    `若要在空间做事，可在回复中单独输出以下标记（可与聊天文字并存，不要向用户解释标记本身）：`,
    `[关系动态:内容] — 单纯发布一条动态`,
    `[关系动态感触:内容] — 带着当前聊天的感触发布`,
    `[关系评论:内容] — 评论空间里最近一条动态`,
    `[关系回评:对方名字:内容] — 回复某人的评论`,
    `[关系打卡] 或 [关系打卡:一句话] — 今日打卡`,
    `[关系纪念日:名称:YYYY-MM-DD] — 添加纪念日`,
  ].join("\n");
}

export { relationshipKindLabel, RELATIONSHIP_KIND_META };
