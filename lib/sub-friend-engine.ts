import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import {
  addChatContact,
  loadChatSessions,
  pushChatMessage,
  saveChatSessions,
  type ChatSession,
} from "./chat-storage";
import { getUserSubAccount } from "./sub-accounts";
import { loadApiConfigs } from "./settings-storage";

/**
 * 小号加角色微信：按微信号找到角色，角色按人设+验证消息决定是否通过。
 * 角色只看到小号资料，绝不知道是用户本人。
 */
export async function requestSubFriend(
  subId: string,
  targetWechatId: string,
  verifyMessage: string,
): Promise<{ accepted: boolean; reply: string; sessionId?: string }> {
  const sub = getUserSubAccount(subId);
  if (!sub) throw new Error("小号不存在");
  const target = targetWechatId.trim();
  if (!target) throw new Error("请输入对方微信号");
  const character = loadCharacters().find(c => (c.wechatID || "").trim().toLowerCase() === target.toLowerCase());
  if (!character) throw new Error("没有找到这个微信号对应的角色");

  const configs = loadApiConfigs();
  const apiConfig = configs.find(c => c.apiKey) || configs[0];
  if (!apiConfig) throw new Error("还没有可用的 API 配置");

  const raw = await sendLLMRequest(
    apiConfig,
    null,
    [
      { role: "system", content: `你是${character.name}。人设：${(character.persona || "").slice(0, 1000)}` },
      {
        role: "user",
        content: `有个陌生人请求加你微信。对方资料——网名：${sub.name}；微信号：${sub.wechatId}；自我介绍：${sub.persona || "（无）"}；验证消息：「${verifyMessage.slice(0, 200)}」。\n按你的人设决定：通过还是拒绝？你对陌生人什么态度？验证消息有没有打动你？\n只输出 JSON：{"accept":true|false,"reply":"给对方的一句话（通过就是打招呼，拒绝就是理由，不超过40字）"}`,
      },
    ],
    [],
    { characterName: character.name, userName: sub.name },
    { appId: "sub-friend", appTags: ["sub-friend"] },
  );
  let accept = false;
  let reply = "对方没有回应";
  try {
    const parsed = JSON.parse(String(raw).replace(/```[\s\S]*?```/g, "").match(/\{[\s\S]*\}/)?.[0] || "{}") as { accept?: boolean; reply?: string };
    accept = parsed.accept === true;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) reply = parsed.reply.trim().slice(0, 80);
  } catch { /* keep defaults */ }

  if (!accept) {
    return { accepted: false, reply };
  }

  addChatContact(character.id);
  const sessions = loadChatSessions();
  let session = sessions.find(s => s.contactId === character.id && s.subId === sub.id && !s.isGroup);
  if (!session) {
    session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      contactId: character.id,
      subId: sub.id,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
      isPinned: false,
    } as ChatSession;
    sessions.unshift(session);
    saveChatSessions(sessions);
  }
  pushChatMessage({
    sessionId: session.id,
    role: "system",
    content: `[${sub.name} 通过微信号添加了你，验证消息：「${verifyMessage.slice(0, 100)}」]`,
    status: "sent",
  });
  pushChatMessage({
    sessionId: session.id,
    role: "assistant",
    content: reply,
    status: "sent",
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    window.dispatchEvent(new CustomEvent("weixin-messages-updated"));
  }
  return { accepted: true, reply, sessionId: session.id };
}
