import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { pushMusicSystemNotice } from "./music-action-queue";
import { createOrGetSession, pushChatMessage } from "./chat-storage";
import { saveMemoryEntry } from "./memory-storage";
import type { MemoryEntry } from "./memory-types";
import { getAllPosts } from "./moments-storage";

export const CONTACT_REMARKS_UPDATED_EVENT = "contact-remarks-updated";

const REMARKS_KEY = "ai_phone_contact_remarks_v1";

registerKvMigration(REMARKS_KEY);

export type RemarkActor = "user" | "character";

export type CharacterRemarkRecord = {
  remark: string;
  updatedAt: string;
  updatedBy: RemarkActor;
};

function readAll(): Record<string, CharacterRemarkRecord> {
  try {
    const raw = kvGet(REMARKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, CharacterRemarkRecord> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const item = value as Partial<CharacterRemarkRecord>;
      out[key] = {
        remark: typeof item.remark === "string" ? item.remark : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        updatedBy: item.updatedBy === "user" ? "user" : "character",
      };
    }
    return out;
  } catch {
    return {};
  }
}

function dispatchUpdated(characterId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONTACT_REMARKS_UPDATED_EVENT, { detail: { characterId } }));
  window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { characterId } }));
}

/** The remark the character gave the user (what you see when checking their phone). */
export function getCharacterRemark(characterId: string): string {
  if (!characterId) return "";
  return readAll()[characterId]?.remark || "";
}

export function getCharacterRemarkRecord(characterId: string): CharacterRemarkRecord | null {
  if (!characterId) return null;
  return readAll()[characterId] || null;
}

/** Write the character's remark for the user. Actor "character" = they changed it themselves. */
export function setCharacterRemark(characterId: string, remark: string, actor: RemarkActor): CharacterRemarkRecord {
  const clean = String(remark || "").trim().slice(0, 30);
  const all = readAll();
  const record: CharacterRemarkRecord = {
    remark: clean,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  all[characterId] = record;
  kvSet(REMARKS_KEY, JSON.stringify(all));
  dispatchUpdated(characterId);
  return record;
}

/**
 * User changed THEIR remark (alias) for the character in chat settings / business card.
 * The character may or may not notice depending on persona: delivered as a system
 * notice into their context with a reply trigger; the model decides whether to mention it.
 */
export function notifyCharacterOfUserRemarkChange(
  characterId: string,
  oldRemark: string,
  newRemark: string,
): void {
  if (!characterId) return;
  const from = String(oldRemark || "").trim();
  const to = String(newRemark || "").trim();
  if (from === to) return;
  let text: string;
  if (from && to) {
    text = `[用户把给你的备注从「${from}」改成了「${to}」]`;
  } else if (to) {
    text = `[用户把给你的备注设为了「${to}」]`;
  } else {
    text = `[用户清空了给你的备注]`;
  }
  text += `（备注能力说明：你也可以改你给用户的备注，想改时单独输出一行[改备注]新备注[/改备注]即可，不要在聊天正文里解释这个标记）`;
  pushMusicSystemNotice(characterId, text, { triggerReply: true });
}

/**
 * The character changed THEIR remark for the user (via [X] action tag).
 * Shown as a visible system bubble in chat so the user sees it.
 */
export function announceCharacterRemarkChange(
  characterId: string,
  characterName: string,
  remark: string,
): void {
  if (!characterId) return;
  const clean = String(remark || "").trim().slice(0, 30);
  const chat = createOrGetSession(characterId);
  const label = characterName || "";
  pushChatMessage({
    sessionId: chat.id,
    role: "system",
    content: clean
      ? `[${label}把给你的备注改成了「${clean}」]`
      : `[${label}清空了给你的备注]`,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
  }
}

export type CheckPhoneViewDigest = {
  conversationCount: number;
  names: string[];
  previews: string[];
};

function summarizeCheckPhoneChatPayload(payload: unknown): CheckPhoneViewDigest {
  const digest: CheckPhoneViewDigest = { conversationCount: 0, names: [], previews: [] };
  try {
    if (!payload || typeof payload !== "object") return digest;
    const root = payload as Record<string, unknown>;
    const list = Array.isArray(root.conversations) ? root.conversations : Array.isArray(root.items) ? root.items : [];
    digest.conversationCount = list.length;
    for (const raw of list.slice(0, 6)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const name = [item.name, item.title, item.peerName, item.displayName].find(v => typeof v === "string" && (v as string).trim());
      if (name) digest.names.push(String(name).slice(0, 24));
      const preview = [item.preview, item.lastMessage, item.snippet].find(v => typeof v === "string" && (v as string).trim());
      if (preview) digest.previews.push(String(preview).slice(0, 80));
    }
  } catch {
    /* ignore */
  }
  return digest;
}

/**
 * Record a rough memory of what the user saw while checking a character's phone.
 * Content refreshes on every view (dynamic, not frozen). The character may bring it
 * up later depending on persona (memory injection handles recall).
 */
export async function recordCheckPhoneChatViewMemory(
  characterId: string,
  characterName: string,
  payload: unknown,
): Promise<void> {
  try {
    if (!characterId) return;
    const digest = summarizeCheckPhoneChatPayload(payload);
    const remark = getCharacterRemark(characterId);
    let recentMoments = "";
    try {
      const posts = getAllPosts()
        .filter(p => p.authorType === "character" && p.authorId === characterId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 3);
      if (posts.length > 0) {
        recentMoments = posts.map(p => String(p.content || "").slice(0, 60)).join(" / ");
      }
    } catch {
      /* ignore */
    }
    const parts: string[] = [];
    parts.push(`用户翻看了${characterName || "对方"}的手机，查看了对方微信聊天页`);
    if (digest.conversationCount > 0) {
      parts.push(`对方手机里有${digest.conversationCount}个会话`);
    }
    if (digest.names.length > 0) {
      parts.push(`看到了和${digest.names.join("、")}的聊天`);
    }
    if (digest.previews.length > 0) {
      parts.push(`瞥见了这些内容：${digest.previews.join(" / ")}`);
    }
    if (remark) {
      parts.push(`用户发现对方给自己的备注是「${remark}」`);
    }
    if (recentMoments) {
      parts.push(`对方最近的朋友圈动态大概是：${recentMoments}`);
    }
    const content = parts.join("");
    if (!content) return;
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `checkphone-view-${characterId}-chat`,
      characterId,
      sourceApp: "checkphone",
      type: "long_term",
      content,
      importance: 0.5,
      createdAt: now,
      updatedAt: now,
    };
    await saveMemoryEntry(entry);
  } catch {
    /* ignore */
  }
}

/** Character's recent moments (last `days` days, fallback to latest) for the business card. */
export function getCharacterRecentMoments(
  characterId: string,
  days = 7,
  limit = 4,
): Array<{ id: string; content: string; createdAt: string }> {
  try {
    const all = getAllPosts()
      .filter(p => p.authorType === "character" && p.authorId === characterId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = all.filter(p => {
      const t = new Date(String(p.createdAt)).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
    const picked = (recent.length > 0 ? recent : all).slice(0, limit);
    return picked.map(p => ({
      id: String((p as { id?: unknown }).id || ""),
      content: String(p.content || ""),
      createdAt: String(p.createdAt || ""),
    }));
  } catch {
    return [];
  }
}
