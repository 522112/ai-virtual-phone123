export type DouyinTabId = "home" | "friends" | "create" | "inbox" | "profile";

export type DouyinAuthorSource = "seed" | "npc" | "character" | "user";

export type DouyinAuthor = {
  id: string;
  name: string;
  handle: string;
  avatarTone: string;
  bio?: string;
  followers: number;
  following: number;
  source?: DouyinAuthorSource;
  characterId?: string;
  persona?: string;
  spriteAssetId?: string;
};

export type DouyinComment = {
  id: string;
  authorName: string;
  authorTone: string;
  text: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  authorType?: "user" | "character" | "npc";
  characterId?: string;
};

export type DouyinVideo = {
  id: string;
  authorId: string;
  caption: string;
  music: string;
  coverTone: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  liked: boolean;
  followed: boolean;
  comments: DouyinComment[];
  createdAt: string;
  source?: DouyinAuthorSource;
  characterId?: string;
};

export type DouyinDmMessage = {
  id: string;
  fromMe: boolean;
  text: string;
  createdAt: string;
};

export type DouyinDmThread = {
  id: string;
  peerName: string;
  peerTone: string;
  unread: number;
  messages: DouyinDmMessage[];
  updatedAt: string;
};

export type DouyinDanmakuKind = "audience" | "character" | "user" | "system" | "host";

export type DouyinDanmaku = {
  id: string;
  text: string;
  tone: string;
  createdAt: string;
  fromMe?: boolean;
  authorName?: string;
  kind?: DouyinDanmakuKind;
  characterId?: string;
};

export type DouyinPkState = {
  active: boolean;
  opponentName: string;
  opponentTone: string;
  myScore: number;
  opponentScore: number;
  topic: string;
};

export type DouyinLiveHostType = "user" | "character" | "npc";

export type DouyinLiveRoom = {
  id: string;
  hostName: string;
  hostTone: string;
  title: string;
  viewers: number;
  coverTone: string;
  giftCoins: number;
  settledGiftCoins: number;
  danmaku: DouyinDanmaku[];
  status: "live" | "ended";
  startedAt: string;
  hostType?: DouyinLiveHostType;
  characterId?: string;
  persona?: string;
  spriteAssetId?: string;
  speakLines?: string[];
  pk?: DouyinPkState | null;
  viewerHints?: string[];
};

export type DouyinSession = {
  loggedIn: boolean;
  nickname: string;
  handle: string;
  avatarTone: string;
  bio: string;
  walletLinked: boolean;
  followingIds: string[];
  followers: number;
  persona?: string;
};

export type DouyinSettings = {
  participantCharacterIds: string[];
  audienceDanmakuCount: number;
};

export type DouyinNpcPortrait = {
  id: string;
  name: string;
  assetId: string;
  tags?: string[];
  createdAt: string;
};

export type DouyinState = {
  session: DouyinSession;
  settings: DouyinSettings;
  authors: DouyinAuthor[];
  videos: DouyinVideo[];
  threads: DouyinDmThread[];
  liveRooms: DouyinLiveRoom[];
  myLiveRoomId: string | null;
  updatedAt: string;
};

export type ParsedDouyinCharacterActivity = {
  shouldPublish: boolean;
  caption?: string;
  music?: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  comments?: Array<{ authorName: string; text: string }>;
  reason?: string;
};

export type ParsedDouyinAudienceDanmaku = {
  viewers?: number;
  items: Array<{ authorName: string; text: string }>;
};

export type ParsedDouyinCharacterLive = {
  speak?: string;
  danmaku?: string;
  giftCoins?: number;
  giftLabel?: string;
  joinPk?: boolean;
  pkTopic?: string;
};

export type ParsedDouyinNpcLiveHost = {
  name: string;
  handle: string;
  title: string;
  persona: string;
  viewers: number;
  coverTone: string;
  hostTone: string;
  speak?: string;
};

export const DEFAULT_DOUYIN_SETTINGS: DouyinSettings = {
  participantCharacterIds: [],
  audienceDanmakuCount: 15,
};

export const DEFAULT_DOUYIN_NPC_LIVE_PROMPT = [
  "你在生成抖音直播间的路人主播人设。",
  "根据给定立绘名称与标签，输出一位主播的昵称、抖音号、直播标题、人设简介、观看人数与开场白。",
  "人设要口语化、碎片化，符合抖音直播氛围；不要输出 Markdown。",
  "",
  "输出格式：",
  "#主播1",
  "[昵称]主播昵称",
  "[抖音号]handle",
  "[标题]直播间标题",
  "[人设]一两句人设",
  "[观看]数字",
  "[封面色]#1a1a2e",
  "[头像色]#fe2c55",
  "[开场]开场讲话",
].join("\n");

export const DEFAULT_DOUYIN_AUDIENCE_DANMAKU_PROMPT = [
  "你在模拟抖音直播间的路人观众弹幕。",
  "根据直播间标题、主播人设和刚刚发生的互动，输出恰好 15 条路人弹幕。",
  "作者昵称各自不同，内容短、口语化，可有刷礼物感叹、起哄、提问。",
  "可同时给出合理的当前观看人数。不要输出 Markdown。",
  "",
  "输出格式：",
  "[观看]数字",
  "#弹幕1",
  "[作者]路人昵称",
  "[内容]弹幕内容",
  "#弹幕2",
  "...共 15 条",
].join("\n");

export const DEFAULT_DOUYIN_CHARACTER_ACTIVITY_PROMPT = [
  "你正在以{{char}}的身份使用抖音。",
  "根据人设、记忆与近期状态，判断是否要发布一条短视频动态。",
  "如果发布，给出文案、BGM 名，以及符合人设热度的点赞/评论/分享数和少量路人评论。",
  "如果不适合发，明确说明不发布。只输出块格式。",
  "",
  "当前抖音推荐流摘要：",
  "{{douyinFeedContext}}",
  "",
  "输出格式：",
  "#动态1",
  "[发布]是或否",
  "[文案]视频文案",
  "[音乐]BGM名",
  "[点赞]数字",
  "[评论数]数字",
  "[分享]数字",
  "[理由]简短理由",
  "[评论1作者]路人",
  "[评论1内容]内容",
].join("\n");

export const DEFAULT_DOUYIN_CHARACTER_LIVE_PROMPT = [
  "你正在以{{char}}的身份参与抖音直播。",
  "场景上下文：",
  "{{douyinLiveContext}}",
  "",
  "根据人设决定：是否讲话、发弹幕、刷礼物（金额与礼物名）、是否发起/回应 PK。",
  "只输出块格式，不要 Markdown。",
  "",
  "输出格式：",
  "#互动1",
  "[讲话]主播或观众讲话，可空",
  "[弹幕]角色弹幕，可空",
  "[礼物]数字，0 表示不送",
  "[礼物名]小心心/玫瑰/火箭等",
  "[PK]是或否",
  "[PK主题]主题，可空",
].join("\n");
