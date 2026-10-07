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

/**
 * 角色与角色的专属聊天：先由双方人设决定谁先开口，再轮流多轮。
 * 落成一个隐藏的专属会话（用户上帝视角查看，双方不知情），并分别写入双方记忆。
 */
export async function generateRoleRoleDialog(
  aId: string,
  bId: string,
  topic: string,
  roundsPerSide = 3,
): Promise<{ sessionId: string; title: string; turns: RoleChatTurn[] }> {
  const a = loadCharacters().find(c => c.id === aId);
  const b = loadCharacters().find(c => c.id === bId);
  if (!a || !b) throw new Error("角色不存在");
  const configs = loadApiConfigs();
  const apiConfig = configs.find(c => c.apiKey) || configs[0];
  if (!apiConfig) throw new Error("还没有可用的 API 配置");

  // 谁先开口：按双方人设判定（主动 locuacidad、外向者先手）
  const firstParsed = parseJson(await sendLLMRequest(
    apiConfig,
    null,
    [
      { role: "system", content: `你是旁白。A=${a.name}（人设：${(a.persona || "").slice(0, 600)}）；B=${b.name}（人设：${(b.persona || "").slice(0, 600)}）。两人刚加了好友，话题：${topic.slice(0, 200)}。按人设判断谁会先开口打招呼、第一句说什么。只输出 JSON：{"first":"a"|"b","line":"开场白，不超过60字"}` },
      { role: "user", content: "谁先开口？" },
    ],
    [],
    { characterName: "旁白" },
    { appId: "role-chat", appTags: ["role-chat"] },
  ));
  const firstKey = firstParsed.first === "b" ? "b" : "a";
  const firstLine = typeof firstParsed.line === "string" && firstParsed.line.trim()
    ? firstParsed.line.trim().slice(0, 120)
    : "嗨，我是新加的，认识一下呀";

  const order = firstKey === "a"
    ? [{ id: aId, me: a, peer: b }, { id: bId, me: b, peer: a }]
    : [{ id: bId, me: b, peer: a }, { id: aId, me: a, peer: b }];

  const history: string[] = [];
  const turns: RoleChatTurn[] = [{ speakerId: order[0].id, name: order[0].me.name, text: firstLine }];
  history.push(`${order[0].me.name}：${firstLine}`);

  for (let i = 0; i < roundsPerSide; i++) {
    for (const side of order) {
      if (i === 0 && side.id === order[0].id && turns.length === 1) continue;
      const raw = await sendLLMRequest(
        apiConfig,
        null,
        [
          { role: "system", content: `你是${side.me.name}。人设：${(side.me.persona || "").slice(0, 1000)}\n你正在和${side.peer.name}私聊（人设：${(side.peer.persona || "").slice(0, 500)}）。不知道有第三个人在看。按人设说话，每轮一到三句，只输出你说的话。` },
          { role: "user", content: `目前的聊天：\n${history.slice(-8).join("\n")}\n轮到你回${side.peer.name}。只输出你说的话。` },
        ],
        [],
        { characterName: side.me.name, userName: side.peer.name },
        { appId: "role-chat", appTags: ["role-chat"] },
      );
      const text = String(raw || "").trim().slice(0, 300);
      if (!text) continue;
      history.push(`${side.me.name}：${text}`);
      turns.push({ speakerId: side.id, name: side.me.name, text });
    }
  }
  if (turns.length === 0) throw new Error("对话生成失败");

  // 落专属隐藏会话（contactId 合成串，列表按联系人过滤时天然隐藏）
  const sessions = loadChatSessions();
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: `sess_rr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contactId: `rr_${aId}_${bId}`,
    unreadCount: 0,
    updatedAt: now,
    isPinned: false,
    alias: `${a.name}与${b.name}的聊天记录`,
  };
  sessions.unshift(session);
  saveChatSessions(sessions);
  for (const turn of turns) {
    pushChatMessage({
      sessionId: session.id,
      role: "assistant",
      senderName: turn.name,
      senderCharacterId: turn.speakerId,
      content: turn.text,
      status: "sent",
    });
  }

  // 双方记忆：各自记得这场聊天（用户不可见，双方也不知道被围观）
  const summary = `与${b.name}的私聊（话题：${topic.slice(0, 60)}）：${history.slice(0, 6).join(" / ").slice(0, 300)}`;
  const summaryB = `与${a.name}的私聊（话题：${topic.slice(0, 60)}）：${history.slice(0, 6).join(" / ").slice(0, 300)}`;
  try {
    await saveMemoryEntry({
      id: `mem_rr_${session.id}_a`, characterId: aId, counterpartId: bId,
      sourceApp: "chat", type: "long_term", content: summary, importance: 0.7,
      createdAt: now, updatedAt: now, metadata: { origin: "role_chat", sessionId: session.id },
    });
    await saveMemoryEntry({
      id: `mem_rr_${session.id}_b`, characterId: bId, counterpartId: aId,
      sourceApp: "chat", type: "long_term", content: summaryB, importance: 0.7,
      createdAt: now, updatedAt: now, metadata: { origin: "role_chat", sessionId: session.id },
    });
  } catch { /* 记忆失败不影响聊天落盘 */ }

  return { sessionId: session.id, title: `${a.name}与${b.name}的聊天记录`, turns };
}

/** 往用户会话里推一条“系统消息”入口：显示为双方聊天记录卡，点击进专属只读页。 */
export function pushRoleChatEntry(hostSessionId: string, roleSessionId: string, title: string, aId: string, bId: string): void {
  pushChatMessage({
    sessionId: hostSessionId,
    role: "assistant",
    content: title,
    mediaType: "role_chat_record",
    mediaData: {
      roleChatSessionId: roleSessionId,
      roleChatTitle: title,
      roleChatAId: aId,
      roleChatBId: bId,
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
