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
  const peerId = peerChar?.screenName?.trim() || session.characterName;
  const myId = identity?.name || "我";
  const date = (session.startedAt || "").slice(0, 10).replace(/-/g, ".");
  let cumulativeTracks = session.tracks.length;
  try {
    const mine = loadListenTogetherSessions().filter(item => item.characterId === session.characterId);
    if (mine.length > 0) {
      cumulativeTracks = mine.reduce((sum, item) => sum + item.tracks.length, 0);
    }
  } catch {
    // 取不到累计就只显示本次
  }
  const messageCount = session.messages.length;
  return `
<section style="width:100%;max-width:230px;box-sizing:border-box;margin:0;padding:0;background:linear-gradient(170deg,#ff6a5e,#f43f4e 45%,#e8344a);color:#fff;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.45);overflow:hidden;">
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:10px 12px 0;opacity:0.9;">
    <span>网易云音乐 | 一起听</span>
    <span>${escapeHtml(date)}</span>
  </div>
  <div style="display:flex;justify-content:center;margin-top:6px;">
    ${userAvatar ? `<img src="${userAvatar}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.85);" />` : ""}
    ${peerAvatar ? `<img src="${peerAvatar}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.85);margin-left:-12px;" />` : ""}
  </div>
  <div style="margin:10px 12px 0;background:#fff;color:#e8354b;border-radius:12px;padding:14px 10px;text-align:center;">
    <div style="display:flex;">
      <div style="flex:1;">
        <div style="font-size:11px;opacity:0.75;">本次一起听了</div>
        <div style="font-size:17px;font-weight:800;margin-top:4px;">${session.tracks.length}首歌曲</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;opacity:0.75;">本次陪伴彼此</div>
        <div style="font-size:17px;font-weight:800;margin-top:4px;">${escapeHtml(duration)}</div>
      </div>
    </div>
    <div style="margin-top:10px;font-size:11px;opacity:0.65;">累计${cumulativeTracks}首歌曲 · ${escapeHtml(peerId)} · ${escapeHtml(myId)}</div>
  </div>
  <div style="margin:10px 12px 0;background:rgba(255,255,255,0.18);border-radius:12px;padding:10px;text-align:center;font-size:12px;">
    互发消息 ${messageCount}条
  </div>
  <div style="padding:12px;text-align:center;font-size:10px;opacity:0.75;">扫码或用云音乐搜索「一起听」</div>
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
  const title = `和${input.session.characterName}的一起听`;
  const message = pushChatMessage({
    sessionId: chat.id,
    role: "user",
    content: `${title}：${input.session.tracks.length}首，${formatListenDuration(input.session)}`,
    mediaType: "app_card",
    mediaData: {
      appId: "music",
      appName: "音乐",
      appCardTitle: title,
      appCardBody: `本次${input.session.tracks.length}首 · ${formatListenDuration(input.session)}`,
      appCardSummary: `一起听报告 · 互发消息${input.session.messages.length}条`,
      appCardLayout: {
        appLabel: "一起听",
        title,
        subtitle: formatListenDuration(input.session),
        body: input.session.tracks.map(item => item.title).join("、"),
        html,
        height: 330,
        background: "#e8344a",
        accentColor: "#ffffff",
      },
    },
  });
  if (typeof window !== "undefined") {
    kvSet(PENDING_REPLY_PREFIX + chat.id, "1");
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
  const title = `?${input.session.characterName}????`;
  const history = formatHistory(input.session);
  const html = buildListenTogetherCardHtml(input.session);
  const first = input.session.tracks[0];
  const height = 132 + Math.min(4, input.session.tracks.length) * 18;
  const message = pushChatMessage({
    sessionId: chat.id,
    role: "user",
    content: history,
    mediaType: "app_card",
    mediaData: {
      appId: "music",
      appName: "??",
      appCardTitle: title,
      appCardBody: first ? `?${first.title}?` : title,
      appCardSummary: `??? ? ${formatListenDuration(input.session)}`,
      appHistoryText: history,
      appCardLayout: {
        appLabel: "???",
        title,
        subtitle: formatListenDuration(input.session),
        body: input.session.tracks.map(item => item.title).join(" ? "),
        html,
        height,
        background: "#17151c",
        accentColor: "#d9c4a6",
        sections: input.session.tracks.slice(0, 3).map(item => ({
          title: item.title,
          text: item.artist || "????",
        })),
      },
    },
  });
  if (typeof window !== "undefined") {
    kvSet(PENDING_REPLY_PREFIX + chat.id, "1");
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
