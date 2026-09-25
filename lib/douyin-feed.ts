import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import {
  estimateDouyinStatsFromPersona,
  resolveCharacterDouyinDisplayName,
  resolveCharacterDouyinPersona,
} from "./douyin-character-profile";
import { generateDouyinCharacterActivity } from "./douyin-engine";
import { generateImageFromConfiguredApi } from "./image-generation-service";
import {
  DOUYIN_TONES,
  ensureDouyinThread,
  loadDouyinState,
  makeDouyinId,
  publishDouyinVideo,
  sendDouyinDm,
  setDouyinVideoImage,
  updateDouyinSettings,
  upsertDouyinAuthor,
} from "./douyin-storage";
import {
  DEFAULT_DOUYIN_FEED_PROMPT,
  type DouyinVideo,
  type ParsedDouyinFeedComment,
  type ParsedDouyinFeedVideo,
} from "./douyin-types";
import { loadApiConfigs, loadBindingConfig } from "./settings-storage";
import type { ApiConfig } from "./settings-types";

// Field labels (unicode escapes keep this file pure ASCII).
const L_AUTHOR = "\u4F5C\u8005";
const L_HANDLE = "\u6296\u97F3\u53F7";
const L_CAPTION = "\u6587\u6848";
const L_MUSIC = "\u97F3\u4E50";
const L_SCENE = "\u573A\u666F";
const L_TAGS = "\u6807\u7B7E";
const L_LIKES = "\u70B9\u8D5E";
const L_SHARES = "\u5206\u4EAB";
const L_COMMENT = "\u8BC4\u8BBA";
const L_CONTENT = "\u5185\u5BB9";

export class DouyinFeedError extends Error {
  raw?: string;
  constructor(message: string, raw?: string) {
    super(message);
    this.name = "DouyinFeedError";
    this.raw = raw;
  }
}

function parseMetric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const text = String(value ?? "").trim().replace(/[,\s]/g, "");
  if (!text) return 0;
  const w = /^(-?\d+(?:\.\d+)?)[wW`\u4E07]/.exec(text);
  if (w) return Math.max(0, Math.round(Number(w[1]) * 10000));
  const k = /^(-?\d+(?:\.\d+)?)[kK`\u5343]/.exec(text);
  if (k) return Math.max(0, Math.round(Number(k[1]) * 1000));
  const numeric = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function resolveGlobalApiConfig(): ApiConfig | null {
  const configs = loadApiConfigs();
  const binding = loadBindingConfig();
  if (binding.globalDefaults.apiConfigId) {
    return configs.find(config => config.id === binding.globalDefaults.apiConfigId) ?? null;
  }
  return configs[0] ?? null;
}

export function parseDouyinFeedVideos(raw: string, count = 10): ParsedDouyinFeedVideo[] {
  const text = raw.replace(/^```(?:text|json|markdown)?\s*/i, "").replace(/\s*```$/i, "");
  const blocks: Array<{ fields: Record<string, string> }> = [];
  let current: { fields: Record<string, string> } | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s*([^#\[]+)/.test(line) && !/^\[[^\]]+\]/.test(line)) {
      if (current) blocks.push(current);
      current = { fields: {} };
      continue;
    }
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (m) {
      if (!current) current = { fields: {} };
      current.fields[m[1].trim()] = m[2] ?? "";
    }
  }
  if (current) blocks.push(current);
  return blocks.slice(0, count).map(block => {
    const f = block.fields;
    const tags = String(f[L_TAGS] || "")
      .split(/[\s,`\uFF0C]+/)
      .map(t => t.trim().replace(/^#+/, ""))
      .filter(Boolean)
      .slice(0, 4);
    const comments: ParsedDouyinFeedComment[] = [];
    for (let i = 1; i <= 10; i++) {
      const authorName = String(f[`${L_COMMENT}${i}${L_AUTHOR}`] || "").trim().slice(0, 40);
      const commentText = String(f[`${L_COMMENT}${i}${L_CONTENT}`] || "").trim().slice(0, 160);
      if (!authorName || !commentText) continue;
      const likeRaw = f[`${L_COMMENT}${i}${L_LIKES}`];
      comments.push({
        authorName,
        text: commentText,
        likeCount: parseMetric(likeRaw) || Math.floor(Math.random() * 800),
      });
    }
    return {
      authorName: String(f[L_AUTHOR] || "").trim().slice(0, 40) || "douyin_user",
      handle: String(f[L_HANDLE] || "").trim().slice(0, 40) || `u_${Math.random().toString(36).slice(2, 7)}`,
      caption: String(f[L_CAPTION] || "").trim().slice(0, 240) || "daily moment",
      music: String(f[L_MUSIC] || "").trim().slice(0, 80) || "original sound",
      imagePrompt: String(f[L_SCENE] || "").trim().slice(0, 600),
      tags,
      likeCount: parseMetric(f[L_LIKES]) || 500 + Math.floor(Math.random() * 20000),
      shareCount: parseMetric(f[L_SHARES]) || Math.floor(Math.random() * 900),
      comments,
    };
  }).filter(item => item.caption && item.comments.length > 0);
}

export type FeedRequest = {
  count?: number;
  tags?: string[];
  searchKeyword?: string;
  personaName?: string;
  personaText?: string;
};

function buildFeedPrompt(req: FeedRequest): string {
  const count = req.count ?? 10;
  const lines = [DEFAULT_DOUYIN_FEED_PROMPT.replace("EXACTLY 10 video blocks", `EXACTLY ${count} video blocks`)];
  if (req.searchKeyword) {
    lines.push("", `CONTEXT: this is the result page for search query "${req.searchKeyword}". All ${count} videos must relate to it; put it as the first tag of each video. Also derive related-search tags from it.`);
  } else if (req.tags && req.tags.length > 0) {
    lines.push("", `CONTEXT: user interest tags: ${req.tags.join(", ")}. Associate freely around them; do not force every video onto a tag; spread across verticals.`);
  }
  if (req.personaName && req.personaText) {
    lines.push("", `CONTEXT: one fixed author "${req.personaName}" (persona: ${req.personaText.slice(0, 120)}); at least 1 block is posted in their voice, the rest are strangers.`);
  }
  lines.push("", `Output ${count} blocks now.`);
  return lines.join("\n");
}

function shuffled<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

// Offline fallback reuses existing seed copy (runtime data), so no copy is embedded here.
function fallbackFeedItems(count: number, tagHint: string): ParsedDouyinFeedVideo[] {
  const state = loadDouyinState();
  const seeds = state.videos.length > 0 ? state.videos : [];
  const commentPool = seeds.flatMap(v => v.comments);
  const authors = state.authors.length > 0 ? state.authors : [];
  const order = shuffled(seeds.map((_, i) => i));
  const items: ParsedDouyinFeedVideo[] = [];
  for (let n = 0; n < count; n++) {
    const seed = seeds[order[n % Math.max(1, order.length)]] || seeds[0];
    if (!seed) break;
    const author = authors[n % Math.max(1, authors.length)];
    const seedComments = shuffled(commentPool).slice(0, 10);
    const comments: ParsedDouyinFeedComment[] = seedComments.length > 0
      ? seedComments.map(c => ({ authorName: c.authorName, text: c.text, likeCount: c.likeCount }))
      : [{ authorName: "passerby", text: "nice", likeCount: 1 }];
    const tags = [...(seed.tags || [])];
    if (tagHint && !tags.includes(tagHint)) tags.unshift(tagHint);
    items.push({
      authorName: author?.name || seed.authorId,
      handle: author?.handle || `u_${n}`,
      caption: seed.caption,
      music: seed.music,
      imagePrompt: seed.imagePrompt || `${seed.caption} / vertical 9:16 short-video cover`,
      tags: tags.slice(0, 4),
      likeCount: 800 + Math.floor(Math.random() * 30000),
      shareCount: Math.floor(Math.random() * 1200),
      comments,
    });
  }
  return items;
}

function toStoredVideos(items: ParsedDouyinFeedVideo[]): DouyinVideo[] {
  const stored: DouyinVideo[] = [];
  const seen = new Map<string, string>();
  items.forEach((item, index) => {
    let authorId = seen.get(item.authorName);
    if (!authorId) {
      const existing = loadDouyinState().authors.find(a => a.name === item.authorName);
      if (existing) {
        authorId = existing.id;
      } else {
        authorId = `dy_feed_${Date.now().toString(36)}_${index}`;
        const stats = estimateDouyinStatsFromPersona(item.authorName, index);
        upsertDouyinAuthor({
          id: authorId,
          name: item.authorName,
          handle: item.handle,
          avatarTone: DOUYIN_TONES[index % DOUYIN_TONES.length],
          bio: item.tags.length > 0 ? item.tags.map(t => `#${t}`).join(" ") : "douyin creator",
          followers: stats.followers,
          following: stats.following,
          source: "seed",
          douyinId: `DY${100000 + Math.floor(Math.random() * 899999)}`,
          totalLikes: Math.round(stats.followers * 0.6),
        });
      }
      seen.set(item.authorName, authorId);
    }
    const next = publishDouyinVideo(item.caption, {
      authorId,
      music: item.music,
      coverTone: "#161823",
      likeCount: item.likeCount,
      shareCount: item.shareCount,
      comments: item.comments.map(c => ({
        id: makeDouyinId("cmt"),
        authorName: c.authorName,
        authorTone: DOUYIN_TONES[Math.floor(Math.random() * DOUYIN_TONES.length)],
        text: c.text,
        likeCount: c.likeCount,
        liked: false,
        createdAt: new Date().toISOString(),
        authorType: "npc" as const,
      })),
      source: "seed",
    });
    const saved = next.videos[0];
    if (saved) {
      if (item.imagePrompt) setDouyinVideoImage(saved.id, undefined, item.imagePrompt);
      if (item.tags.length > 0) {
        const st = loadDouyinState();
        const found = st.videos.find(v => v.id === saved.id);
        if (found) {
          found.tags = item.tags;
          stored.push(found);
        } else {
          stored.push(saved);
        }
      } else {
        stored.push(saved);
      }
    }
  });
  return stored;
}

/** One call refreshes `count` feed items (comments + scene descriptions included). */
export async function generateDouyinFeed(req: FeedRequest = {}): Promise<DouyinVideo[]> {
  const count = req.count ?? 10;
  const apiConfig = resolveGlobalApiConfig();
  let parsed: ParsedDouyinFeedVideo[] = [];
  if (apiConfig) {
    try {
      const raw = await sendLLMRequest(
        apiConfig,
        null,
        [{ role: "user", content: buildFeedPrompt(req), _debugMeta: { marker: "douyin_feed" } }],
        [],
        { characterName: "douyin_recommend" },
        { appId: "douyin", appTags: ["douyin", "recommend"], skipOutputRegex: true },
      );
      parsed = parseDouyinFeedVideos(raw, count);
    } catch {
      parsed = [];
    }
  }
  if (parsed.length < count) {
    const hint = req.searchKeyword || (req.tags && req.tags.length > 0 ? req.tags[parsed.length % req.tags.length] : "");
    parsed = [...parsed, ...fallbackFeedItems(count - parsed.length, hint || "")].slice(0, count);
  }
  return toStoredVideos(parsed.slice(0, count));
}

/** Search: 10 related items (10 comments each) + history. */
export async function generateDouyinSearchFeed(keyword: string): Promise<DouyinVideo[]> {
  const videos = await generateDouyinFeed({ count: 10, searchKeyword: keyword.trim() });
  try {
    const state = loadDouyinState();
    const history = [keyword.trim(), ...(state.settings.searchHistory || [])].filter(Boolean);
    updateDouyinSettings({ searchHistory: [...new Set(history)].slice(0, 12) });
  } catch {
    /* ignore */
  }
  return videos;
}

/** Character homepage: at least minCount persona-driven items. */
export async function generateCharacterHomepageFeed(characterId: string, minCount = 3): Promise<DouyinVideo[]> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) throw new DouyinFeedError("character not found");
  const displayName = resolveCharacterDouyinDisplayName(character);
  const collected: DouyinVideo[] = [];
  for (let round = 0; round < 6 && collected.length < minCount; round++) {
    try {
      const result = await generateDouyinCharacterActivity(characterId);
      if (result.published && result.video) collected.push(result.video);
    } catch {
      break;
    }
  }
  let need = minCount - collected.length;
  while (need > 0) {
    const state = loadDouyinState();
    const seeds = state.videos.length > 0 ? state.videos : [];
    const seed = seeds[Math.floor(Math.random() * Math.max(1, seeds.length))];
    const item: ParsedDouyinFeedVideo = seed
      ? {
          authorName: displayName,
          handle: `c_${characterId.slice(-6)}`,
          caption: seed.caption,
          music: seed.music,
          imagePrompt: seed.imagePrompt || seed.caption,
          tags: [...(seed.tags || [])],
          likeCount: 500 + Math.floor(Math.random() * 9000),
          shareCount: Math.floor(Math.random() * 300),
          comments: seed.comments.slice(0, 10).map(c => ({ authorName: c.authorName, text: c.text, likeCount: c.likeCount })),
        }
      : {
          authorName: displayName,
          handle: `c_${characterId.slice(-6)}`,
          caption: `${displayName} daily`,
          music: "original sound",
          imagePrompt: `${displayName} daily moment, vertical 9:16`,
          tags: [],
          likeCount: 300,
          shareCount: 5,
          comments: [{ authorName: "fan", text: "first!", likeCount: 3 }],
        };
    collected.push(...toStoredVideos([item]));
    need--;
  }
  return collected;
}

/** Use the configured image model when available; otherwise keep the text description. */
export async function ensureDouyinVideoImage(videoId: string): Promise<{ imageUrl?: string; hasImageApi: boolean }> {
  const state = loadDouyinState();
  const video = state.videos.find(item => item.id === videoId);
  if (!video || video.imageUrl) return { imageUrl: video?.imageUrl, hasImageApi: true };
  const prompt = video.imagePrompt || `${video.caption}, vertical short-video cover`;
  try {
    const result = await generateImageFromConfiguredApi({ description: prompt });
    if (!result) return { hasImageApi: false };
    setDouyinVideoImage(videoId, result.dataUrl, video.imagePrompt);
    return { imageUrl: result.dataUrl, hasImageApi: true };
  } catch {
    return { hasImageApi: true };
  }
}

/** Add a character as douyin friend: author page + DM thread. */
export async function addDouyinCharacterFriend(characterId: string): Promise<{ authorId: string; threadId: string }> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) throw new DouyinFeedError("character not found");
  const displayName = resolveCharacterDouyinDisplayName(character);
  const persona = resolveCharacterDouyinPersona(character);
  const stats = estimateDouyinStatsFromPersona(persona, characterId.length);
  const tone = DOUYIN_TONES[characterId.length % DOUYIN_TONES.length];
  const authorId = `dy_char_${characterId}`;
  upsertDouyinAuthor({
    id: authorId,
    name: displayName,
    handle: `c_${characterId.slice(-6)}`,
    avatarTone: tone,
    bio: persona.slice(0, 120),
    followers: stats.followers,
    following: stats.following,
    source: "character",
    characterId,
    persona,
    douyinId: `DY${100000 + (characterId.length * 7919) % 899999}`,
    totalLikes: Math.round(stats.followers * 0.7),
  });
  const threadId = ensureDouyinThread(displayName, tone, characterId);
  return { authorId, threadId };
}

/** Forward a live room to a character as a card-style DM. */
export function forwardDouyinLiveToCharacter(roomId: string, characterId: string): string {
  const state = loadDouyinState();
  const room = state.liveRooms.find(item => item.id === roomId);
  if (!room) throw new DouyinFeedError("room not found");
  const threadId = state.threads.find(t => t.characterId === characterId)?.id
    || ensureDouyinThread(room.hostName, room.hostTone);
  sendDouyinDm(threadId, `[\u5206\u4eab\u7684\u76f4\u64ad]${room.hostName} - ${room.title} (${room.viewers}\u4eba\u5728\u770b)`);
  return threadId;
}
