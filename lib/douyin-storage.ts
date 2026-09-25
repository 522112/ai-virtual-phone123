import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { resolveUserIdentity } from "./settings-storage";
import { creditWalletBalance } from "./wallet-storage";
import type {
  DouyinAuthor,
  DouyinAuthorSource,
  DouyinComment,
  DouyinDanmaku,
  DouyinDmMessage,
  DouyinDmThread,
  DouyinLiveRoom,
  DouyinPkState,
  DouyinSession,
  DouyinSettings,
  DouyinState,
  DouyinVideo,
} from "./douyin-types";
import { DEFAULT_DOUYIN_SETTINGS } from "./douyin-types";

export const DOUYIN_STATE_KEY = "ai_phone_douyin_state_v1";
export const DOUYIN_UPDATED_EVENT = "douyin-state-updated";

registerKvMigration(DOUYIN_STATE_KEY);

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function dispatchUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOUYIN_UPDATED_EVENT));
}

const TONES = ["#ff6b9d", "#ff9f43", "#f5c542", "#54a0ff", "#5f27cd", "#10ac84", "#fe2c55", "#25f4ee"];

const SEED_AUTHORS: DouyinAuthor[] = [
  { id: "dy_a_aurora", name: "极光小七", handle: "aurora7", avatarTone: "#ff6b9d", bio: "夜景猎人", followers: 128000, following: 86, source: "seed", douyinId: "DY100001", backgroundTone: "#101828", totalLikes: 1200000 },
  { id: "dy_a_chef", name: "深夜食堂", handle: "midnightsoup", avatarTone: "#ff9f43", bio: "一人食也可以很热闹", followers: 92000, following: 41, source: "seed", douyinId: "DY100002", backgroundTone: "#2d1b14", totalLikes: 860000 },
  { id: "dy_a_cat", name: "橘座本座", handle: "orangecat", avatarTone: "#f5c542", bio: "喵了个咪", followers: 210000, following: 12, source: "seed", douyinId: "DY100003", backgroundTone: "#2a2118", totalLikes: 3100000 },
  { id: "dy_a_city", name: "街角慢镜", handle: "slowcity", avatarTone: "#54a0ff", bio: "城市声景", followers: 64000, following: 203, source: "seed", douyinId: "DY100004", backgroundTone: "#121a22", totalLikes: 540000 },
  { id: "dy_a_dance", name: "不绊脚", handle: "stepsoft", avatarTone: "#5f27cd", bio: "练舞日记", followers: 305000, following: 58, source: "seed", douyinId: "DY100005", backgroundTone: "#1b1430", totalLikes: 4200000 },
];

function seedComments(videoId: string): DouyinComment[] {
  const pool = [
    ["太会拍了", "#ff6b9d"],
    ["这BGM绝了", "#54a0ff"],
    ["已单曲循环", "#10ac84"],
    ["求同款滤镜", "#ff9f43"],
    ["哈哈哈笑死", "#f5c542"],
  ] as const;
  return pool.slice(0, 3 + (videoId.length % 3)).map(([text, tone], index) => ({
    id: `${videoId}_c_${index}`,
    authorName: ["路过的风", "晚风收信人", "北岛电台", "小满", "阿梨"][index % 5],
    authorTone: tone,
    text,
    likeCount: 3 + index * 17,
    liked: false,
    createdAt: nowIso(),
    authorType: "npc" as const,
  }));
}

function seedVideos(): DouyinVideo[] {
  const caps = [
    ["雨夜便利店门口的灯牌，像一颗糖", "夜行 · 街灯", "#1a1a2e", "dy_a_city"],
    ["三分半炒完一碗番茄蛋，真香警告", "厨房节奏 · Beat", "#2d1b14", "dy_a_chef"],
    ["橘猫占领键盘第三季·最终章", "喵呜进行曲", "#2a2118", "dy_a_cat"],
    ["凌晨两点练到脚软也要拍完", "练习室 · Loop", "#1b1430", "dy_a_dance"],
    ["极光真的能把人喊醒", "静夜 · Aurora", "#101828", "dy_a_aurora"],
    ["把城市的脚步声剪成鼓点", "都市 · Pulse", "#121a22", "dy_a_city"],
    ["一人食也可以摆盘成仪式感", "慢煮 · Soft", "#221810", "dy_a_chef"],
    ["跟我学这一段手位，三遍就会", "舞蹈 · Tutorial", "#1a1228", "dy_a_dance"],
  ] as const;
  return caps.map(([caption, music, coverTone, authorId], index) => {
    const id = `dy_v_${index + 1}`;
    const comments = seedComments(id);
    return {
      id,
      authorId,
      caption,
      music,
      coverTone,
      likeCount: 1200 + index * 880,
      commentCount: comments.length,
      shareCount: 40 + index * 13,
      liked: false,
      followed: false,
      comments,
      createdAt: nowIso(),
      source: "seed" as const,
    };
  });
}

function seedThreads(): DouyinDmThread[] {
  const now = nowIso();
  return [
    {
      id: "dy_dm_1",
      peerName: "极光小七",
      peerTone: "#ff6b9d",
      unread: 1,
      updatedAt: now,
      messages: [
        { id: "dy_dm_1_a", fromMe: false, text: "你刷到我那场极光了吗？", createdAt: now },
        { id: "dy_dm_1_b", fromMe: true, text: "刷到了，滤镜也太干净了", createdAt: now },
        { id: "dy_dm_1_c", fromMe: false, text: "下次一起连麦看直播？", createdAt: now },
      ],
    },
    {
      id: "dy_dm_2",
      peerName: "橘座本座",
      peerTone: "#f5c542",
      unread: 0,
      updatedAt: now,
      messages: [
        { id: "dy_dm_2_a", fromMe: false, text: "键盘是我的，鼠标也是我的", createdAt: now },
        { id: "dy_dm_2_b", fromMe: true, text: "……你是只猫对吧", createdAt: now },
      ],
    },
  ];
}

function seedLiveRooms(): DouyinLiveRoom[] {
  const now = nowIso();
  return [
    {
      id: "dy_live_1",
      hostName: "深夜食堂",
      hostTone: "#ff9f43",
      title: "凌晨煮面局 · 随便聊",
      viewers: 1860,
      coverTone: "#2d1b14",
      giftCoins: 320,
      settledGiftCoins: 0,
      status: "live",
      startedAt: now,
      hostType: "npc",
      persona: "深夜食堂主播，爱边煮边聊",
      danmaku: [
        { id: "dy_dk_1", text: "老板再来一碗", tone: "#fff", createdAt: now, kind: "audience", authorName: "路人甲" },
        { id: "dy_dk_2", text: "香味隔着屏幕都闻到了", tone: "#25f4ee", createdAt: now, kind: "audience", authorName: "夜猫" },
        { id: "dy_dk_3", text: "前方高能炒勺", tone: "#fe2c55", createdAt: now, kind: "audience", authorName: "吃货" },
      ],
      speakLines: ["今晚想吃什么跟我说"],
    },
    {
      id: "dy_live_2",
      hostName: "不绊脚",
      hostTone: "#5f27cd",
      title: "练习室公开练舞",
      viewers: 4200,
      coverTone: "#1b1430",
      giftCoins: 980,
      settledGiftCoins: 0,
      status: "live",
      startedAt: now,
      hostType: "npc",
      persona: "练舞区主播，喜欢带练",
      danmaku: [
        { id: "dy_dk_4", text: "这段手位太丝滑了", tone: "#25f4ee", createdAt: now, kind: "audience", authorName: "学员A" },
        { id: "dy_dk_5", text: "老师再放慢一倍！", tone: "#fff", createdAt: now, kind: "audience", authorName: "学员B" },
      ],
      speakLines: ["跟我一起，一二三四"],
    },
  ];
}

function defaultSession(): DouyinSession {
  const identity = resolveUserIdentity();
  return {
    loggedIn: false,
    nickname: identity?.name || "抖音用户",
    handle: `dy_${(identity?.id || "user").replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "guest"}`,
    avatarTone: "#25f4ee",
    bio: "还没有简介",
    walletLinked: false,
    followingIds: [],
    followers: 12,
    persona: "普通抖音用户，喜欢随手拍日常",
    backgroundTone: "#161823",
    collectedIds: [],
  };
}

function defaultSettings(): DouyinSettings {
  return { ...DEFAULT_DOUYIN_SETTINGS };
}

export function createDefaultDouyinState(): DouyinState {
  return {
    session: defaultSession(),
    settings: defaultSettings(),
    authors: SEED_AUTHORS,
    videos: seedVideos(),
    threads: seedThreads(),
    liveRooms: seedLiveRooms(),
    myLiveRoomId: null,
    updatedAt: nowIso(),
  };
}

function normalizeComment(value: unknown): DouyinComment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DouyinComment>;
  if (typeof item.id !== "string" || typeof item.text !== "string") return null;
  return {
    id: item.id,
    authorName: cleanText(item.authorName, 40) || "用户",
    authorTone: cleanText(item.authorTone, 20) || "#999",
    text: cleanText(item.text, 280),
    likeCount: Number(item.likeCount) || 0,
    liked: item.liked === true,
    createdAt: cleanText(item.createdAt, 40) || nowIso(),
    authorType: item.authorType === "character" || item.authorType === "user" || item.authorType === "npc" ? item.authorType : "npc",
    characterId: typeof item.characterId === "string" ? item.characterId : undefined,
  };
}

function normalizeSource(value: unknown): DouyinAuthorSource | undefined {
  if (value === "seed" || value === "npc" || value === "character" || value === "user") return value;
  return undefined;
}

function normalizePk(value: unknown): DouyinPkState | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DouyinPkState>;
  return {
    active: item.active !== false,
    opponentName: cleanText(item.opponentName, 40) || "对手",
    opponentTone: cleanText(item.opponentTone, 20) || "#fe2c55",
    myScore: Math.max(0, Number(item.myScore) || 0),
    opponentScore: Math.max(0, Number(item.opponentScore) || 0),
    topic: cleanText(item.topic, 40) || "随便比一场",
  };
}

function normalizeVideo(value: unknown): DouyinVideo | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DouyinVideo>;
  if (typeof item.id !== "string" || typeof item.caption !== "string") return null;
  const comments = Array.isArray(item.comments)
    ? item.comments.map(normalizeComment).filter(Boolean) as DouyinComment[]
    : [];
  return {
    id: item.id,
    authorId: cleanText(item.authorId, 80) || "dy_a_city",
    caption: cleanText(item.caption, 240),
    music: cleanText(item.music, 80) || "原声",
    coverTone: cleanText(item.coverTone, 20) || "#1a1a2e",
    likeCount: Number(item.likeCount) || 0,
    commentCount: Number(item.commentCount) || comments.length,
    shareCount: Number(item.shareCount) || 0,
    liked: item.liked === true,
    followed: item.followed === true,
    comments,
    createdAt: cleanText(item.createdAt, 40) || nowIso(),
    source: normalizeSource(item.source),
    characterId: typeof item.characterId === "string" ? item.characterId : undefined,
    imagePrompt: cleanText(item.imagePrompt, 600) || undefined,
    imageUrl: typeof item.imageUrl === "string" && item.imageUrl ? item.imageUrl.slice(0, 2000000) : undefined,
    tags: Array.isArray(item.tags)
      ? item.tags.map(tag => cleanText(tag, 24).replace(/^#+/, "")).filter(Boolean).slice(0, 4)
      : undefined,
  };
}

function normalizeThread(value: unknown): DouyinDmThread | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DouyinDmThread>;
  if (typeof item.id !== "string") return null;
  const messages = Array.isArray(item.messages)
    ? item.messages.filter((msg): msg is DouyinDmMessage => Boolean(msg && typeof msg === "object" && typeof (msg as DouyinDmMessage).text === "string"))
      .map(msg => ({
        id: msg.id || makeId("dm"),
        fromMe: msg.fromMe === true,
        text: cleanText(msg.text, 500),
        createdAt: cleanText(msg.createdAt, 40) || nowIso(),
      }))
    : [];
  return {
    id: item.id,
    peerName: cleanText(item.peerName, 40) || "好友",
    peerTone: cleanText(item.peerTone, 20) || "#999",
    unread: Number(item.unread) || 0,
    messages,
    updatedAt: cleanText(item.updatedAt, 40) || nowIso(),
    characterId: typeof item.characterId === "string" ? item.characterId : undefined,
  };
}

function normalizeLive(value: unknown): DouyinLiveRoom | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DouyinLiveRoom>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  const danmaku = Array.isArray(item.danmaku)
    ? item.danmaku.filter((d): d is DouyinDanmaku => Boolean(d && typeof d === "object" && typeof (d as DouyinDanmaku).text === "string"))
      .map(d => ({
        id: d.id || makeId("dk"),
        text: cleanText(d.text, 80),
        tone: cleanText(d.tone, 20) || "#fff",
        createdAt: cleanText(d.createdAt, 40) || nowIso(),
        fromMe: d.fromMe === true,
        authorName: cleanText(d.authorName, 40) || undefined,
        kind: d.kind,
        characterId: typeof d.characterId === "string" ? d.characterId : undefined,
      }))
    : [];
  return {
    id: item.id,
    hostName: cleanText(item.hostName, 40) || "主播",
    hostTone: cleanText(item.hostTone, 20) || "#fe2c55",
    title: cleanText(item.title, 80),
    viewers: Number(item.viewers) || 0,
    coverTone: cleanText(item.coverTone, 20) || "#1a1a2e",
    giftCoins: Number(item.giftCoins) || 0,
    settledGiftCoins: Number(item.settledGiftCoins) || 0,
    danmaku,
    status: item.status === "ended" ? "ended" : "live",
    startedAt: cleanText(item.startedAt, 40) || nowIso(),
    hostType: item.hostType === "user" || item.hostType === "character" || item.hostType === "npc" ? item.hostType : "npc",
    characterId: typeof item.characterId === "string" ? item.characterId : undefined,
    persona: cleanText(item.persona, 200) || undefined,
    spriteAssetId: typeof item.spriteAssetId === "string" ? item.spriteAssetId : undefined,
    speakLines: Array.isArray(item.speakLines)
      ? item.speakLines.map(line => cleanText(line, 160)).filter(Boolean).slice(-12)
      : [],
    pk: normalizePk(item.pk),
    viewerHints: Array.isArray(item.viewerHints)
      ? item.viewerHints.map(hint => cleanText(hint, 80)).filter(Boolean).slice(0, 12)
      : undefined,
  };
}

function normalizeAuthor(value: unknown): DouyinAuthor | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DouyinAuthor>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  return {
    id: item.id,
    name: cleanText(item.name, 40) || "创作者",
    handle: cleanText(item.handle, 40) || "user",
    avatarTone: cleanText(item.avatarTone, 20) || "#999",
    bio: cleanText(item.bio, 120) || undefined,
    followers: Number(item.followers) || 0,
    following: Number(item.following) || 0,
    source: normalizeSource(item.source) || "seed",
    characterId: typeof item.characterId === "string" ? item.characterId : undefined,
    persona: cleanText(item.persona, 200) || undefined,
    spriteAssetId: typeof item.spriteAssetId === "string" ? item.spriteAssetId : undefined,
    douyinId: cleanText(item.douyinId, 24) || `DY${100000 + Math.floor(Math.random() * 899999)}`,
    backgroundTone: cleanText(item.backgroundTone, 20) || "#161823",
    totalLikes: Math.max(0, Number(item.totalLikes) || 0),
  };
}

function normalizeSettings(raw: unknown): DouyinSettings {
  const fallback = defaultSettings();
  if (!raw || typeof raw !== "object") return fallback;
  const item = raw as Partial<DouyinSettings>;
  return {
    participantCharacterIds: Array.isArray(item.participantCharacterIds)
      ? item.participantCharacterIds.filter((id): id is string => typeof id === "string")
      : [],
    audienceDanmakuCount: Math.min(30, Math.max(5, Number(item.audienceDanmakuCount) || fallback.audienceDanmakuCount)),
    myTags: Array.isArray(item.myTags)
      ? item.myTags.map(tag => cleanText(tag, 16)).filter(Boolean).slice(0, 20)
      : [],
    searchHistory: Array.isArray(item.searchHistory)
      ? item.searchHistory.map(tag => cleanText(tag, 30)).filter(Boolean).slice(0, 12)
      : [],
  };
}

function normalizeState(raw: unknown): DouyinState {
  const fallback = createDefaultDouyinState();
  if (!raw || typeof raw !== "object") return fallback;
  const item = raw as Partial<DouyinState>;
  const sessionRaw = item.session && typeof item.session === "object" ? item.session as Partial<DouyinSession> : {};
  return {
    session: {
      loggedIn: sessionRaw.loggedIn === true,
      nickname: cleanText(sessionRaw.nickname, 40) || fallback.session.nickname,
      handle: cleanText(sessionRaw.handle, 40) || fallback.session.handle,
      avatarTone: cleanText(sessionRaw.avatarTone, 20) || fallback.session.avatarTone,
      bio: cleanText(sessionRaw.bio, 120) || fallback.session.bio,
      walletLinked: sessionRaw.walletLinked === true,
      followingIds: Array.isArray(sessionRaw.followingIds)
        ? sessionRaw.followingIds.filter((id): id is string => typeof id === "string")
        : [],
      followers: Number(sessionRaw.followers) || fallback.session.followers,
      persona: cleanText(sessionRaw.persona, 200) || fallback.session.persona,
      backgroundTone: cleanText(sessionRaw.backgroundTone, 20) || "#161823",
      collectedIds: Array.isArray(sessionRaw.collectedIds)
        ? sessionRaw.collectedIds.filter((id): id is string => typeof id === "string")
        : [],
    },
    settings: normalizeSettings(item.settings),
    authors: Array.isArray(item.authors) && item.authors.length > 0
      ? item.authors.map(normalizeAuthor).filter(Boolean) as DouyinAuthor[]
      : fallback.authors,
    videos: Array.isArray(item.videos) && item.videos.length > 0
      ? item.videos.map(normalizeVideo).filter(Boolean) as DouyinVideo[]
      : fallback.videos,
    threads: Array.isArray(item.threads)
      ? item.threads.map(normalizeThread).filter(Boolean) as DouyinDmThread[]
      : fallback.threads,
    liveRooms: Array.isArray(item.liveRooms) && item.liveRooms.length > 0
      ? item.liveRooms.map(normalizeLive).filter(Boolean) as DouyinLiveRoom[]
      : fallback.liveRooms,
    myLiveRoomId: typeof item.myLiveRoomId === "string" ? item.myLiveRoomId : null,
    updatedAt: cleanText(item.updatedAt, 40) || nowIso(),
  };
}

export function loadDouyinState(): DouyinState {
  if (typeof window === "undefined") return createDefaultDouyinState();
  try {
    const raw = kvGet(DOUYIN_STATE_KEY);
    if (!raw) return createDefaultDouyinState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultDouyinState();
  }
}

export function saveDouyinState(state: DouyinState): DouyinState {
  const next = { ...state, updatedAt: nowIso() };
  kvSet(DOUYIN_STATE_KEY, JSON.stringify(next));
  dispatchUpdated();
  return next;
}

export function updateDouyinSettings(patch: Partial<DouyinSettings>): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    settings: normalizeSettings({ ...state.settings, ...patch }),
  });
}

export function loginDouyinAccount(input?: { nickname?: string; handle?: string; persona?: string }): DouyinState {
  const state = loadDouyinState();
  const identity = resolveUserIdentity();
  const next = saveDouyinState({
    ...state,
    session: {
      ...state.session,
      loggedIn: true,
      nickname: cleanText(input?.nickname, 40) || identity?.name || state.session.nickname,
      handle: cleanText(input?.handle, 40) || state.session.handle,
      avatarTone: state.session.avatarTone,
      persona: cleanText(input?.persona, 200) || state.session.persona,
    },
  });
  return next;
}

export function logoutDouyinAccount(): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    session: { ...state.session, loggedIn: false, walletLinked: false },
    myLiveRoomId: null,
  });
}

export function linkDouyinWallet(linked = true): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    session: { ...state.session, walletLinked: linked },
  });
}

export function toggleDouyinLike(videoId: string): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    videos: state.videos.map(video => {
      if (video.id !== videoId) return video;
      const liked = !video.liked;
      return {
        ...video,
        liked,
        likeCount: Math.max(0, video.likeCount + (liked ? 1 : -1)),
      };
    }),
  });
}

export function toggleDouyinFollow(authorId: string): DouyinState {
  const state = loadDouyinState();
  const following = new Set(state.session.followingIds);
  if (following.has(authorId)) following.delete(authorId);
  else following.add(authorId);
  return saveDouyinState({
    ...state,
    session: { ...state.session, followingIds: [...following] },
    videos: state.videos.map(video => (
      video.authorId === authorId
        ? { ...video, followed: following.has(authorId) }
        : video
    )),
  });
}

export function addDouyinComment(videoId: string, text: string): DouyinState {
  const trimmed = cleanText(text, 280);
  if (!trimmed) return loadDouyinState();
  const state = loadDouyinState();
  const comment: DouyinComment = {
    id: makeId("cmt"),
    authorName: state.session.nickname || "我",
    authorTone: state.session.avatarTone,
    text: trimmed,
    likeCount: 0,
    liked: false,
    createdAt: nowIso(),
    authorType: "user",
  };
  return saveDouyinState({
    ...state,
    videos: state.videos.map(video => {
      if (video.id !== videoId) return video;
      const comments = [comment, ...video.comments];
      return { ...video, comments, commentCount: comments.length };
    }),
  });
}

export function sendDouyinDm(threadId: string, text: string): DouyinState {
  const trimmed = cleanText(text, 500);
  if (!trimmed) return loadDouyinState();
  const state = loadDouyinState();
  const message: DouyinDmMessage = {
    id: makeId("dm"),
    fromMe: true,
    text: trimmed,
    createdAt: nowIso(),
  };
  return saveDouyinState({
    ...state,
    threads: state.threads.map(thread => {
      if (thread.id !== threadId) return thread;
      return {
        ...thread,
        messages: [...thread.messages, message],
        updatedAt: nowIso(),
        unread: 0,
      };
    }),
  });
}

export function markDouyinThreadRead(threadId: string): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    threads: state.threads.map(thread => (
      thread.id === threadId ? { ...thread, unread: 0 } : thread
    )),
  });
}

export function appendDouyinDanmaku(
  roomId: string,
  text: string,
  options?: { fromMe?: boolean; authorName?: string; kind?: DouyinDanmaku["kind"]; characterId?: string; tone?: string },
): DouyinState {
  const trimmed = cleanText(text, 80);
  if (!trimmed) return loadDouyinState();
  const state = loadDouyinState();
  const fromMe = options?.fromMe === true;
  const item: DouyinDanmaku = {
    id: makeId("dk"),
    text: trimmed,
    tone: options?.tone || (fromMe ? "#25f4ee" : "#ffffff"),
    createdAt: nowIso(),
    fromMe,
    authorName: cleanText(options?.authorName, 40) || (fromMe ? state.session.nickname : undefined),
    kind: options?.kind || (fromMe ? "user" : "audience"),
    characterId: options?.characterId,
  };
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => {
      if (room.id !== roomId) return room;
      return { ...room, danmaku: [...room.danmaku.slice(-80), item] };
    }),
  });
}

export function appendDouyinDanmakuBatch(
  roomId: string,
  items: Array<{ text: string; authorName?: string; kind?: DouyinDanmaku["kind"]; characterId?: string; tone?: string }>,
): DouyinState {
  const state = loadDouyinState();
  const mapped: DouyinDanmaku[] = items
    .map(item => {
      const text = cleanText(item.text, 80);
      if (!text) return null;
      return {
        id: makeId("dk"),
        text,
        tone: item.tone || "#ffffff",
        createdAt: nowIso(),
        authorName: cleanText(item.authorName, 40) || "观众",
        kind: item.kind || "audience",
        characterId: item.characterId,
      } satisfies DouyinDanmaku;
    })
    .filter(Boolean) as DouyinDanmaku[];
  if (mapped.length === 0) return state;
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => {
      if (room.id !== roomId) return room;
      return { ...room, danmaku: [...room.danmaku, ...mapped].slice(-120) };
    }),
  });
}

export function addDouyinGift(roomId: string, coins: number): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => (
      room.id === roomId
        ? { ...room, giftCoins: room.giftCoins + Math.max(0, coins), viewers: room.viewers + 1 }
        : room
    )),
  });
}

export function updateDouyinLiveRoom(
  roomId: string,
  patch: Partial<Pick<DouyinLiveRoom, "viewers" | "giftCoins" | "speakLines" | "pk" | "persona" | "title" | "spriteAssetId" | "viewerHints">>,
): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        ...patch,
        speakLines: patch.speakLines
          ? [...(room.speakLines || []), ...patch.speakLines].map(line => cleanText(line, 160)).filter(Boolean).slice(-12)
          : room.speakLines,
      };
    }),
  });
}

export function startDouyinPk(roomId: string, opponentName: string, topic = "随便比一场"): DouyinState {
  return updateDouyinLiveRoom(roomId, {
    pk: {
      active: true,
      opponentName: cleanText(opponentName, 40) || "神秘对手",
      opponentTone: TONES[Math.floor(Math.random() * TONES.length)],
      myScore: 100 + Math.floor(Math.random() * 400),
      opponentScore: 80 + Math.floor(Math.random() * 420),
      topic: cleanText(topic, 40) || "随便比一场",
    },
  });
}

export function bumpDouyinPkScore(roomId: string, side: "me" | "opponent", amount = 10): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => {
      if (room.id !== roomId || !room.pk?.active) return room;
      return {
        ...room,
        pk: {
          ...room.pk,
          myScore: room.pk.myScore + (side === "me" ? amount : 0),
          opponentScore: room.pk.opponentScore + (side === "opponent" ? amount : 0),
        },
      };
    }),
  });
}

export function endDouyinPk(roomId: string): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => (
      room.id === roomId ? { ...room, pk: room.pk ? { ...room.pk, active: false } : null } : room
    )),
  });
}

function buildViewerHintsFromPersona(persona: string): string[] {
  const base = [
    "路人吃播粉",
    "夜里刷手机的学生",
    "同城围观群众",
    "刷礼物的大哥",
    "安静潜水党",
    "起哄架秧子",
    "认真提问的新人",
    "老粉报到",
  ];
  const seed = persona.length + persona.charCodeAt(0);
  return base.map((item, index) => `${item}·人设感${(seed + index) % 9}`).slice(0, 6);
}

export function startMyDouyinLive(title: string, options?: { spriteAssetId?: string }): DouyinState {
  const state = loadDouyinState();
  const persona = state.session.persona || "普通抖音用户";
  const fame = Math.max(20, Math.min(8000, Math.round(state.session.followers * (0.2 + Math.random()))));
  const room: DouyinLiveRoom = {
    id: makeId("live"),
    hostName: state.session.nickname || "我",
    hostTone: state.session.avatarTone,
    title: cleanText(title, 80) || `${state.session.nickname}的直播间`,
    viewers: Math.max(3, fame),
    coverTone: "#12121a",
    giftCoins: 0,
    settledGiftCoins: 0,
    danmaku: [
      { id: makeId("dk"), text: "来了来了", tone: "#fff", createdAt: nowIso(), kind: "audience", authorName: "早到的人" },
      { id: makeId("dk"), text: "主播好", tone: "#25f4ee", createdAt: nowIso(), kind: "audience", authorName: "潜水员" },
    ],
    status: "live",
    startedAt: nowIso(),
    hostType: "user",
    persona,
    spriteAssetId: options?.spriteAssetId,
    speakLines: [],
    viewerHints: buildViewerHintsFromPersona(persona),
  };
  return saveDouyinState({
    ...state,
    liveRooms: [room, ...state.liveRooms],
    myLiveRoomId: room.id,
  });
}

export function settleDouyinLiveGifts(roomId: string): { state: DouyinState; credited: number } {
  const state = loadDouyinState();
  const room = state.liveRooms.find(item => item.id === roomId);
  if (!room) return { state, credited: 0 };
  const unsettled = Math.max(0, room.giftCoins - (room.settledGiftCoins || 0));
  if (unsettled <= 0) return { state, credited: 0 };
  if (room.hostType === "user" || room.id === state.myLiveRoomId) {
    creditWalletBalance(
      unsettled,
      "抖音直播礼物入账",
      `「${room.title}」礼物折合余额`,
      "抖音",
    );
  }
  const next = saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(item => (
      item.id === roomId ? { ...item, settledGiftCoins: item.giftCoins } : item
    )),
  });
  return { state: next, credited: unsettled };
}

export function endMyDouyinLive(): DouyinState {
  const state = loadDouyinState();
  if (!state.myLiveRoomId) return state;
  const roomId = state.myLiveRoomId;
  const settled = settleDouyinLiveGifts(roomId);
  return saveDouyinState({
    ...settled.state,
    liveRooms: settled.state.liveRooms.map(room => (
      room.id === roomId ? { ...room, status: "ended" } : room
    )),
    myLiveRoomId: null,
  });
}

export function endDouyinLiveRoom(roomId: string): DouyinState {
  const settled = settleDouyinLiveGifts(roomId);
  return saveDouyinState({
    ...settled.state,
    liveRooms: settled.state.liveRooms.map(room => (
      room.id === roomId ? { ...room, status: "ended" } : room
    )),
    myLiveRoomId: settled.state.myLiveRoomId === roomId ? null : settled.state.myLiveRoomId,
  });
}

export function upsertDouyinAuthor(author: DouyinAuthor): DouyinState {
  const state = loadDouyinState();
  const exists = state.authors.some(item => item.id === author.id);
  return saveDouyinState({
    ...state,
    authors: exists
      ? state.authors.map(item => (item.id === author.id ? { ...item, ...author } : item))
      : [author, ...state.authors],
  });
}

export function publishDouyinVideo(
  caption: string,
  options?: {
    authorId?: string;
    music?: string;
    coverTone?: string;
    likeCount?: number;
    shareCount?: number;
    comments?: DouyinComment[];
    source?: DouyinAuthorSource;
    characterId?: string;
  },
): DouyinState {
  const state = loadDouyinState();
  const comments = options?.comments || [];
  const video: DouyinVideo = {
    id: makeId("vid"),
    authorId: options?.authorId || "self",
    caption: cleanText(caption, 240) || "分享日常生活",
    music: cleanText(options?.music, 80) || "原声 · 我",
    coverTone: cleanText(options?.coverTone, 20) || "#161823",
    likeCount: Math.max(0, Number(options?.likeCount) || 0),
    commentCount: comments.length,
    shareCount: Math.max(0, Number(options?.shareCount) || 0),
    liked: false,
    followed: false,
    comments,
    createdAt: nowIso(),
    source: options?.source || "user",
    characterId: options?.characterId,
  };
  return saveDouyinState({
    ...state,
    videos: [video, ...state.videos],
  });
}

export function replaceDouyinNpcLiveRooms(rooms: DouyinLiveRoom[], authors: DouyinAuthor[] = []): DouyinState {
  const state = loadDouyinState();
  const kept = state.liveRooms.filter(room => room.hostType === "user" || room.hostType === "character" || room.id === state.myLiveRoomId);
  const authorMap = new Map(state.authors.map(item => [item.id, item]));
  for (const author of authors) authorMap.set(author.id, author);
  return saveDouyinState({
    ...state,
    authors: [...authorMap.values()],
    liveRooms: [...rooms.filter(room => room.status === "live"), ...kept],
  });
}

export function addDouyinLiveRoom(room: DouyinLiveRoom, author?: DouyinAuthor): DouyinState {
  const state = loadDouyinState();
  const authors = author
    ? (state.authors.some(item => item.id === author.id)
      ? state.authors.map(item => (item.id === author.id ? author : item))
      : [author, ...state.authors])
    : state.authors;
  return saveDouyinState({
    ...state,
    authors,
    liveRooms: [room, ...state.liveRooms.filter(item => item.id !== room.id)],
  });
}

export function makeDouyinId(prefix: string): string {
  return makeId(prefix);
}

export function updateDouyinProfile(patch: Partial<Pick<DouyinSession, "nickname" | "handle" | "bio" | "backgroundTone" | "avatarTone" | "persona">>): DouyinState {
  const state = loadDouyinState();
  const session = { ...state.session };
  if (patch.nickname !== undefined) session.nickname = cleanText(patch.nickname, 40) || session.nickname;
  if (patch.handle !== undefined) session.handle = cleanText(patch.handle, 40) || session.handle;
  if (patch.bio !== undefined) session.bio = cleanText(patch.bio, 120);
  if (patch.backgroundTone !== undefined) session.backgroundTone = cleanText(patch.backgroundTone, 20) || session.backgroundTone;
  if (patch.avatarTone !== undefined) session.avatarTone = cleanText(patch.avatarTone, 20) || session.avatarTone;
  if (patch.persona !== undefined) session.persona = cleanText(patch.persona, 200) || session.persona;
  return saveDouyinState({ ...state, session });
}

export function toggleDouyinCollect(videoId: string): DouyinState {
  const state = loadDouyinState();
  const collected = new Set(state.session.collectedIds);
  if (collected.has(videoId)) collected.delete(videoId);
  else collected.add(videoId);
  return saveDouyinState({
    ...state,
    session: { ...state.session, collectedIds: [...collected] },
  });
}

export function setDouyinVideoImage(videoId: string, imageUrl?: string, imagePrompt?: string): DouyinState {
  const state = loadDouyinState();
  return saveDouyinState({
    ...state,
    videos: state.videos.map(video => {
      if (video.id !== videoId) return video;
      return {
        ...video,
        imageUrl: imageUrl !== undefined ? imageUrl : video.imageUrl,
        imagePrompt: imagePrompt !== undefined ? imagePrompt : video.imagePrompt,
      };
    }),
  });
}

export function ensureDouyinThread(peerName: string, peerTone = "#999", characterId?: string): string {
  const state = loadDouyinState();
  const existing = state.threads.find(thread =>
    (characterId && thread.characterId === characterId)
    || (!characterId && thread.peerName === peerName),
  );
  if (existing) return existing.id;
  const thread: DouyinDmThread = {
    id: makeId("dm"),
    peerName: cleanText(peerName, 40) || "好友",
    peerTone: cleanText(peerTone, 20) || "#999",
    unread: 0,
    messages: [],
    updatedAt: nowIso(),
    characterId,
  };
  saveDouyinState({ ...state, threads: [thread, ...state.threads] });
  return thread.id;
}

export function formatDouyinCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1).replace(/\.0$/, "")}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.max(0, Math.round(count)));
}

export { TONES as DOUYIN_TONES };
