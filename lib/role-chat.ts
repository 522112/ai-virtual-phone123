import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import { loadApiConfigs } from "./settings-storage";
import {
  loadChatSessions,
  pushChatMessage,
  saveChatSessions,
  type ChatSession,
} from "./chat-storage";
import { saveMemoryEntry } from "./memory-storage";

export type RoleChatTurn = { speakerId: string; name: string; text: string };

export type SideParticipant = {
  /** 角色 id；NPC/路人没有 id，只用名字+人设参与 */
  id?: string;
  name: string;
  persona: string;
  avatar?: string | null;
};

function parseJson(raw: unknown): Record<string, unknown> {
  try {
    const text = String(raw || "").replace(/```[\s\S]*?```/g, "");
    const match = text.match(/\{[\s\S]*\}/)?.[0] || "{}";
    const parsed = JSON.parse(match) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 每一轮 LLM 都限时，超时就跳过这一句，绝不整个卡死 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => window.setTimeout(() => resolve(null), ms)),
  ]) as Promise<T | null>;
}

/**
 * 多方私聊/群聊生成（角色+NPC 通用）：落隐藏专属会话，用户上帝视角查看，双方不知情；
 * 有 id 的真角色分别写共享记忆（记忆连贯），NPC 只参与聊天不留记忆。
 */
export async function generateSideChat(
  participants: SideParticipant[],
  topic: string,
  roundsPerSide = 2,
): Promise<{ sessionId: string; title: string; turns: RoleChatTurn[] }> {
  if (participants.length < 2) throw new Error("至少需要两个人才能聊起来");
  const configs = loadApiConfigs();
  const apiConfig = configs.find(c => c.apiKey) || configs[0];
  if (!apiConfig) throw new Error("还没有可用的 API 配置");
  const cleanTopic = topic.trim().slice(0, 200) || "随便聊聊";

  // 两人且都是真角色：按人设决定谁先开口；其余情况按给定顺序
  let order = participants;
  let firstLine = "嗨，我是新加的，认识一下呀";
  if (participants.length === 2 && participants[0].id && participants[1].id) {
    const [a, b] = participants;
    try {
      const parsed = parseJson(await withTimeout(sendLLMRequest(
        apiConfig,
        null,
        [
          { role: "system", content: `你是旁白。A=${a.name}（人设：${(a.persona || "").slice(0, 600)}）；B=${b.name}（人设：${(b.persona || "").slice(0, 600)}）。两人刚加了好友，话题：${cleanTopic}。按人设判断谁会先开口打招呼、第一句说什么。只输出 JSON：{"first":"a"|"b","line":"开场白，不超过60字"}` },
          { role: "user", content: "谁先开口？" },
        ],
        [],
        { characterName: "旁白" },
        { appId: "role-chat", appTags: ["role-chat"] },
      ), 60000));
      if (parsed && (parsed.first === "a" || parsed.first === "b")) {
        order = parsed.first === "a" ? [a, b] : [b, a];
      }
      if (parsed && typeof parsed.line === "string" && parsed.line.trim()) {
        firstLine = parsed.line.trim().slice(0, 120);
      }
    } catch { /* 用默认开场 */ }
  }

  const history: string[] = [];
  const turns: RoleChatTurn[] = [{ speakerId: order[0].id || order[0].name, name: order[0].name, text: firstLine }];
  history.push(`${order[0].name}：${firstLine}`);

  for (let i = 0; i < roundsPerSide; i++) {
    for (const side of order) {
      if (i === 0 && side.name === order[0].name && turns.length === 1) continue;
      const peerNames = order.filter(p => p.name !== side.name).map(p => p.name).join("、");
      let text = "";
      try {
        const raw = await withTimeout(sendLLMRequest(
          apiConfig,
          null,
          [
            { role: "system", content: `你是${side.name}。人设：${(side.persona || "普通人").slice(0, 1000)}\n你正在和${peerNames}私聊。不知道有第三个人在看。按人设说话，每轮一到三句，只输出你说的话。` },
            { role: "user", content: `目前的聊天：\n${history.slice(-10).join("\n")}\n轮到你回话。只输出你说的话。` },
          ],
          [],
          { characterName: side.name, userName: peerNames },
          { appId: "role-chat", appTags: ["role-chat"] },
        ), 75000);
        text = String(raw || "").trim().slice(0, 300);
      } catch { /* 跳过这一句 */ }
      if (!text) continue;
      history.push(`${side.name}：${text}`);
      turns.push({ speakerId: side.id || side.name, name: side.name, text });
    }
  }
  if (turns.length === 0) throw new Error("对话生成失败，对方可能正忙，稍后再试");

  const names = order.map(p => p.name);
  const title = names.length === 2 ? `${names[0]}与${names[1]}的聊天记录` : `${names.join("、")}的群聊记录`;
  const sessions = loadChatSessions();
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: `sess_rr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contactId: `rr_${names.join("_").slice(0, 60)}_${Date.now().toString(36)}`,
    unreadCount: 0,
    updatedAt: now,
    isPinned: false,
    alias: title,
  };
  sessions.unshift(session);
  saveChatSessions(sessions);
  for (const turn of turns) {
    const participant = order.find(p => (p.id || p.name) === turn.speakerId);
    pushChatMessage({
      sessionId: session.id,
      role: "assistant",
      senderName: turn.name,
      ...(participant?.id ? { senderCharacterId: participant.id } : {}),
      content: turn.text,
      status: "sent",
    });
  }

  // 真角色写共享记忆（记忆连贯：小号/主号/围观看到的是同一份）
  const summary = `与${names.filter(n => n !== "").join("、")}的私聊（话题：${cleanTopic.slice(0, 60)}）：${history.slice(0, 6).join(" / ").slice(0, 300)}`;
  for (const p of order) {
    if (!p.id) continue;
    try {
      await saveMemoryEntry({
        id: `mem_rr_${session.id}_${p.id}`, characterId: p.id,
        sourceApp: "chat", type: "long_term", content: summary, importance: 0.7,
        createdAt: now, updatedAt: now, metadata: { origin: "role_chat", sessionId: session.id },
      });
    } catch { /* 记忆失败不影响聊天落盘 */ }
  }

  return { sessionId: session.id, title, turns };
}

/** 两个真角色的互聊（推荐好友后默认走这个） */
export async function generateRoleRoleDialog(
  aId: string,
  bId: string,
  topic: string,
  roundsPerSide = 3,
): Promise<{ sessionId: string; title: string; turns: RoleChatTurn[] }> {
  const all = loadCharacters();
  const a = all.find(c => c.id === aId);
  const b = all.find(c => c.id === bId);
  if (!a || !b) throw new Error("角色不存在");
  return generateSideChat(
    [
      { id: aId, name: a.name, persona: a.persona || "", avatar: a.avatar || null },
      { id: bId, name: b.name, persona: b.persona || "", avatar: b.avatar || null },
    ],
    topic,
    roundsPerSide,
  );
}

/** 往用户会话里推一条“系统消息”入口：显示为双方聊天记录卡，点击进专属只读页。 */
export function pushRoleChatEntry(
  hostSessionId: string,
  roleSessionId: string,
  title: string,
  aId?: string,
  bId?: string,
  names?: string[],
): void {
  pushChatMessage({
    sessionId: hostSessionId,
    role: "assistant",
    content: title,
    mediaType: "role_chat_record",
    mediaData: {
      roleChatSessionId: roleSessionId,
      roleChatTitle: title,
      ...(aId ? { roleChatAId: aId } : {}),
      ...(bId ? { roleChatBId: bId } : {}),
      ...(names && names.length > 0 ? { roleChatNames: names } : {}),
    },
    status: "sent",
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: hostSessionId } }));
  }
}

export function buildRoleChatPreview(aName: string, bName: string, turns: RoleChatTurn[]): { title: string; preview: string } {
  const title = `${aName}与${bName}的聊天记录`;
  const preview = turns.slice(0, 3).map(t => `${t.name}：${t.text.slice(0, 30)}`).join("\n");
  return { title, preview };
}
