import { addChatContact, createOrGetSession, pushChatMessage } from "./chat-storage";
import { sanitizeListenTogetherText } from "./chat-message-display";
import { PENDING_REPLY_PREFIX } from "./friend-request-engine";
import { kvSet } from "./kv-db";
import { createListenTogetherInvite, formatListenDuration } from "./listen-together-storage";
import type { ListenTogetherInvite, ListenTogetherSession, ListenTogetherTrack } from "./listen-together-types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHistory(session: ListenTogetherSession): string {
  const tracks = session.tracks.map(item => `《${item.title}》${item.artist ? ` - ${item.artist}` : ""}`);
  return [
    "【一起听记录】",
    `用户把一次一起听发给你看。这是用户和${session.characterName}一起听过的歌。`,
    `时长 ${formatListenDuration(session)}`,
    tracks.length ? `听过：${tracks.join("、")}` : "那次还没记下歌名。",
  ].join("\n");
}

export function buildListenTogetherCardHtml(session: ListenTogetherSession): string {
  const duration = formatListenDuration(session);
  const cover = session.tracks.find(item => item.coverUrl)?.coverUrl || "";
  const tracks = session.tracks.slice(0, 4);
  const trackHtml = tracks.length
    ? tracks.map(item => `<div style="margin-top:4px;font-size:11px;line-height:1.45;opacity:0.86;">${escapeHtml(item.title)}${item.artist ? ` · ${escapeHtml(item.artist)}` : ""}</div>`).join("")
    : `<div style="margin-top:4px;font-size:11px;opacity:0.6;">没有记下歌名</div>`;
  return `
<section style="width:100%;max-width:220px;box-sizing:border-box;margin:0;padding:12px 12px 11px;background:linear-gradient(180deg,#1c1a22,#141318);color:#f4efe8;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:0.12em;opacity:0.5;">
    <span>一起听</span>
    <span>${escapeHtml(duration)}</span>
  </div>
  <div style="display:flex;gap:10px;align-items:center;margin-top:10px;">
    ${cover
      ? `<img src="${cover}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex:0 0 auto;" />`
      : `<div style="width:44px;height:44px;border-radius:8px;flex:0 0 auto;background:#2a2730;"></div>`}
    <div style="min-width:0;flex:1;">
      <h3 style="margin:0 0 4px;font-size:14px;line-height:1.3;">和${escapeHtml(session.characterName)}听过</h3>
      <p style="margin:0;font-size:11px;opacity:0.62;">${session.tracks.length} 首</p>
    </div>
  </div>
  <div style="margin-top:10px;">${trackHtml}</div>
</section>`;
}

export function sendListenTogetherRefuse(input: {
  characterId: string;
  characterName: string;
  texts: string[];
}): { sessionId: string; messageIds: string[] } {
  addChatContact(input.characterId);
  const chat = createOrGetSession(input.characterId);
  const parts = input.texts
    .map(item => sanitizeListenTogetherText(item, [input.characterName, "我", "用户"]))
    .filter(Boolean);
  if (parts.length === 0) parts.push("这会儿不太方便一起听。");
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
  const title = `和${input.session.characterName}的一起听`;
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
      appName: "音乐",
      appCardTitle: title,
      appCardBody: first ? `《${first.title}》` : title,
      appCardSummary: `一起听 · ${formatListenDuration(input.session)}`,
      appHistoryText: history,
      appCardLayout: {
        appLabel: "一起听",
        title,
        subtitle: formatListenDuration(input.session),
        body: input.session.tracks.map(item => item.title).join(" · "),
        html,
        height,
        background: "#17151c",
        accentColor: "#d9c4a6",
        sections: input.session.tracks.slice(0, 3).map(item => ({
          title: item.title,
          text: item.artist || "一起听过",
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
    ? { id: input.inviteId, characterId: input.characterId, characterName: input.characterName, track: input.track, inviteText: input.text, direction: input.direction, status: "pending", createdAt: new Date().toISOString() }
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
