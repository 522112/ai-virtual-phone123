import { useEffect, useState } from "react";
import { loadCharacters } from "./character-storage";
import { pushChatMessage } from "./chat-storage";
import { sendLLMRequest } from "./chat-engine";
import { loadApiConfigs } from "./settings-storage";
import { createCharacterSubAccount } from "./sub-accounts";
import { findBestResourceImage, resourceDisplayUrl } from "./resource-library";

/**
 * 角色小号：由主人格按人设决定开不开、叫什么、网上是什么人设；
 * 头像优先从资源库按网名/人设模糊找最相关的。
 */
export async function suggestCharacterSub(characterId: string): Promise<{ name: string; persona: string; avatar: string | null }> {
  const character = loadCharacters().find(c => c.id === characterId);
  if (!character) throw new Error("角色不存在");
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
        content: "你在网上有个小号（只有亲近的人知道）。按你的人设，这个小号叫什么网名？网上立的是什么人设（一句话）？\n只输出 JSON：{\"name\":\"网名2-10字\",\"persona\":\"网络人设一句话\"}",
      },
    ],
    [],
    { characterName: character.name },
    { appId: "character-sub", appTags: ["character-sub"] },
  );
  let name = "";
  let persona = "";
  try {
    const parsed = JSON.parse(String(raw).replace(/```[\s\S]*?```/g, "").match(/\{[\s\S]*\}/)?.[0] || "{}") as { name?: string; persona?: string };
    name = String(parsed.name || "").trim().slice(0, 10);
    persona = String(parsed.persona || "").trim().slice(0, 200);
  } catch { /* ignore */ }
  if (!name) throw new Error("TA 暂时不想开小号");
  const hit = findBestResourceImage(characterId, `${name} ${persona} 头像`);
  return { name, persona, avatar: hit ? resourceDisplayUrl(hit) : null };
}

export async function createCharacterSubByPersona(characterId: string) {
  const suggested = await suggestCharacterSub(characterId);
  return createCharacterSubAccount({ characterId, ...suggested });
}

/**
 * 给角色推荐好友名片：不需要对方同意，默认双方直接聊上；
 * 名片发出后生成双方私聊（人设决定谁先开口），用户会话里留系统消息入口进上帝视角。
 */
export async function recommendCardToCharacter(
  hostCharacterId: string,
  guestCharacterId: string,
  sessionId: string,
): Promise<{ accepted: boolean; reply: string }> {
  const host = loadCharacters().find(c => c.id === hostCharacterId);
  const guest = loadCharacters().find(c => c.id === guestCharacterId);
  if (!host || !guest) throw new Error("角色不存在");

  pushChatMessage({
    sessionId,
    role: "user",
    content: `[向你推荐了一张好友名片：${guest.name}]`,
    mediaType: "contact_card",
    mediaData: { contactCardName: guest.name, label: guest.name },
    status: "sent",
  });

  const topic = "刚加了好友，随便聊聊";
  const reply = `已把${guest.name}推给${host.name}，他们直接聊上了`;
  pushChatMessage({
    sessionId,
    role: "assistant",
    content: reply,
    status: "sent",
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
  }
  try {
    // 角色互聊：人设决定谁先开口，落专属会话+双方记忆，用户会话里留系统消息入口
    const { generateRoleRoleDialog, pushRoleChatEntry } = await import("./role-chat");
    const dialog = await generateRoleRoleDialog(hostCharacterId, guestCharacterId, topic);
    pushRoleChatEntry(sessionId, dialog.sessionId, dialog.title, hostCharacterId, guestCharacterId);
  } catch { /* 互聊生成失败不影响推荐结果 */ }
  return { accepted: true, reply };
}
