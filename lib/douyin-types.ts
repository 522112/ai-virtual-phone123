export type DouyinTabId = "home" | "friends" | "create" | "inbox" | "profile";

export type DouyinAuthor = {
  id: string;
  name: string;
  handle: string;
  avatarTone: string;
  bio?: string;
  followers: number;
  following: number;
};

export type DouyinComment = {
  id: string;
  authorName: string;
  authorTone: string;
  text: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
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

export type DouyinDanmaku = {
  id: string;
  text: string;
  tone: string;
  createdAt: string;
  fromMe?: boolean;
};

export type DouyinLiveRoom = {
  id: string;
  hostName: string;
  hostTone: string;
  title: string;
  viewers: number;
  coverTone: string;
  giftCoins: number;
  danmaku: DouyinDanmaku[];
  status: "live" | "ended";
  startedAt: string;
};

export type DouyinSession = {
  loggedIn: boolean;
  nickname: string;
  handle: string;
  avatarTone: string;
  bio: string;
  walletLinked: boolean;
  followingIds: string[];
};

export type DouyinState = {
  session: DouyinSession;
  authors: DouyinAuthor[];
  videos: DouyinVideo[];
  threads: DouyinDmThread[];
  liveRooms: DouyinLiveRoom[];
  myLiveRoomId: string | null;
  updatedAt: string;
};
