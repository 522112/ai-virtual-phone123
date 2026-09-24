import { ChatEngineError, sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import {
  estimateDouyinStatsFromPersona,
  resolveCharacterDouyinDisplayName,
  resolveCharacterDouyinPersona,
} from "./douyin-character-profile";
import {
  recordDouyinLiveHostEvent,
  recordDouyinLiveInteractEvent,
  recordDouyinPublishEvent,
} from "./douyin-memory";
import { pickRandomDouyinNpcPortraits } from "./douyin-npc-library";
import {
  DOUYIN_TONES,
  addDouyinGift,
  addDouyinLiveRoom,
  appendDouyinDanmaku,
  appendDouyinDanmakuBatch,
  bumpDouyinPkScore,
  loadDouyinState,
  makeDouyinId,
  publishDouyinVideo,
  replaceDouyinNpcLiveRooms,
  startDouyinPk,
  updateDouyinLiveRoom,
  upsertDouyinAuthor,
} from "./douyin-storage";
import {
  DEFAULT_DOUYIN_AUDIENCE_DANMAKU_PROMPT,
  DEFAULT_DOUYIN_CHARACTER_ACTIVITY_PROMPT,
  DEFAULT_DOUYIN_CHARACTER_LIVE_PROMPT,
  DEFAULT_DOUYIN_NPC_LIVE_PROMPT,
  type DouyinAuthor,
  type DouyinComment,
  type DouyinLiveRoom,
  type DouyinNpcPortrait,
  type DouyinVideo,
  type ParsedDouyinAudienceDanmaku,
  type ParsedDouyinCharacterActivity,
  type ParsedDouyinCharacterLive,
  type ParsedDouyinNpcLiveHost,
} from "./douyin-types";
import { assemblePromptPayload, type AssemblerInput } from "./llm-prompt-assembler";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { prepareShortTermContext } from "./short-term-assembler";
import {
  loadApiConfigs,
  loadBindingConfig,
  loadPresets,
  loadRegexes,
  loadWorldBooks,
  resolveBinding,
  resolveUserIdentity,
} from "./settings-storage";
import type { ApiConfig, PresetConfig, RegexConfig } from "./settings-types";

type ParsedBlock = {
  title: string;
  number: number;
  fields: Record<string, string>;
};

type AssemblerResult = {
  character: Character;
  apiConfig: ApiConfig | null;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  input: AssemblerInput;
};

export class DouyinGenerationError extends Error {
  raw?: string;
  constructor(message: string, raw?: string, causeMessage?: string) {
    super(causeMessage ? `${message}（${causeMessage}）` : message);
    this.name = "DouyinGenerationError";
    this.raw = raw;
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function cleanMultiline(value: unknown, maxLength: number): string {
  return cleanText(value, maxLength).replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
}

function parseMetric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const text = String(value ?? "").trim().replace(/[,，\s]/g, "");
  if (!text) return 0;
  const tenThousand = /^(-?\d+(?:\.\d+)?)[wW万]/.exec(text);
  if (tenThousand) return Math.max(0, Math.round(Number(tenThousand[1]) * 10000));
  const thousand = /^(-?\d+(?:\.\d+)?)[kK千]/.exec(text);
  if (thousand) return Math.max(0, Math.round(Number(thousand[1]) * 1000));
  const numeric = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function parseBoolean(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return ["是", "yes", "true", "1", "y"].includes(text);
}

function stripFences(text: string): string {
  return text.replace(/^```(?:text|json|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;
  for (const rawLine of stripFences(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const blockMatch = /^#\s*([^\d#\[]+?)(\d+)?\s*$/.exec(line);
    if (blockMatch) {
      if (current) blocks.push(current);
      current = { title: cleanText(blockMatch[1], 40), number: Number(blockMatch[2] || "1"), fields: {} };
      continue;
    }
    const fieldMatch = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (fieldMatch) {
      if (!current) current = { title: "块", number: 1, fields: {} };
      current.fields[cleanText(fieldMatch[1], 40)] = fieldMatch[2] ?? "";
      continue;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseWithDebug<T>(raw: string, parser: (output: string) => T, fallbackMessage: string): T {
  try {
    return parser(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    throw new DouyinGenerationError(fallbackMessage, raw, message);
  }
}

function resolveGlobalApiConfig(): ApiConfig | null {
  const configs = loadApiConfigs();
  const binding = loadBindingConfig();
  if (binding.globalDefaults.apiConfigId) {
    return configs.find(config => config.id === binding.globalDefaults.apiConfigId) ?? null;
  }
  return configs[0] ?? null;
}

async function resolveCharacterAssemblerInput(
  characterId: string,
  appTags: string[],
  context: { feedContext?: string; liveContext?: string },
): Promise<AssemblerResult | null> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) return null;
  const bindings = loadBindingConfig();
  const activeSlot = resolveBinding(bindings, characterId, "douyin");
  const apiConfig = activeSlot.apiConfigId
    ? loadApiConfigs().find(config => config.id === activeSlot.apiConfigId) ?? null
    : null;
  const presets = loadPresets();
  let preset = activeSlot.presetId ? presets.find(item => item.id === activeSlot.presetId) ?? null : null;
  if (!preset) preset = presets.find(item => item.builtIn) ?? null;
  const worldBooks = (activeSlot.worldBookIds || [])
    .map(id => loadWorldBooks().find(book => book.id === id))
    .filter(Boolean) as ReturnType<typeof loadWorldBooks>;
  const regexes = (activeSlot.regexIds || [])
    .map(id => loadRegexes().find(regex => regex.id === id))
    .filter(Boolean) as RegexConfig[];
  const userIdentity = resolveUserIdentity(characterId, "chat");
  const prepared = prepareShortTermContext(characterId, "douyin");
  const memConfig = loadMemoryConfig();
  const [memories, coreMemories] = await Promise.all([
    retrieveMemoriesForPrompt(characterId, prepared.wbActivationContext, memConfig).catch(() => []),
    retrieveCoreMemoriesForPrompt(characterId, memConfig).catch(() => []),
  ]);
  const input: AssemblerInput = {
    character,
    history: [],
    preset,
    worldBooks,
    regexes,
    userIdentity,
    appId: "douyin",
    appTags,
    longTermMemories: formatLongTermMemories(memories),
    coreMemories: formatCoreMemories(coreMemories),
    worldBookActivationContext: prepared.wbActivationContext,
    recentBlocks: prepared.recentBlocks,
    unifiedRecentItems: prepared.unifiedRecentItems,
    douyinFeedContext: context.feedContext ?? "",
    douyinLiveContext: context.liveContext ?? "",
  };
  return { character, apiConfig, preset, regexes, input };
}

export function parseDouyinNpcLiveHosts(raw: string): ParsedDouyinNpcLiveHost[] {
  return parseBlocks(raw)
    .filter(block => /主播|直播/.test(block.title))
    .map(block => ({
      name: cleanText(block.fields["昵称"] ?? block.fields["名字"], 40) || "路人主播",
      handle: cleanText(block.fields["抖音号"] ?? block.fields["账号"], 40) || `npc_${Math.random().toString(36).slice(2, 7)}`,
      title: cleanText(block.fields["标题"], 80) || "随便聊聊",
      persona: cleanMultiline(block.fields["人设"] ?? block.fields["简介"], 200) || "日常直播",
      viewers: parseMetric(block.fields["观看"] ?? block.fields["人数"]) || 120 + Math.floor(Math.random() * 3000),
      coverTone: cleanText(block.fields["封面色"], 20) || "#1a1a2e",
      hostTone: cleanText(block.fields["头像色"], 20) || DOUYIN_TONES[Math.floor(Math.random() * DOUYIN_TONES.length)],
      speak: cleanMultiline(block.fields["开场"] ?? block.fields["讲话"], 160) || undefined,
    }))
    .filter(item => item.name && item.title);
}

export function parseDouyinAudienceDanmaku(raw: string, count = 15): ParsedDouyinAudienceDanmaku {
  const blocks = parseBlocks(raw);
  const topFields = blocks[0]?.fields || {};
  const fieldLines = stripFences(raw).split(/\r?\n/).map(line => line.trim());
  let viewers: number | undefined;
  for (const line of fieldLines) {
    const match = /^\[观看\]\s*(.+)$/.exec(line);
    if (match) {
      viewers = parseMetric(match[1]);
      break;
    }
  }
  if (viewers === undefined && topFields["观看"]) viewers = parseMetric(topFields["观看"]);
  const items = blocks
    .filter(block => /弹幕/.test(block.title))
    .map(block => ({
      authorName: cleanText(block.fields["作者"] ?? block.fields["昵称"], 40) || "观众",
      text: cleanMultiline(block.fields["内容"] ?? block.fields["弹幕"], 80),
    }))
    .filter(item => item.text)
    .slice(0, count);
  return { viewers, items };
}

export function parseDouyinCharacterActivity(raw: string): ParsedDouyinCharacterActivity {
  const block = parseBlocks(raw).find(item => /动态|发帖|视频|作品/.test(item.title)) ?? parseBlocks(raw)[0];
  if (!block) return { shouldPublish: false, reason: "无法解析" };
  const shouldPublish = parseBoolean(block.fields["发布"] ?? block.fields["是否发布"] ?? "否");
  const comments: Array<{ authorName: string; text: string }> = [];
  for (let i = 1; i <= 8; i++) {
    const authorName = cleanText(block.fields[`评论${i}作者`], 40);
    const text = cleanMultiline(block.fields[`评论${i}内容`], 120);
    if (authorName && text) comments.push({ authorName, text });
  }
  return {
    shouldPublish,
    caption: cleanMultiline(block.fields["文案"] ?? block.fields["内容"], 240) || undefined,
    music: cleanText(block.fields["音乐"] ?? block.fields["BGM"], 80) || undefined,
    likeCount: parseMetric(block.fields["点赞"]),
    commentCount: parseMetric(block.fields["评论数"]),
    shareCount: parseMetric(block.fields["分享"]),
    comments,
    reason: cleanMultiline(block.fields["理由"], 160) || undefined,
  };
}

export function parseDouyinCharacterLive(raw: string): ParsedDouyinCharacterLive {
  const block = parseBlocks(raw).find(item => /互动|直播/.test(item.title)) ?? parseBlocks(raw)[0];
  if (!block) return {};
  return {
    speak: cleanMultiline(block.fields["讲话"], 160) || undefined,
    danmaku: cleanMultiline(block.fields["弹幕"], 80) || undefined,
    giftCoins: parseMetric(block.fields["礼物"]),
    giftLabel: cleanText(block.fields["礼物名"], 24) || undefined,
    joinPk: parseBoolean(block.fields["PK"]),
    pkTopic: cleanText(block.fields["PK主题"], 40) || undefined,
  };
}

function formatFeedContext(videos: DouyinVideo[]): string {
  if (videos.length === 0) return "暂无推荐视频";
  return videos.slice(0, 12).map((video, index) => (
    `${index + 1}. [${video.id}] ${video.caption} · 赞${video.likeCount} 评${video.commentCount}`
  )).join("\n");
}

function formatLiveContext(room: DouyinLiveRoom, interactionHint = ""): string {
  return [
    `直播间：${room.title}`,
    `主播：${room.hostName}（${room.hostType || "npc"}）`,
    `人设：${room.persona || "日常直播"}`,
    `观看：${room.viewers}`,
    `礼物累计：${room.giftCoins}`,
    room.pk?.active ? `PK 中：vs ${room.pk.opponentName}（${room.pk.topic}） ${room.pk.myScore}:${room.pk.opponentScore}` : "未在 PK",
    room.viewerHints?.length ? `观众身份参考：${room.viewerHints.join("、")}` : "",
    room.speakLines?.length ? `最近讲话：${room.speakLines.slice(-3).join(" / ")}` : "",
    room.danmaku.length ? `最近弹幕：${room.danmaku.slice(-6).map(item => item.text).join(" / ")}` : "",
    interactionHint ? `刚刚发生的互动：${interactionHint}` : "",
  ].filter(Boolean).join("\n");
}

function fallbackNpcHostFromPortrait(portrait: DouyinNpcPortrait, index: number): ParsedDouyinNpcLiveHost {
  const stats = estimateDouyinStatsFromPersona(portrait.name + (portrait.tags || []).join(""), index);
  return {
    name: portrait.name.slice(0, 12) || `路人主播${index + 1}`,
    handle: `npc_${portrait.id.slice(-6) || index}`,
    title: `${portrait.name}的直播间`,
    persona: `立绘「${portrait.name}」开播，标签：${(portrait.tags || []).join("、") || "日常"}`,
    viewers: Math.max(30, Math.round(stats.followers * 0.02)),
    coverTone: "#161823",
    hostTone: DOUYIN_TONES[index % DOUYIN_TONES.length],
    speak: "来了来了，今晚随便聊",
  };
}

function fallbackAudienceDanmaku(room: DouyinLiveRoom, count: number, hint = ""): ParsedDouyinAudienceDanmaku {
  const pool = [
    "来了", "好听", "加鸡腿", "前方高能", "主播大气", "哈哈哈", "冲冲冲",
    "刷起来", "求PK", "这个梗绝了", "晚安", "已关注", "同款滤镜", "笑死", "礼物走起",
  ];
  const names = ["晚风", "北岛", "阿梨", "小满", "橘子", "路人甲", "潜水员", "吃瓜人", "夜猫", "同桌", "街角", "云朵", "汽水", "豆豆", "阿哲"];
  return {
    viewers: Math.max(room.viewers, room.viewers + 5 + Math.floor(Math.random() * 40)),
    items: Array.from({ length: count }, (_, index) => ({
      authorName: names[index % names.length] + (index > 9 ? String(index) : ""),
      text: hint && index === 0 ? `回应：${hint.slice(0, 24)}` : pool[(index + room.danmaku.length) % pool.length],
    })),
  };
}

export async function generateDouyinNpcLiveRefresh(count = 3): Promise<DouyinLiveRoom[]> {
  const portraits = pickRandomDouyinNpcPortraits(Math.max(1, count));
  if (portraits.length === 0) {
    throw new DouyinGenerationError("NPC 立绘库为空，请先在创作中心上传立绘。");
  }
  const apiConfig = resolveGlobalApiConfig();
  let hosts: ParsedDouyinNpcLiveHost[] = [];
  if (apiConfig) {
    try {
      const prompt = [
        DEFAULT_DOUYIN_NPC_LIVE_PROMPT,
        "",
        "立绘候选：",
        ...portraits.map((portrait, index) => (
          `${index + 1}. 名称「${portrait.name}」标签「${(portrait.tags || []).join("、") || "无"}」`
        )),
        "",
        `请输出 ${portraits.length} 位主播。`,
      ].join("\n");
      const raw = await sendLLMRequest(
        apiConfig,
        null,
        [{ role: "user", content: prompt, _debugMeta: { marker: "douyin_npc_live" } }],
        [],
        { characterName: "抖音NPC直播刷新" },
        { appId: "douyin", appTags: ["douyin", "npc_live"], skipOutputRegex: true },
      );
      hosts = parseWithDebug(raw, parseDouyinNpcLiveHosts, "无法解析抖音NPC直播人设");
    } catch {
      hosts = [];
    }
  }
  while (hosts.length < portraits.length) {
    hosts.push(fallbackNpcHostFromPortrait(portraits[hosts.length], hosts.length));
  }
  const rooms: DouyinLiveRoom[] = [];
  const authors: DouyinAuthor[] = [];
  portraits.forEach((portrait, index) => {
    const host = hosts[index] || fallbackNpcHostFromPortrait(portrait, index);
    const authorId = `dy_npc_${portrait.id}`;
    const stats = estimateDouyinStatsFromPersona(host.persona, index);
    authors.push({
      id: authorId,
      name: host.name,
      handle: host.handle,
      avatarTone: host.hostTone,
      bio: host.persona,
      followers: stats.followers,
      following: stats.following,
      source: "npc",
      persona: host.persona,
      spriteAssetId: portrait.assetId,
    });
    rooms.push({
      id: makeDouyinId("live"),
      hostName: host.name,
      hostTone: host.hostTone,
      title: host.title,
      viewers: host.viewers,
      coverTone: host.coverTone,
      giftCoins: Math.floor(Math.random() * 200),
      settledGiftCoins: 0,
      danmaku: [],
      status: "live",
      startedAt: new Date().toISOString(),
      hostType: "npc",
      persona: host.persona,
      spriteAssetId: portrait.assetId,
      speakLines: host.speak ? [host.speak] : [],
    });
  });
  replaceDouyinNpcLiveRooms(rooms, authors);
  return rooms;
}

export async function generateDouyinAudienceDanmaku(
  roomId: string,
  interactionHint = "",
): Promise<ParsedDouyinAudienceDanmaku> {
  const state = loadDouyinState();
  const room = state.liveRooms.find(item => item.id === roomId);
  if (!room) throw new DouyinGenerationError("直播间不存在");
  const count = state.settings.audienceDanmakuCount || 15;
  const apiConfig = resolveGlobalApiConfig();
  let parsed: ParsedDouyinAudienceDanmaku | null = null;
  if (apiConfig) {
    try {
      const prompt = [
        DEFAULT_DOUYIN_AUDIENCE_DANMAKU_PROMPT.replace("恰好 15 条", `恰好 ${count} 条`),
        "",
        formatLiveContext(room, interactionHint),
      ].join("\n");
      const raw = await sendLLMRequest(
        apiConfig,
        null,
        [{ role: "user", content: prompt, _debugMeta: { marker: "douyin_audience_danmaku" } }],
        [],
        { characterName: "抖音观众弹幕" },
        { appId: "douyin", appTags: ["douyin", "audience"], skipOutputRegex: true },
      );
      parsed = parseWithDebug(raw, output => parseDouyinAudienceDanmaku(output, count), "无法解析观众弹幕");
    } catch {
      parsed = null;
    }
  }
  const result = parsed && parsed.items.length > 0 ? parsed : fallbackAudienceDanmaku(room, count, interactionHint);
  appendDouyinDanmakuBatch(roomId, result.items.map(item => ({
    text: item.text,
    authorName: item.authorName,
    kind: "audience",
  })));
  if (typeof result.viewers === "number" && result.viewers > 0) {
    updateDouyinLiveRoom(roomId, { viewers: result.viewers });
  }
  return result;
}

export async function generateDouyinCharacterActivity(characterId: string): Promise<{
  published: boolean;
  video?: DouyinVideo;
  reason?: string;
}> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) return { published: false, reason: "角色不存在" };
  const state = loadDouyinState();
  const displayName = resolveCharacterDouyinDisplayName(character);
  const persona = resolveCharacterDouyinPersona(character);
  const stats = estimateDouyinStatsFromPersona(persona, characterId.length);
  const authorId = `dy_char_${characterId}`;
  upsertDouyinAuthor({
    id: authorId,
    name: displayName,
    handle: `c_${characterId.slice(-6)}`,
    avatarTone: DOUYIN_TONES[characterId.length % DOUYIN_TONES.length],
    bio: persona,
    followers: stats.followers,
    following: stats.following,
    source: "character",
    characterId,
    persona,
  });

  const resolved = await resolveCharacterAssemblerInput(characterId, ["douyin", "activity"], {
    feedContext: formatFeedContext(state.videos),
  });

  let activity: ParsedDouyinCharacterActivity | null = null;
  if (resolved?.apiConfig) {
    try {
      const messages = assemblePromptPayload(resolved.input);
      const raw = await sendLLMRequest(
        resolved.apiConfig,
        resolved.preset,
        messages,
        resolved.regexes,
        { characterName: `抖音:${resolved.character.name}`, userName: resolved.input.userIdentity?.name },
        { appId: "douyin", appTags: ["douyin", "activity"] },
      );
      activity = parseWithDebug(raw, parseDouyinCharacterActivity, "无法解析角色抖音动态");
    } catch {
      activity = null;
    }
  }

  if (!activity) {
    const shouldPublish = Math.random() < stats.publishChance;
    activity = shouldPublish
      ? {
          shouldPublish: true,
          caption: `${displayName}随手拍了一段日常`,
          music: "原声 · 角色",
          likeCount: stats.avgLikes,
          commentCount: Math.max(1, Math.round(stats.avgLikes * 0.03)),
          shareCount: Math.max(0, Math.round(stats.avgLikes * 0.01)),
          comments: [{ authorName: "路人粉", text: "好真实" }],
          reason: "按人设热度本地生成",
        }
      : { shouldPublish: false, reason: "人设判断今天先不发" };
  }

  if (!activity.shouldPublish || !activity.caption) {
    return { published: false, reason: activity.reason || "角色选择不发布" };
  }

  const comments: DouyinComment[] = (activity.comments || []).map((item, index) => ({
    id: makeDouyinId("cmt"),
    authorName: item.authorName,
    authorTone: DOUYIN_TONES[index % DOUYIN_TONES.length],
    text: item.text,
    likeCount: Math.floor(Math.random() * 20),
    liked: false,
    createdAt: new Date().toISOString(),
    authorType: "npc",
  }));

  const next = publishDouyinVideo(activity.caption, {
    authorId,
    music: activity.music || "原声 · 角色",
    coverTone: "#1b1430",
    likeCount: activity.likeCount ?? stats.avgLikes,
    shareCount: activity.shareCount ?? Math.round(stats.avgLikes * 0.01),
    comments,
    source: "character",
    characterId,
  });
  const video = next.videos[0];
  recordDouyinPublishEvent({ characterId, characterName: displayName, video });
  return { published: true, video, reason: activity.reason };
}

export async function startDouyinCharacterLive(
  characterId: string,
  title?: string,
  spriteAssetId?: string,
): Promise<DouyinLiveRoom | null> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) return null;
  const displayName = resolveCharacterDouyinDisplayName(character);
  const persona = resolveCharacterDouyinPersona(character);
  const stats = estimateDouyinStatsFromPersona(persona, characterId.length);
  const authorId = `dy_char_${characterId}`;
  const author: DouyinAuthor = {
    id: authorId,
    name: displayName,
    handle: `c_${characterId.slice(-6)}`,
    avatarTone: DOUYIN_TONES[characterId.length % DOUYIN_TONES.length],
    bio: persona,
    followers: stats.followers,
    following: stats.following,
    source: "character",
    characterId,
    persona,
    spriteAssetId,
  };
  const room: DouyinLiveRoom = {
    id: makeDouyinId("live"),
    hostName: displayName,
    hostTone: author.avatarTone,
    title: cleanText(title, 80) || `${displayName}的直播间`,
    viewers: Math.max(20, Math.round(stats.followers * 0.015)),
    coverTone: "#12121a",
    giftCoins: 0,
    settledGiftCoins: 0,
    danmaku: [],
    status: "live",
    startedAt: new Date().toISOString(),
    hostType: "character",
    characterId,
    persona,
    spriteAssetId,
    speakLines: ["今天开播啦"],
  };
  addDouyinLiveRoom(room, author);
  recordDouyinLiveHostEvent({ characterId, characterName: displayName, room });
  await generateDouyinAudienceDanmaku(room.id, "角色刚开播");
  return loadDouyinState().liveRooms.find(item => item.id === room.id) || room;
}

export async function generateDouyinCharacterLiveAction(
  characterId: string,
  roomId: string,
  mode: "host" | "viewer" = "viewer",
  interactionHint = "",
): Promise<ParsedDouyinCharacterLive | null> {
  const character = loadCharacters().find(item => item.id === characterId);
  const state = loadDouyinState();
  const room = state.liveRooms.find(item => item.id === roomId);
  if (!character || !room) return null;
  const displayName = resolveCharacterDouyinDisplayName(character);
  const resolved = await resolveCharacterAssemblerInput(characterId, ["douyin", "live"], {
    liveContext: [
      mode === "host" ? "你是主播。" : "你是观众，进入别人的直播间。",
      formatLiveContext(room, interactionHint),
    ].join("\n"),
  });

  let parsed: ParsedDouyinCharacterLive | null = null;
  if (resolved?.apiConfig) {
    try {
      const messages = assemblePromptPayload(resolved.input);
      const raw = await sendLLMRequest(
        resolved.apiConfig,
        resolved.preset,
        messages,
        resolved.regexes,
        { characterName: `抖音直播:${resolved.character.name}`, userName: resolved.input.userIdentity?.name },
        { appId: "douyin", appTags: ["douyin", "live"] },
      );
      parsed = parseWithDebug(raw, parseDouyinCharacterLive, "无法解析角色直播互动");
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    parsed = mode === "host"
      ? { speak: "谢谢大家来看，今晚慢慢聊", joinPk: Math.random() > 0.7, pkTopic: "才艺比拼" }
      : {
          danmaku: "来看看",
          giftCoins: Math.random() > 0.6 ? [1, 9, 99][Math.floor(Math.random() * 3)] : 0,
          giftLabel: "玫瑰",
        };
  }

  if (parsed.speak) {
    updateDouyinLiveRoom(roomId, { speakLines: [parsed.speak] });
    appendDouyinDanmaku(roomId, parsed.speak, {
      authorName: displayName,
      kind: mode === "host" ? "host" : "character",
      characterId,
      tone: "#fe2c55",
    });
  }
  if (parsed.danmaku) {
    appendDouyinDanmaku(roomId, parsed.danmaku, {
      authorName: displayName,
      kind: "character",
      characterId,
      tone: "#ff6b9d",
    });
  }
  if ((parsed.giftCoins || 0) > 0) {
    addDouyinGift(roomId, parsed.giftCoins || 0);
    appendDouyinDanmaku(roomId, `${displayName} 送出 ${parsed.giftLabel || "礼物"}`, {
      authorName: displayName,
      kind: "character",
      characterId,
      tone: "#f5c542",
    });
    bumpDouyinPkScore(roomId, "me", parsed.giftCoins || 0);
  }
  if (parsed.joinPk) {
    if (!room.pk?.active) startDouyinPk(roomId, mode === "host" ? "神秘对手" : room.hostName, parsed.pkTopic);
  }

  recordDouyinLiveInteractEvent({
    characterId,
    characterName: displayName,
    room,
    speak: parsed.speak,
    danmaku: parsed.danmaku,
    giftCoins: parsed.giftCoins,
    giftLabel: parsed.giftLabel,
    pkTopic: parsed.joinPk ? (parsed.pkTopic || room.pk?.topic) : undefined,
  });

  return parsed;
}

export async function runDouyinLiveInteractionBurst(
  roomId: string,
  interactionHint: string,
  characterIds: string[] = [],
): Promise<void> {
  await generateDouyinAudienceDanmaku(roomId, interactionHint);
  const state = loadDouyinState();
  const room = state.liveRooms.find(item => item.id === roomId);
  if (!room) return;
  const ids = characterIds.length > 0 ? characterIds : state.settings.participantCharacterIds;
  for (const characterId of ids) {
    if (room.hostType === "character" && room.characterId === characterId) {
      await generateDouyinCharacterLiveAction(characterId, roomId, "host", interactionHint);
    } else {
      await generateDouyinCharacterLiveAction(characterId, roomId, "viewer", interactionHint);
    }
  }
}

export function buildDouyinCharacterActivityFallbackPrompt(): string {
  return DEFAULT_DOUYIN_CHARACTER_ACTIVITY_PROMPT;
}

export function buildDouyinCharacterLiveFallbackPrompt(): string {
  return DEFAULT_DOUYIN_CHARACTER_LIVE_PROMPT;
}

export async function previewDouyinPromptPayload(
  characterId: string,
  mode: "activity" | "live",
): Promise<{ messages: ReturnType<typeof assemblePromptPayload>; characterName: string } | null> {
  const state = loadDouyinState();
  const room = state.liveRooms.find(item => item.status === "live") || state.liveRooms[0];
  const resolved = await resolveCharacterAssemblerInput(
    characterId,
    mode === "activity" ? ["douyin", "activity"] : ["douyin", "live"],
    mode === "activity"
      ? { feedContext: formatFeedContext(state.videos) }
      : { liveContext: room ? formatLiveContext(room) : "暂无直播" },
  );
  if (!resolved) return null;
  return {
    messages: assemblePromptPayload(resolved.input),
    characterName: resolved.character.name,
  };
}
