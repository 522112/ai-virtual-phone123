import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { resolveUserIdentity } from "./settings-storage";
import type {
  DouyinAuthor,
  DouyinComment,
  DouyinDanmaku,
  DouyinDmMessage,
  DouyinDmThread,
  DouyinLiveRoom,
  DouyinSession,
  DouyinState,
  DouyinVideo,
} from "./douyin-types";

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

const SEED_AUTHORS: DouyinAuthor[] = [
  { id: "dy_a_aurora", name: "极光小七", handle: "aurora7", avatarTone: "#ff6b9d", bio: "夜景猎人", followers: 128000, following: 86 },
  { id: "dy_a_chef", name: "深夜食堂", handle: "midnightsoup", avatarTone: "#ff9f43", bio: "一人食也可以很热闹", followers: 92000, following: 41 },
  { id: "dy_a_cat", name: "橘座本座", handle: "orangecat", avatarTone: "#f5c542", bio: "喵了个咪", followers: 210000, following: 12 },
  { id: "dy_a_city", name: "街角慢镜", handle: "slowcity", avatarTone: "#54a0ff", bio: "城市声景", followers: 64000, following: 203 },
  { id: "dy_a_dance", name: "不绊脚", handle: "stepsoft", avatarTone: "#5f27cd", bio: "练舞日记", followers: 305000, following: 58 },
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
      status: "live",
      startedAt: now,
      danmaku: [
        { id: "dy_dk_1", text: "老板再来一碗", tone: "#fff", createdAt: now },
        { id: "dy_dk_2", text: "香味隔着屏幕都闻到了", tone: "#25f4ee", createdAt: now },
        { id: "dy_dk_3", text: "前方高能炒勺", tone: "#fe2c55", createdAt: now },
      ],
    },
    {
      id: "dy_live_2",
      hostName: "不绊脚",
      hostTone: "#5f27cd",
      title: "练习室公开练舞",
      viewers: 4200,
      coverTone: "#1b1430",
      giftCoins: 980,
      status: "live",
      startedAt: now,
      danmaku: [
        { id: "dy_dk_4", text: "这段手位太丝滑了", tone: "#25f4ee", createdAt: now },
        { id: "dy_dk_5", text: "老师再放慢一倍！", tone: "#fff", createdAt: now },
      ],
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
  };
}

export function createDefaultDouyinState(): DouyinState {
  return {
    session: defaultSession(),
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
    danmaku,
    status: item.status === "ended" ? "ended" : "live",
    startedAt: cleanText(item.startedAt, 40) || nowIso(),
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
    },
    authors: Array.isArray(item.authors) && item.authors.length > 0
      ? item.authors.filter((a): a is DouyinAuthor => Boolean(a && typeof a === "object" && typeof (a as DouyinAuthor).id === "string"))
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

export function loginDouyinAccount(input?: { nickname?: string; handle?: string }): DouyinState {
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

export function appendDouyinDanmaku(roomId: string, text: string, fromMe = false): DouyinState {
  const trimmed = cleanText(text, 80);
  if (!trimmed) return loadDouyinState();
  const state = loadDouyinState();
  const item: DouyinDanmaku = {
    id: makeId("dk"),
    text: trimmed,
    tone: fromMe ? "#25f4ee" : "#ffffff",
    createdAt: nowIso(),
    fromMe,
  };
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => {
      if (room.id !== roomId) return room;
      return { ...room, danmaku: [...room.danmaku.slice(-40), item] };
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

export function startMyDouyinLive(title: string): DouyinState {
  const state = loadDouyinState();
  const room: DouyinLiveRoom = {
    id: makeId("live"),
    hostName: state.session.nickname || "我",
    hostTone: state.session.avatarTone,
    title: cleanText(title, 80) || `${state.session.nickname}的直播间`,
    viewers: 1,
    coverTone: "#12121a",
    giftCoins: 0,
    danmaku: [
      { id: makeId("dk"), text: "来了来了", tone: "#fff", createdAt: nowIso() },
      { id: makeId("dk"), text: "主播好", tone: "#25f4ee", createdAt: nowIso() },
    ],
    status: "live",
    startedAt: nowIso(),
  };
  return saveDouyinState({
    ...state,
    liveRooms: [room, ...state.liveRooms],
    myLiveRoomId: room.id,
  });
}

export function endMyDouyinLive(): DouyinState {
  const state = loadDouyinState();
  if (!state.myLiveRoomId) return state;
  return saveDouyinState({
    ...state,
    liveRooms: state.liveRooms.map(room => (
      room.id === state.myLiveRoomId ? { ...room, status: "ended" } : room
    )),
    myLiveRoomId: null,
  });
}

export function publishDouyinVideo(caption: string): DouyinState {
  const state = loadDouyinState();
  const video: DouyinVideo = {
    id: makeId("vid"),
    authorId: "self",
    caption: cleanText(caption, 240) || "分享日常生活",
    music: "原声 · 我",
    coverTone: "#161823",
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    liked: false,
    followed: false,
    comments: [],
    createdAt: nowIso(),
  };
  return saveDouyinState({
    ...state,
    videos: [video, ...state.videos],
  });
}

export function formatDouyinCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1).replace(/\.0$/, "")}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.max(0, Math.round(count)));
}
