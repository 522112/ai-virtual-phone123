// lib/reverse-watch-engine.ts — 反查岗：怀疑值判定 + 人设容忍度 + 查岗发难生成

import { loadCharacters } from "./character-storage";
import { ChatEngineError, sendLLMRequest } from "./chat-engine";
import { assemblePromptPayload, type LLMMessage } from "./llm-prompt-assembler";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import {
  loadApiConfigs,
  loadBindingConfig,
  loadPresets,
  loadRegexes,
  loadWorldBooks,
  resolveBinding,
  resolveUserIdentity,
} from "./settings-storage";
import type { ApiConfig, PresetConfig, RegexConfig, WorldBookConfig } from "./settings-types";
import { prepareShortTermContext } from "./short-term-assembler";
import type { Character } from "./character-types";

type Resolved = {
  character: Character;
  apiConfig: ApiConfig;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  messages: LLMMessage[];
  userName: string;
};

async function resolveReverseWatchGeneration(characterId: string, extraSystem: string): Promise<Resolved> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) throw new ChatEngineError("找不到反查岗的角色。");

  const bindings = loadBindingConfig();
  const slot = resolveBinding(bindings, character.id, "chat");
  if (!slot.apiConfigId) throw new ChatEngineError(`未给「聊天」绑定 ${character.name} 的 API 配置。`);
  const apiConfig = loadApiConfigs().find(item => item.id === slot.apiConfigId);
  if (!apiConfig) throw new ChatEngineError(`找不到 ${character.name} 的 API 配置。`);

  const presets = loadPresets();
  let preset = slot.presetId ? presets.find(item => item.id === slot.presetId) ?? null : null;
  if (!preset) preset = presets.find(item => item.builtIn) ?? null;

  const allWorldBooks = loadWorldBooks();
  const worldBooks = (slot.worldBookIds || [])
    .map(id => allWorldBooks.find(item => item.id === id))
    .filter(Boolean) as WorldBookConfig[];
  const allRegexes = loadRegexes();
  const regexes = (slot.regexIds || [])
    .map(id => allRegexes.find(item => item.id === id))
    .filter(Boolean) as RegexConfig[];

  const userIdentity = resolveUserIdentity(character.id, "chat");
  const prepared = prepareShortTermContext(character.id, "chat", { history: [] });
  const memConfig = loadMemoryConfig();
  const [memories, coreMemories] = await Promise.all([
    retrieveMemoriesForPrompt(character.id, prepared.wbActivationContext, memConfig).catch(() => []),
    retrieveCoreMemoriesForPrompt(character.id, memConfig).catch(() => []),
  ]);

  const messages = assemblePromptPayload({
    character,
    history: [],
    preset,
    worldBooks,
    regexes,
    userIdentity,
    appId: "chat",
    appTags: ["chat", "reverse_watch"],
    longTermMemories: formatLongTermMemories(memories),
    coreMemories: formatCoreMemories(coreMemories),
    worldBookActivationContext: prepared.wbActivationContext,
    recentBlocks: prepared.recentBlocks,
    unifiedRecentItems: prepared.unifiedRecentItems,
  });
  messages.push({ role: "system", content: extraSystem });

  return { character, apiConfig, preset, regexes, messages, userName: userIdentity?.name ?? "用户" };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 依据人设判定一次"容忍度"（0-100，越高越难被激怒）。
 */
export async function judgePersonaTolerance(characterId: string): Promise<number | null> {
  try {
    const resolved = await resolveReverseWatchGeneration(
      characterId,
      [
        "【任务】只输出一个 JSON，不要任何多余文字。",
        "根据这个人设，判断他在亲密关系里对伴侣的容忍度。",
        "tolerance 取 0-100 的整数：0 表示一点风吹草动就疑神疑鬼、容易炸；100 表示极度信任、几乎不怀疑。",
        "格式：{\"tolerance\": 数字, \"reason\": \"一句话理由\"}",
      ].join("\n"),
    );
    const raw = await sendLLMRequest(
      resolved.apiConfig,
      resolved.preset,
      resolved.messages,
      resolved.regexes,
      { characterName: `反查岗:${resolved.character.name}`, userName: resolved.userName },
      { appId: "chat", appTags: ["chat", "reverse_watch"] },
    );
    const parsed = extractJsonObject(raw);
    const value = Number(parsed?.tolerance);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
    return null;
  } catch {
    return null;
  }
}

export type SuspicionJudgement = { delta: number; reason: string };

/**
 * 依据用户最新的发言 + 人设，判定怀疑值增减（-15 ~ +25）。
 */
export async function judgeUserMessageSuspicion(input: {
  characterId: string;
  characterName: string;
  userText: string;
  recent?: string;
}): Promise<SuspicionJudgement> {
  try {
    const resolved = await resolveReverseWatchGeneration(
      input.characterId,
      [
        "【任务】只输出一个 JSON，不要任何多余文字。",
        "你正在判断「用户的这句话」让你（按人设）产生了多少怀疑，用于累计一个怀疑值（0-100，到90你就会去查对方的手机）。",
        "delta 取 -15 到 25 的整数：正常、坦诚、亲密的话给小值或负数；闪烁其词、前后矛盾、提到不明人物、冷淡敷衍、深夜失联、暧昧的语气给较大正值。",
        "格式：{\"delta\": 数字, \"reason\": \"一句话理由\"}",
        input.recent ? `最近对话：\n${input.recent}` : "",
        `用户最新一句：${input.userText}`,
      ].filter(Boolean).join("\n"),
    );
    const raw = await sendLLMRequest(
      resolved.apiConfig,
      resolved.preset,
      resolved.messages,
      resolved.regexes,
      { characterName: `反查岗判定:${resolved.character.name}`, userName: resolved.userName },
      { appId: "chat", appTags: ["chat", "reverse_watch"] },
    );
    const parsed = extractJsonObject(raw);
    const value = Number(parsed?.delta);
    if (Number.isFinite(value)) {
      return { delta: Math.max(-15, Math.min(25, Math.round(value))), reason: String(parsed?.reason || "聊天判定").slice(0, 120) };
    }
    return { delta: 0, reason: "无法判定" };
  } catch {
    return { delta: 0, reason: "判定失败" };
  }
}

/**
 * 怀疑值触发后，生成角色"发难/查岗"的开场白（会作为聊天消息）。
 */
export async function generateCheckPostOpener(input: {
  characterId: string;
  characterName: string;
  suspicion: number;
  findings: string;
}): Promise<string> {
  const resolved = await resolveReverseWatchGeneration(
    input.characterId,
    [
      "【反查岗触发】",
      `你对用户的怀疑值已经达到 ${input.suspicion}，你忍不住去翻了对方的手机。`,
      "下面是你翻到的线索：",
      input.findings,
      "",
      "按你的人设发难：可以质问、讽刺、示弱、翻旧账，情绪和用词完全贴合人设，长短随人设。",
      "直接说给用户听，不要罗列线索清单，不要解释你在查手机（除非人设就是想摊牌），也不要输出任何标记或括号说明。",
    ].join("\n"),
  );
  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `反查岗:${resolved.character.name}`, userName: resolved.userName },
    { appId: "chat", appTags: ["chat", "reverse_watch"] },
  );
  const text = raw.replace(/```[\s\S]*?```/g, "").replace(/^\s*["「]|["」]\s*$/g, "").trim();
  if (!text) throw new ChatEngineError("反查岗这句没有生成出来。");
  return text;
}
