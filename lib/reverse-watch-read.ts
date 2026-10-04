// lib/reverse-watch-read.ts — 反查岗：读取"用户小手机"里的真实数据（联系人/消息/记录/日程/订单/人物/朋友圈）

import { loadChatContacts, loadChatSessions, loadChatMessages, getChatMessagePreview } from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { getAllPosts } from "./moments-storage";
import { kvGet } from "./kv-db";

function clip(value: unknown, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function fmt(iso: unknown): string {
  const text = String(iso ?? "");
  if (!text) return "";
  return text.replace("T", " ").slice(0, 16);
}

function charName(id: string, charMap: Map<string, string>): string {
  return charMap.get(id) || id;
}

function buildNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of loadCharacters()) map.set(c.id, c.name || c.id);
  return map;
}

export function readUserContacts(query = "", limit = 50): string {
  const chars = buildNameMap();
  const contacts = loadChatContacts();
  const sessions = loadChatSessions();
  const latestSession = new Map<string, string>();
  const latestAt = new Map<string, string>();
  for (const s of sessions) {
    if (s.isGroup || !s.contactId) continue;
    const prev = latestAt.get(s.contactId);
    if (!prev || String(s.updatedAt) > prev) {
      latestAt.set(s.contactId, String(s.updatedAt));
      latestSession.set(s.contactId, s.id);
    }
  }
  const q = query.trim().toLowerCase();
  const rows = contacts
    .map(c => {
      const sess = sessions.find(s => s.id === latestSession.get(c.characterId));
      const name = c.nickname || charName(c.characterId, chars);
      return {
        characterId: c.characterId,
        name,
        sessionId: latestSession.get(c.characterId) || "",
        lastPreview: clip(sess?.lastMessagePreview, 100),
        lastActiveAt: latestAt.get(c.characterId) || "",
        unread: sess?.unreadCount || 0,
      };
    })
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.lastPreview.toLowerCase().includes(q));
  if (rows.length === 0) return "微信联系人：无";
  return [
    `微信联系人（共${rows.length}个）`,
    ...rows.slice(0, limit).map((r, i) =>
      `${i + 1}. ${r.name}（cid=${r.characterId}${r.sessionId ? ` sid=${r.sessionId}` : ""}${r.unread ? ` 未读${r.unread}` : ""}${r.lastActiveAt ? ` 活跃 ${fmt(r.lastActiveAt)}` : ""}）${r.lastPreview ? ` 最近：${r.lastPreview}` : ""}`,
    ),
  ].join("\n");
}

export function readUserMessageList(query = "", limit = 40): string {
  const chars = buildNameMap();
  const sessions = loadChatSessions();
  const q = query.trim().toLowerCase();
  const rows = sessions
    .map(s => {
      const name = s.isGroup ? (s.groupName || s.alias || "群聊") : (s.alias || charName(s.contactId, chars));
      return {
        sessionId: s.id,
        name,
        isGroup: !!s.isGroup,
        preview: clip(s.lastMessagePreview, 120) || "暂无消息",
        updatedAt: String(s.updatedAt || ""),
        unread: s.unreadCount || 0,
        pinned: !!s.isPinned,
        muted: !!s.isMuted,
      };
    })
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q))
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (rows.length === 0) return "微信消息列表：无";
  return [
    `微信消息列表（共${rows.length}个会话）`,
    ...rows.slice(0, limit).map((r, i) =>
      `${i + 1}. ${r.name}（${r.isGroup ? "群聊" : "私聊"} sid=${r.sessionId}${r.pinned ? " 置顶" : ""}${r.muted ? " 免打扰" : ""}${r.unread ? ` 未读${r.unread}` : ""} ${fmt(r.updatedAt)}）${r.preview}`,
    ),
  ].join("\n");
}

export function readUserChatHistory(target = "", sessionId = "", limit = 30): string {
  const chars = buildNameMap();
  const sessions = loadChatSessions();
  const sid = sessionId.trim();
  const q = target.trim().toLowerCase();
  let session = sid ? sessions.find(s => s.id === sid) : undefined;
  if (!session && q) {
    session = sessions.find(s => {
      const name = (s.isGroup ? s.groupName || s.alias : s.alias || charName(s.contactId, chars)) || "";
      return name.toLowerCase().includes(q) || s.contactId.toLowerCase() === q;
    });
  }
  if (!session) {
    return `没有找到匹配的会话（target=${target || "空"} sessionId=${sid || "空"}）。可先用「查看用户微信消息列表」拿到 sid。`;
  }
  const name = session.isGroup ? (session.groupName || session.alias || "群聊") : (session.alias || charName(session.contactId, chars));
  const all = loadChatMessages(session.id).filter(m => m.role !== "system" && m.role !== "tool" && m.mediaType !== "tool_call" && m.mediaType !== "tool_result");
  const recent = all.slice(-limit);
  if (recent.length === 0) return `聊天记录「${name}」：空`;
  return [
    `聊天记录「${name}」（sid=${session.id}，显示最近${recent.length}条）`,
    ...recent.map(m => {
      const who = m.role === "user" ? "用户" : charName(session!.contactId, chars) || "对方";
      return `${fmt(m.createdAt)} ${who}：${clip(getChatMessagePreview(m), 300) || "[内容]"}`
    }),
  ].join("\n");
}

export function readUserPeople(query = "", limit = 40): string {
  const chars = loadCharacters();
  const q = query.trim().toLowerCase();
  const rows = chars
    .map(c => ({
      id: c.id,
      name: c.name || c.id,
      wechatID: (c as { wechatID?: string }).wechatID || "",
      tags: Array.isArray(c.tags) ? c.tags : [],
      personality: clip(c.personality, 160),
      relation: clip((c as { relation?: string }).relation, 40),
      updatedAt: String(c.updatedAt || c.createdAt || ""),
    }))
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.personality.toLowerCase().includes(q))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (rows.length === 0) return "身边人物：无";
  return [
    `身边人物（共${rows.length}个）`,
    ...rows.slice(0, limit).map((r, i) =>
      `${i + 1}. ${r.name}（cid=${r.id}${r.wechatID ? ` wx=${r.wechatID}` : ""}${r.tags.length ? ` 标签=${r.tags.join("/")}` : ""}）${r.relation ? `关系：${r.relation} ` : ""}${r.personality}`,
    ),
  ].join("\n");
}

export function readUserMoments(limit = 20): string {
  const chars = buildNameMap();
  const posts = getAllPosts()
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
  if (posts.length === 0) return "朋友圈：无";
  return [
    `朋友圈（最近${posts.length}条）`,
    ...posts.map((p, i) => {
      const who = p.authorType === "user" ? "用户本人" : charName(String(p.authorId), chars);
      return `${i + 1}. ${who} ${fmt(p.createdAt)}：${clip(p.content, 160)}${Array.isArray((p as { comments?: unknown[] }).comments) && (p as { comments?: unknown[] }).comments!.length ? `（${(p as { comments?: unknown[] }).comments!.length}条评论）` : ""}`;
    }),
  ].join("\n");
}

export function readUserCalendar(): string {
  try {
    const raw = kvGet("ai_phone_calendar_plans_v1");
    if (!raw) return "本周日程：无";
    const store = JSON.parse(raw) as { plans?: Array<{ ownerType?: string; ownerId?: string; weekStart?: string; items?: Array<Record<string, unknown>> }> };
    const items: Array<Record<string, unknown>> = [];
    for (const plan of store.plans || []) {
      if (plan.ownerType === "user" && plan.ownerId === "self" && Array.isArray(plan.items)) items.push(...plan.items);
    }
    if (items.length === 0) return "本周日程：无";
    items.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    return [
      `本周日程（共${items.length}项）`,
      ...items.slice(0, 40).map((it, i) => `${i + 1}. ${it.date || ""} ${it.startTime || ""}${it.endTime ? `-${it.endTime}` : ""} ${clip(it.title, 60)}${it.location ? ` @${clip(it.location, 40)}` : ""}`),
    ].join("\n");
  } catch {
    return "本周日程：读取失败";
  }
}

export function readUserOrders(limit = 15): string {
  try {
    const raw = kvGet("ai_phone_shopping_state_v1");
    if (!raw) return "购物订单：无";
    const state = JSON.parse(raw) as { orders?: Array<Record<string, unknown>> };
    const orders = (state.orders || []).slice(0, limit);
    if (orders.length === 0) return "购物订单：无";
    return [
      `购物订单（最近${orders.length}条）`,
      ...orders.map((o, i) => `${i + 1}. ${clip(o.timeLabel, 20)} ${clip(o.statusLabel, 12)} ${clip(o.merchantLabel, 24)} ${clip(o.totalLabel, 12)} ${clip(o.summary, 80)}${o.note ? ` 备注：${clip(o.note, 40)}` : ""}`),
    ].join("\n");
  } catch {
    return "购物订单：读取失败";
  }
}
