import { useEffect, useState } from "react";
import { loadCharacters } from "./character-storage";
import { pushChatMessage } from "./chat-storage";
import { sendLLMRequest } from "./chat-engine";
import { loadApiConfigs } from "./settings-storage";
import { createCharacterSubAccount } from "./sub-accounts";
import { findBestResourceImage, resourceDisplayUrl } from "./resource-library";
import { generateGodViewDialog } from "./god-view";

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
 * 给角色推荐好友名片：角色按人设决定加不加；
 * 通过后生成一段双方聊天，放进上帝视角（双方都不知情）。
 */
export async function recommendCardToCharacter(
  hostCharacterId: string,
  guestCharacterId: string,
  sessionId: string,
): Promise<{ accepted: boolean; reply: string }> {
  const host = loadCharacters().find(c => c.id === hostCharacterId);
  const guest = loadCharacters().find(c => c.id === guestCharacterId);
  if (!host || !guest) throw new Error("角色不存在");
  const configs = loadApiConfigs();
  const apiConfig = configs.find(c => c.apiKey) || configs[0];
  if (!apiConfig) throw new Error("还没有可用的 API 配置");

  pushChatMessage({
    sessionId,
    role: "user",
    content: `[向你推荐了一张好友名片：${guest.name}]`,
    status: "sent",
  });

  const raw = await sendLLMRequest(
    apiConfig,
    null,
    [
      { role: "system", content: `你是${host.name}。人设：${(host.persona || "").slice(0, 1000)}` },
      {
        role: "user",
        content: `有人给你推荐了一张好友名片：${guest.name}（人设：${(guest.persona || "").slice(0, 500)}）。\n按你的人设决定：加不加这个好友？感兴趣就加，没兴趣就拒绝。\n只输出 JSON：{"accept":true|false,"reply":"你对推荐人的回应，不超过40字","topic":"如果加了，你想先和TA聊什么话题，不超过30字"}`,
      },
    ],
    [],
    { characterName: host.name },
    { appId: "recommend-card", appTags: ["recommend-card"] },
  );
  let accept = false;
  let reply = "TA 没有回应";
  let topic = "随便聊聊";
  try {
    const parsed = JSON.parse(String(raw).replace(/```[\s\S]*?```/g, "").match(/\{[\s\S]*\}/)?.[0] || "{}") as { accept?: boolean; reply?: string; topic?: string };
    accept = parsed.accept === true;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) reply = parsed.reply.trim().slice(0, 80);
    if (typeof parsed.topic === "string" && parsed.topic.trim()) topic = parsed.topic.trim().slice(0, 40);
  } catch { /* ignore */ }

  pushChatMessage({
    sessionId,
    role: "assistant",
    content: reply,
    status: "sent",
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
  }
  if (accept) {
    try {
      await generateGodViewDialog(hostCharacterId, guestCharacterId, topic);
    } catch { /* 上帝视角生成失败不影响加好友结果 */ }
  }
  return { accepted: accept, reply };
}
