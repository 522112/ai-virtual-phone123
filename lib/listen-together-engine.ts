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

export type ListenTogetherAction =
  | { kind: "play"; query: string }
  | { kind: "skip"; action: "next" | "prev" }
  | { kind: "end" };

export type ListenTogetherReply = {
  text: string;
  actions: ListenTogetherAction[];
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

  const userIdentity = resolveUserIdentity(character.id, "chat");
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

export function excerptLyrics(lyrics: string | undefined, currentTime = 0): string {
  const raw = (lyrics || "").trim();
  if (!raw) return "";
  const timed: { time: number; text: string }[] = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (match) {
      timed.push({
        time: parseInt(match[1], 10) * 60 + parseFloat(match[2]),
        text: match[3].trim(),
      });
    }
  }
  if (timed.length > 0) {
    timed.sort((a, b) => a.time - b.time);
    let idx = 0;
    for (let i = timed.length - 1; i >= 0; i -= 1) {
      if (currentTime >= timed[i].time) {
        idx = i;
        break;
      }
    }
    const start = Math.max(0, idx - 2);
    const slice = timed.slice(start, start + 6).map(item => item.text).filter(Boolean);
    return slice.join(" / ").slice(0, 180);
  }
  return raw.split("\n").map(line => line.trim()).filter(Boolean).slice(0, 4).join(" / ").slice(0, 180);
}

export function parseListenTogetherActions(raw: string): ListenTogetherReply {
  const actions: ListenTogetherAction[] = [];
  let text = raw;

  text = text.replace(/\[执行动作:播放音乐\((\{[\s\S]*?\})\)\]/g, (_whole, json: string) => {
    try {
      const parsed = JSON.parse(json) as { query?: string };
      if (parsed.query?.trim()) actions.push({ kind: "play", query: parsed.query.trim() });
    } catch { /* ignore */ }
    return "";
  });
  text = text.replace(/\[执行动作:搜索音乐\((\{[\s\S]*?\})\)\]/g, (_whole, json: string) => {
    try {
      const parsed = JSON.parse(json) as { query?: string };
      if (parsed.query?.trim()) actions.push({ kind: "play", query: parsed.query.trim() });
    } catch { /* ignore */ }
    return "";
  });
  text = text.replace(/\[执行动作:切换音乐\((\{[\s\S]*?\})\)\]/g, (_whole, json: string) => {
    try {
      const parsed = JSON.parse(json) as { action?: string };
      actions.push({ kind: "skip", action: parsed.action === "prev" ? "prev" : "next" });
    } catch {
      actions.push({ kind: "skip", action: "next" });
    }
    return "";
  });
  text = text.replace(/\[(?:执行动作:)?结束一起听(?:\((?:\{\})?\))?\]/g, () => {
    actions.push({ kind: "end" });
    return "";
  });

  text = text.replace(/```[\s\S]*?```/g, "").replace(/^\s*["「]|["」]\s*$/g, "").trim();
  return { text: text.slice(0, 160), actions };
}

export async function generateListenTogetherReply(input: {
  characterId: string;
  session: ListenTogetherSession;
  userText?: string;
  currentTrack?: ListenTogetherTrack;
  lyrics?: string;
  currentTime?: number;
  opening?: boolean;
  trackChanged?: boolean;
}): Promise<ListenTogetherReply> {
  const current = input.currentTrack || input.session.tracks[input.session.tracks.length - 1];
  const recent = input.session.messages.slice(-8).map(item => (
    `${item.author === "user" ? "用户" : input.session.characterName}：${item.text}`
  )).join("\n");
  const lyricBit = excerptLyrics(input.lyrics, input.currentTime);
  const resolved = await resolveListenGeneration(
    input.characterId,
    [
      "【一起听】",
      "你们正在同一首歌里听歌聊天，像网易云一起听那样随口说话。",
      "只回一两句，像发消息，不要列点，不要复述整首歌。",
      "你听得见正在放的歌词，但要像这个人正在听歌：可以走神、接话、吐槽、哼一句，也可以聊别的。不必句句围着歌转。",
      input.opening
        ? "用户刚邀请你一起听。先应一声，可以提一句正在放的歌。"
        : input.trackChanged
          ? "歌切了。若人设会接一句就接，不想说可以只回很短的一声，或输出动作不闲聊。"
          : "用户刚发了一句，按人设接着聊。",
      "",
      `正在听：${formatTrackLine(current)}`,
      lyricBit ? `此刻歌词大概是：${lyricBit}` : "",
      input.session.tracks.length > 1 ? `这轮听过：${input.session.tracks.map(item => item.title).join("、")}` : "",
      recent ? `刚才的对话：\n${recent}` : "",
      input.userText ? `用户说：${input.userText}` : "",
      "",
      "若人设此刻想换歌、搜自己想听的、或结束一起听，可在回复里单独输出（可与闲聊并存）：",
      '[执行动作:播放音乐({"query":"歌名"})]',
      '[执行动作:切换音乐({"action":"next"})] 或 prev',
      "[执行动作:结束一起听]",
      "不要向用户解释这些标记。",
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
  const parsed = parseListenTogetherActions(raw);
  if (!parsed.text && parsed.actions.length === 0) throw new ChatEngineError("对方这句没有发出去。");
  return parsed;
}
