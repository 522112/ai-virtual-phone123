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
import { parseChatBubbleDisplay, sanitizeListenTogetherText } from "./chat-message-display";
import { getCharacterFavorites } from "./music-favorites-storage";

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
  | { kind: "end" }
  | { kind: "refuse" };

export type ListenTogetherReply = {
  text: string;
  actions: ListenTogetherAction[];
};

export function splitListenTogetherBubbles(text: string, knownNames: string[] = []): string[] {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const parts = normalized.split(/\n\n+/).map(item => item.trim()).filter(Boolean);
  const source = parts.length ? parts : [normalized];
  return source.map(part => {
    const cleaned = sanitizeListenTogetherText(part, knownNames);
    const parsed = parseChatBubbleDisplay(part, knownNames);
    if (parsed.whisper && cleaned) return `【私聊】\n${cleaned}`;
    return cleaned;
  }).filter(Boolean);
}

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
  text = text.replace(/\[(?:执行动作:)?拒绝一起听(?:\((?:\{\})?\))?\]/g, () => {
    actions.push({ kind: "refuse" });
    return "";
  });

  text = text.replace(/```[\s\S]*?```/g, "").replace(/^\s*["「]|["」]\s*$/g, "").trim();
  return { text, actions };
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
  const selfFav = getCharacterFavorites(input.characterId, input.session.characterName);
  const favLine = selfFav.songs.length > 0
    ? `你有一个自己的歌单「${selfFav.name}」，里面有：${selfFav.songs.slice(0, 20).map(item => `《${item.title}》`).join("、")}。想放自己歌单里的歌时，用 [执行动作:播放音乐({"query":"歌名"})]；放不放、放哪首完全按你的人设和心情决定，不必每句都放。`
    : "";
  const resolved = await resolveListenGeneration(
    input.characterId,
    [
      "【一起听】",
      "你们正在同一首歌里听歌聊天，像网易云一起听那样随口说话。",
      "按人设回，长短随人设，不要固定字数，不要凑字数，也不要写成一整段小作文。",
      "【输出格式】气泡里只能出现聊天正文。不要注释、说明、括号备注、标题、复述提示词，也不要写角色名：或用户说：。",
      "一条气泡说完一件事。多句就空一行，系统会拆成多条消息。",
      "若要私聊，【私聊】单独占一行，下一行再写正文。",
      "你听得见正在放的歌词，但要像这个人正在听歌：可以走神、接话、吐槽、哼一句，也可以聊别的。不必句句围着歌转。",
      input.opening
        ? "用户刚邀请你一起听。按人设决定接不接。想听就应一声，可以提一句正在放的歌。不想听就拒绝，并写一句符合人设的理由（可自拟当下的原因，比如在忙、困了、不喜欢这首、要出门），同时输出 [执行动作:拒绝一起听]。"
        : input.trackChanged
          ? "歌切了。若人设会接一句就接，不想说可以只回很短的一声，或输出动作不闲聊。"
          : "用户刚发了一句，按人设接着聊。",
      "",
      `正在听：${formatTrackLine(current)}`,
      lyricBit ? `此刻歌词大概是：${lyricBit}` : "",
      input.session.tracks.length > 1 ? `这轮听过：${input.session.tracks.map(item => item.title).join("、")}` : "",
      favLine,
      recent ? `刚才的对话：\n${recent}` : "",
      input.userText ? `用户说：${input.userText}` : "",
      "",
      "若人设此刻想换歌、搜自己想听的、结束一起听，或刚被邀请时要拒绝，可在回复里单独输出（可与闲聊并存）：",
      '[执行动作:播放音乐({"query":"歌名"})]',
      '[执行动作:切换音乐({"action":"next"})] 或 prev',
      "[执行动作:结束一起听]",
      "[执行动作:拒绝一起听]",
      "动作标记单独一行，不要写进气泡，也不要向用户解释这些标记。",
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
  const knownNames = [resolved.character.name, resolved.userName, "我", "用户"];
  parsed.text = splitListenTogetherBubbles(parsed.text, knownNames).join("\n\n");
  if (!parsed.text && parsed.actions.length === 0) throw new ChatEngineError("对方这句没有发出去。");
  return parsed;
}
