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
import type { ListenTogetherSession, ListenTogetherTrack } from "./listen-together-types";

type ResolvedListenGeneration = {
  character: Character;
  apiConfig: ApiConfig;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  messages: LLMMessage[];
  userName: string;
};

async function resolveListenGeneration(
  characterId: string,
  extraSystem: string,
): Promise<ResolvedListenGeneration> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) throw new ChatEngineError("找不到一起听的角色。");

  const bindings = loadBindingConfig();
  const slot = resolveBinding(bindings, character.id, "music");
  if (!slot.apiConfigId) {
    throw new ChatEngineError(`未给「音乐」绑定 ${character.name} 的 API 配置。`);
  }
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

  const userIdentity = resolveUserIdentity(character.id, "music");
  const prepared = prepareShortTermContext(character.id, "music", { history: [] });
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
    appId: "music",
    appTags: ["music", "listen_together"],
    longTermMemories: formatLongTermMemories(memories),
    coreMemories: formatCoreMemories(coreMemories),
    worldBookActivationContext: prepared.wbActivationContext,
    recentBlocks: prepared.recentBlocks,
    unifiedRecentItems: prepared.unifiedRecentItems,
  });
  messages.push({ role: "system", content: extraSystem });

  return {
    character,
    apiConfig,
    preset,
    regexes,
    messages,
    userName: userIdentity?.name ?? "用户",
  };
}

function formatTrackLine(track?: ListenTogetherTrack): string {
  if (!track) return "还没有在播的歌";
  return `《${track.title}》${track.artist ? ` - ${track.artist}` : ""}`;
}

function stripReply(raw: string): string {
  return raw.replace(/```[\s\S]*?```/g, "").replace(/^\s*["「]|["」]\s*$/g, "").trim();
}

export async function generateListenTogetherReply(input: {
  characterId: string;
  session: ListenTogetherSession;
  userText?: string;
  currentTrack?: ListenTogetherTrack;
  opening?: boolean;
}): Promise<string> {
  const current = input.currentTrack || input.session.tracks[input.session.tracks.length - 1];
  const recent = input.session.messages.slice(-8).map(item => (
    `${item.author === "user" ? "用户" : input.session.characterName}：${item.text}`
  )).join("\n");
  const resolved = await resolveListenGeneration(
    input.characterId,
    [
      "【一起听】",
      "你们正在同一首歌里听歌聊天，像网易云一起听那样随口说话。",
      "只回一两句，像发消息，不要列点，不要复述整首歌。",
      input.opening
        ? "用户刚邀请你一起听。先应一声，可以提一句正在放的歌。"
        : "用户刚发了一句，按人设接着聊。",
      "",
      `正在听：${formatTrackLine(current)}`,
      input.session.tracks.length > 1 ? `这轮听过：${input.session.tracks.map(item => item.title).join("、")}` : "",
      recent ? `刚才的对话：\n${recent}` : "",
      input.userText ? `用户说：${input.userText}` : "",
    ].filter(Boolean).join("\n"),
  );
  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `一起听:${resolved.character.name}`, userName: resolved.userName },
    { appId: "music", appTags: ["music", "listen_together"] },
  );
  const text = stripReply(raw);
  if (!text) throw new ChatEngineError("对方这句没有发出去。");
  return text.slice(0, 160);
}
