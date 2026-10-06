import { addChatContact, createOrGetSession, loadChatMessages, pushChatMessage, updateMessageMediaData } from "./chat-storage";
import { sanitizeListenTogetherText } from "./chat-message-display";
import { PENDING_REPLY_PREFIX } from "./friend-request-engine";
import { kvSet } from "./kv-db";
import { createListenTogetherInvite, decideListenTogetherInvite, formatListenDuration, getListenTogetherInvite, loadListenTogetherSessions } from "./listen-together-storage";
import type { ListenTogetherInvite, ListenTogetherSession, ListenTogetherTrack } from "./listen-together-types";
import { loadCharacters } from "./character-storage";
import { resolveUserIdentity } from "./settings-storage";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHistory(session: ListenTogetherSession): string {
  const tracks = session.tracks.map(item => `?${item.title}?${item.artist ? ` - ${item.artist}` : ""}`);
  return [
    "???????",
    `??????????????????${session.characterName}???????`,
    `?? ${formatListenDuration(session)}`,
    tracks.length ? `???${tracks.join("?")}` : "?????????",
  ].join("\n");
}

export function buildListenTogetherCardHtml(session: ListenTogetherSession, opts?: { characterAvatar?: string; userAvatar?: string }): string {
  const duration = formatListenDuration(session);
  const cover = session.tracks.find(item => item.coverUrl)?.coverUrl || "";
  const playlistName = session.playlist?.name || `?${escapeHtml(session.characterName)}????`;
  const tracks = session.tracks.slice(0, 4);
  const trackHtml = tracks.length
    ? tracks.map(item => `<div style="margin-top:4px;font-size:11px;line-height:1.45;opacity:0.86;">${escapeHtml(item.title)}${item.artist ? ` ? ${escapeHtml(item.artist)}` : ""}</div>`).join("")
    : `<div style="margin-top:4px;font-size:11px;opacity:0.6;">??????</div>`;
  const avatars = (opts?.characterAvatar || opts?.userAvatar)
    ? `<div style="display:flex;align-items:center;margin-top:10px;">${opts?.userAvatar ? `<img src="${opts.userAvatar}" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid #2c2833;" />` : ""}${opts?.characterAvatar ? `<img src="${opts.characterAvatar}" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid #2c2833;margin-left:-8px;" />` : ""}<span style="margin-left:8px;font-size:10px;opacity:0.6;">${playlistName}</span></div>`
    : "";
  const peerChar = loadCharacters().find(c => c.id === session.characterId) || null;
  const peerId = peerChar?.screenName?.trim() || session.characterName;
  const myId = resolveUserIdentity(session.characterId, "chat")?.name || "?";
  const idsRow = `<div style="margin-top:8px;font-size:10px;opacity:0.55;">${escapeHtml(peerId)} ? ${escapeHtml(myId)}</div>`;
  return `
<section style="width:100%;max-width:230px;box-sizing:border-box;margin:0;padding:14px;background:linear-gradient(160deg,#262130,#141318 60%,#1d1826);color:#f4efe8;border-radius:14px;border:1px solid rgba(255,255,255,0.09);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.45);">
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:0.14em;opacity:0.55;">
    <span>?? ???</span>
    <span>${escapeHtml(duration)}</span>
  </div>
  <div style="display:flex;gap:10px;align-items:center;margin-top:10px;">
    ${cover
      ? `<img src="${cover}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:10px;flex:0 0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.5);" />`
      : `<div style="width:48px;height:48px;border-radius:10px;flex:0 0 auto;background:linear-gradient(140deg,#3a3348,#23202b);display:flex;align-items:center;justify-content:center;font-size:20px;">??</div>`}
    <div style="min-width:0;flex:1;">
      <h3 style="margin:0 0 4px;font-size:14px;line-height:1.3;">${playlistName}</h3>
      <p style="margin:0;font-size:11px;opacity:0.62;">${session.tracks.length} ? ? ?${escapeHtml(session.characterName)}??</p>
    </div>
  </div>
  <div style="margin-top:10px;">${trackHtml}</div>${avatars}${idsRow}
</section>`;
}
export function buildListenTogetherReportHtml(session: ListenTogetherSession, opts?: { characterAvatar?: string; userAvatar?: string }): string {
  const duration = formatListenDuration(session);
  const peerChar = loadCharacters().find(c => c.id === session.characterId) || null;
  const peerAvatar = opts?.characterAvatar || peerChar?.avatar || "";
  const identity = resolveUserIdentity(session.characterId, "chat");
  const userAvatar = opts?.userAvatar || identity?.avatarUrl || "";
  const date = (session.startedAt || "").slice(0, 10).replace(/-/g, ".");
  const listenedCount = session.heardTrackIds?.length || session.tracks.length;
  let cumulativeTracks = listenedCount;
  let cumulativeMinutes = Math.max(1, Math.round((new Date(session.endedAt || Date.now()).getTime() - new Date(session.startedAt).getTime()) / 60000));
  try {
    const mine = loadListenTogetherSessions().filter(item => item.characterId === session.characterId);
    if (mine.length > 0) {
      cumulativeTracks = mine.reduce((sum, item) => sum + (item.heardTrackIds?.length || item.tracks.length), 0);
      cumulativeMinutes = mine.reduce((sum, item) => {
        const start = new Date(item.startedAt).getTime();
        const end = new Date(item.endedAt || Date.now()).getTime();
        return sum + Math.max(1, Math.round((end - start) / 60000));
      }, 0);
    }
  } catch {
    // 取不到累计就只显示本次
  }
  const cumulativeDuration = cumulativeMinutes < 60
    ? `${cumulativeMinutes}分钟`
    : `${Math.floor(cumulativeMinutes / 60)}小时${cumulativeMinutes % 60}分钟`;
  const messageCount = session.messages.length;
  return `
<section style="width:100%;box-sizing:border-box;margin:0;padding:0;background:linear-gradient(170deg,#ff6a5e,#f43f4e 45%,#e8344a);color:#fff;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.45);overflow:hidden;">
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:10px 12px 0;opacity:0.9;">
    <span>网易云音乐 | 一起听</span>
    <span>${escapeHtml(date)}</span>
  </div>
  <div style="display:flex;justify-content:center;margin-top:8px;">
    ${userAvatar ? `<img src="${userAvatar}" alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.9);" />` : ""}
    ${peerAvatar ? `<img src="${peerAvatar}" alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.9);margin-left:-14px;" />` : ""}
  </div>
  <div style="margin:10px 12px 0;background:#fff;color:#e8354b;border-radius:16px;padding:16px 12px;text-align:center;">
    <div style="display:flex;">
      <div style="flex:1;">
        <div style="font-size:11px;color:#e58aa0;">本次一起听了</div>
        <div style="font-size:18px;font-weight:800;margin-top:5px;">${listenedCount}首歌曲</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;color:#e58aa0;">本次陪伴彼此</div>
        <div style="font-size:18px;font-weight:800;margin-top:5px;">${escapeHtml(duration)}</div>
      </div>
    </div>
    <div style="margin-top:14px;display:inline-flex;align-items:center;gap:6px;border:1px solid #f0c8d2;border-radius:16px;padding:6px 16px;font-size:12px;color:#e8354b;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e8354b" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
      收藏到歌单
    </div>
    <div style="margin-top:12px;font-size:11px;color:#c98a99;">累计${cumulativeTracks}首歌曲、${escapeHtml(cumulativeDuration)}</div>
  </div>
  <div style="margin:10px 12px 0;background:rgba(255,255,255,0.2);border-radius:12px;padding:11px;text-align:center;font-size:12px;">
    互发消息 ${messageCount}条
  </div>
  <div style="margin:12px 12px 0;display:flex;align-items:center;justify-content:center;gap:10px;">
    <span style="width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,0.9);display:inline-block;background-image:repeating-linear-gradient(0deg,#e8354b 0 3px,transparent 3px 6px),repeating-linear-gradient(90deg,#e8354b 0 3px,transparent 3px 6px);background-size:12px 12px;background-position:2px 2px;"></span>
    <span style="font-size:10px;opacity:0.85;line-height:1.5;">扫码或用云音乐<br/>搜索「一起听」</span>
  </div>
  <div style="display:flex;gap:10px;padding:14px 12px 16px;">
    <span style="flex:1;text-align:center;border:1px solid rgba(255,255,255,0.7);border-radius:22px;padding:9px 0;font-size:13px;font-weight:600;">聊天记录</span>
    <span style="flex:1;text-align:center;background:#fff;color:#e8354b;border-radius:22px;padding:9px 0;font-size:13px;font-weight:700;">分享报告</span>
  </div>
</section>`;
}

export function sendListenTogetherReportCard(input: {
  characterId: string;
  characterName: string;
  session: ListenTogetherSession;
}): { sessionId: string; messageId: string } {
  addChatContact(input.characterId);
  const chat = createOrGetSession(input.characterId);
  const html = buildListenTogetherReportHtml(input.session);
  const title = `和${input.session.characterName}的一起听报告`;
  const listened = input.session.heardTrackIds?.length || input.session.tracks.length;
  const message = pushChatMessage({
    sessionId: chat.id,
    role: "user",
    content: title,
    mediaType: "app_card",
    mediaData: {
      appId: "music",
      appName: "音乐",
      appCardTitle: title,
      appCardBody: `本次一起听了${listened}首歌曲 · ${formatListenDuration(input.session)}`,
      appCardSummary: `一起听报告 · 互发消息${input.session.messages.length}条`,
      appCardLayout: {
        appLabel: "一起听",
        title,
        subtitle: formatListenDuration(input.session),
        body: input.session.tracks.map(item => item.title).join("、"),
        html,
        background: "#e8344a",
        accentColor: "#ffffff",
      },
    },
  });
  // 分享报告只留记录给角色可知，不直接触发 API 回复，用户自行调用
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
  }
  return { sessionId: chat.id, messageId: message.id };
}
export function sendListenTogetherRefuse(input: {
  characterId: string;
  characterName: string;
  texts: string[];
}): { sessionId: string; messageIds: string[] } {
  addChatContact(input.characterId);
  const chat = createOrGetSession(input.characterId);
  const parts = input.texts
    .map(item => sanitizeListenTogetherText(item, [input.characterName, "?", "??"]))
    .filter(Boolean);
  if (parts.length === 0) parts.push("???????????");
  const messageIds = parts.map(text => pushChatMessage({
    sessionId: chat.id,
    role: "assistant",
    content: text,
    senderName: input.characterName,
    senderCharacterId: input.characterId,
  }).id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
  }
  return { sessionId: chat.id, messageIds };
}

export function sendListenTogetherShare(input: {
  characterId: string;
  session: ListenTogetherSession;
}): { sessionId: string; messageId: string } {  addChatContact(input.characterId);
  const chat = createOrGetSession(input.characterId);
  const title = `和${input.session.characterName}的一起听报告`;
  const listened = input.session.heardTrackIds?.length || input.session.tracks.length;
  const history = formatHistory(input.session);
  const html = buildListenTogetherReportHtml(input.session);
  const message = pushChatMessage({
    sessionId: chat.id,
    role: "user",
    content: title,
    mediaType: "app_card",
    mediaData: {
      appId: "music",
      appName: "音乐",
      appCardTitle: title,
      appCardBody: `本次一起听了${listened}首歌曲 · ${formatListenDuration(input.session)}`,
      appCardSummary: `一起听报告 · 互发消息${input.session.messages.length}条`,
      appHistoryText: history,
      appCardLayout: {
        appLabel: "一起听",
        title,
        subtitle: formatListenDuration(input.session),
        body: input.session.tracks.map(item => item.title).join("、"),
        html,
        background: "#e8344a",
        accentColor: "#ffffff",
      },
    },
  });
  // 分享报告只留记录给角色可知，不直接触发 API 回复，用户自行调用
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
  }
  return { sessionId: chat.id, messageId: message.id };
}

export function sendListenTogetherInviteCard(input: {
  characterId: string;
  characterName: string;
  direction: "incoming" | "outgoing";
  track?: ListenTogetherTrack | null;
  text?: string;
  inviteId?: string;
}): { sessionId: string; messageId: string; inviteId: string } {
  addChatContact(input.characterId);
  const chat = createOrGetSession(input.characterId);
  const invite: ListenTogetherInvite = input.inviteId
    ? { id: input.inviteId, characterId: input.characterId, characterName: input.characterName, track: input.track || undefined, inviteText: input.text, direction: input.direction, status: "pending", createdAt: new Date().toISOString() }
    : createListenTogetherInvite({ characterId: input.characterId, characterName: input.characterName, track: input.track, inviteText: input.text, direction: input.direction });
  const trackLine = input.track ? "\u300a" + input.track.title + "\u300b" + (input.track.artist ? " - " + input.track.artist : "") : "";
  const title = input.direction === "incoming" ? "\u9080\u4f60\u4e00\u8d77\u542c" : "\u4e00\u8d77\u542c\u9080\u8bf7";
  const message = pushChatMessage({
    sessionId: chat.id,
    role: input.direction === "incoming" ? "assistant" : "user",
    content: trackLine ? title + "\uff1a" + trackLine : title,
    senderName: input.direction === "incoming" ? input.characterName : undefined,
    senderCharacterId: input.direction === "incoming" ? input.characterId : undefined,
    mediaType: "listen_invite",
    mediaData: {
      inviteId: invite.id,
      musicTitle: input.track?.title || "",
      musicArtist: input.track?.artist || "",
      musicCover: input.track?.coverUrl || "",
      inviteText: input.text || "",
      inviteDirection: input.direction,
      status: "pending",
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
  }
  return { sessionId: chat.id, messageId: message.id, inviteId: invite.id };
}

export function revealListenTogetherOutcome(input: {
  sessionId: string;
  messageId: string;
  inviteId: string;
  accept: boolean;
  peerTexts: string[];
}): boolean {
  const invite = getListenTogetherInvite(input.inviteId);
  if (!invite || invite.status !== "pending") return false;
  decideListenTogetherInvite(input.inviteId, input.accept ? "accepted" : "declined");
  const chat = createOrGetSession(invite.characterId);
  const existing = loadChatMessages(chat.id, 200).find(m => m.id === input.messageId)?.mediaData || {};
  updateMessageMediaData(input.messageId, { ...existing, inviteId: invite.id, status: input.accept ? "accepted" : "declined" });
  const parts = input.peerTexts.map(item => sanitizeListenTogetherText(item, [invite.characterName, "??", "???"])).filter(Boolean);
  if (parts.length === 0) parts.push(input.accept ? "????????????" : "????????????????");
  parts.forEach(text => pushChatMessage({ sessionId: chat.id, role: "assistant", content: text, senderName: invite.characterName, senderCharacterId: invite.characterId }));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
  }
  return true;
}
