// lib/reverse-watch-actions.ts — 反查岗时角色对"用户小手机"能做的操作（代回复/删好友/改备注/置顶）

import {
  createOrGetSession,
  deleteChatSession,
  loadChatContacts,
  loadChatSessions,
  pushChatMessage,
  removeChatContact,
  saveChatSessions,
} from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { setCharacterRemark } from "./contact-remarks";

function findCharacterName(characterId: string): string {
  return loadCharacters().find(c => c.id === characterId)?.name || characterId;
}

/** 找到用户和某角色/联系人的私聊会话（按 characterId 或会话名/别名匹配） */
export function findUserSession(characterId: string): ReturnType<typeof loadChatSessions>[number] | null {
  const sessions = loadChatSessions();
  return sessions.find(s => !s.isGroup && s.contactId === characterId) || null;
}

export type ReverseWatchActionOutcome = { ok: boolean; message: string };

/**
 * 代用户回复消息：以"用户"的身份往目标会话里发一条消息。
 * 会返回一段说明，供角色自己的会话里标注"这是我代发的"。
 */
export function replyAsUser(params: { characterId: string; text: string; sessionId?: string }): ReverseWatchActionOutcome {
  const text = String(params.text || "").trim().slice(0, 500);
  if (!text) return { ok: false, message: "没有要回复的内容" };
  let session = params.sessionId ? loadChatSessions().find(s => s.id === params.sessionId) : undefined;
  if (!session) session = findUserSession(params.characterId) || undefined;
  if (!session) session = createOrGetSession(params.characterId);
  const msg = pushChatMessage({ sessionId: session.id, role: "user", content: text });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id, message: msg } }));
  }
  return { ok: true, message: `已以用户的身份给「${findCharacterName(params.characterId)}」回复：${text}` };
}

/** 删除好友（联系人 + 其私聊会话） */
export function deleteUserFriend(characterId: string): ReverseWatchActionOutcome {
  if (!characterId) return { ok: false, message: "没有指定要删除的好友" };
  const name = findCharacterName(characterId);
  const sessions = loadChatSessions().filter(s => !s.isGroup && s.contactId === characterId);
  for (const s of sessions) deleteChatSession(s.id);
  const contacts = loadChatContacts().filter(c => c.characterId === characterId);
  for (const c of contacts) removeChatContact(c.characterId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: {} }));
    window.dispatchEvent(new CustomEvent("chat-contacts-updated", { detail: {} }));
  }
  return { ok: true, message: `已把「${name}」从用户的好友列表里删掉` };
}

/**
 * 更改"用户手机中这个角色的备注"。
 * target="alias"：改用户看到的本角色备注（会话别名）；
 * target="self"：改本角色给用户的备注（原「改备注」能力）。
 */
export function changeUserPhoneRemark(params: {
  characterId: string;
  characterName?: string;
  remark: string;
  target?: "alias" | "self";
}): ReverseWatchActionOutcome {
  const remark = String(params.remark || "").trim().slice(0, 30);
  const target = params.target === "self" ? "self" : "alias";
  if (target === "self") {
    setCharacterRemark(params.characterId, remark, "character");
    return { ok: true, message: remark ? `已把你的备注改成「${remark}」` : "已清空对你的备注" };
  }
  const sessions = loadChatSessions();
  const idx = sessions.findIndex(s => !s.isGroup && s.contactId === params.characterId);
  if (idx < 0) {
    const session = createOrGetSession(params.characterId);
    session.alias = remark;
    saveChatSessions(loadChatSessions().map(s => (s.id === session.id ? { ...s, alias: remark } : s)));
  } else {
    sessions[idx] = { ...sessions[idx], alias: remark };
    saveChatSessions(sessions);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: {} }));
  }
  return { ok: true, message: remark ? `已把你在用户手机里的备注改成「${remark}」` : "已清空你在用户手机里的备注" };
}

/** 把自己（本角色）在用户的聊天列表里置顶 / 取消置顶 */
export function pinSelfInUserPhone(characterId: string, pinned = true): ReverseWatchActionOutcome {
  const sessions = loadChatSessions();
  const idx = sessions.findIndex(s => !s.isGroup && s.contactId === characterId);
  if (idx < 0) {
    const session = createOrGetSession(characterId);
    saveChatSessions(loadChatSessions().map(s => (s.id === session.id ? { ...s, isPinned: pinned } : s)));
  } else {
    sessions[idx] = { ...sessions[idx], isPinned: pinned };
    saveChatSessions(sessions);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: {} }));
  }
  return { ok: true, message: pinned ? "已把自己置顶在用户的聊天列表最前面" : "已取消置顶" };
}
