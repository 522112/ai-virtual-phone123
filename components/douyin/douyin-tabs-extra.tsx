"use client";

import {
  ChevronLeft,
  Gift,
  Heart,
  ImagePlus,
  MessageCircle,
  Pencil,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  Star,
  Swords,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";

import { formatDouyinCount } from "@/lib/douyin-storage";
import type {
  DouyinAuthor,
  DouyinLiveRoom,
  DouyinNpcPortrait,
  DouyinState,
  DouyinVideo,
} from "@/lib/douyin-types";

// Chinese copy as unicode escapes (file stays ASCII).
const S = {
  searchPh: "\u4f60\u60f3\u770b\u4ec0\u4e48",
  searchOk: "\u786e\u5b9a",
  recentSearch: "\u6700\u8fd1\u770b\u8fc7",
  myTags: "\u6211\u7684\u6807\u7b7e",
  tagPh: "\u8f93\u5165\u6807\u7b7e\u540d",
  addTag: "\u52a0\u6807\u7b7e",
  works: "\u4f5c\u54c1",
  want: "\u60f3\u770b",
  liked: "\u559c\u6b22",
  recommend: "\u63a8\u8350",
  follow: "\u5173\u6ce8",
  feed: "\u70ed\u95e8",
  live: "\u76f4\u64ad",
  followers: "\u7c89\u4e1d",
  editHome: "\u4e3b\u9875\u8bbe\u7f6e",
  settings: "\u8bbe\u7f6e",
  addFriend: "\u52a0\u597d\u53cb",
  publish: "\u53d1\u4f5c\u54c1",
  goLive: "\u5f00\u64ad",
  logout: "\u9000\u51fa\u767b\u5f55",
  wallet: "\u804a\u5929\u94b1\u5305",
  linkWallet: "\u8fde\u63a5\u94b1\u5305",
  unlink: "\u65ad\u5f00",
  sendDm: "\u53d1\u79c1\u4fe1",
  followed: "\u5df2\u5173\u6ce8",
  followBtn: "\u5173\u6ce8",
  personaTip: "\u6309\u4eba\u8bbe\u751f\u6210",
  living: "\u76f4\u64ad\u4e2d",
  say: "\u8bf4\u70b9\u4ec0\u4e48",
  send: "\u53d1\u9001",
  share: "\u5206\u4eab",
  shareLive: "\u5206\u4eab\u76f4\u64ad\u95f4",
  genCover: "\u751f\u6210\u5c01\u9762",
  generating: "\u751f\u6210\u4e2d",
  empty: "\u8fd8\u6ca1\u6709\u5185\u5bb9",
  comments: "\u6761\u8bc4\u8bba",
  sofa: "\u62a2\u6c99\u53d1",
  kindPh: "\u53cb\u5584\u8bc4\u8bba",
  startChat: "\u5f00\u59cb\u804a\u5929",
  viewHome: "\u770b\u4e3b\u9875",
  followEmpty: "\u5173\u6ce8\u4e00\u4e9b\u521b\u4f5c\u8005\u540e\u518d\u6765\u770b",
  feedEmpty: "\u70b9\u4e0a\u9762\u5237\u65b0\u4e00\u6b21\u751f\u621010\u6761\u63a8\u8350",
  liveEmpty: "\u70b9\u4e0a\u9762\u5237\u65b0\u4e00\u6b21\u751f\u62107\u4e2a\u76f4\u64ad\u95f4",
  fail: "\u5931\u8d25",
  del: "\u5220\u9664",
  upload: "\u4e0a\u4f20\u7acb\u7ed8",
  save: "\u4fdd\u5b58",
  close: "\u5173\u95ed",
  noChar: "\u6682\u65e0\u89d2\u8272",
  add: "\u52a0",
  endLive: "\u7ed3\u675f\u76f4\u64ad",
  endPk: "\u7ed3\u675fPK",
  pk: "PK",
  burst: "\u5237\u5f39\u5e55",
  back: "\u8fd4\u56de",
  entryHint: "\u5148\u8f93\u5165\u518d\u70b9\u786e\u5b9a",
};

export function DyAvatar({ name, tone, size = 44 }: { name: string; tone: string; size?: number }) {
  return (
    <span className="dy-avatar" style={{ width: size, height: size, background: tone, fontSize: size > 50 ? 22 : 14 }}>
      {(name || "?").slice(0, 1)}
    </span>
  );
}

export function myVideoLikes(state: DouyinState): number {
  return state.videos
    .filter(v => v.authorId === "self" || v.source === "user")
    .reduce((sum, v) => sum + v.likeCount, 0);
}

type AuthorLite = { name: string; avatarTone: string; handle: string };

export function VideoClipX({ video, author, followed, collected, generatingImage, onLike, onFollow, onComment, onCollect, onShare, onGenImage, onAuthor }: {
  video: DouyinVideo;
  author: AuthorLite;
  followed: boolean;
  collected: boolean;
  generatingImage: boolean;
  onLike: () => void;
  onFollow: () => void;
  onComment: () => void;
  onCollect: () => void;
  onShare: () => void;
  onGenImage: () => void;
  onAuthor: () => void;
}) {
  return (
    <article className="dy-clip">
      {video.imageUrl ? (
        <div className="dy-clip-stage" style={{ background: `url(${video.imageUrl}) center/cover no-repeat, ${video.coverTone}` }} />
      ) : (
        <div className="dy-clip-stage" style={{ backgroundColor: video.coverTone }}>
          {video.imagePrompt ? (
            <div className="dy-clip-imgdesc">
              <p>{video.imagePrompt.slice(0, 120)}{video.imagePrompt.length > 120 ? "..." : ""}</p>
              <button type="button" onClick={e => { e.stopPropagation(); onGenImage(); }} disabled={generatingImage}>
                <ImagePlus size={12} style={{ display: "inline", marginRight: 4 }} />
                {generatingImage ? S.generating : S.genCover}
              </button>
            </div>
          ) : null}
        </div>
      )}
      <div className="dy-clip-meta">
        <button type="button" className="dy-clip-author" onClick={onAuthor}>@{author.name}</button>
        <div className="dy-clip-caption">{video.caption}</div>
        {video.tags && video.tags.length > 0 ? (
          <div className="dy-clip-tags">{video.tags.map(t => <span key={t}>#{t}</span>)}</div>
        ) : null}
        <div className="dy-clip-music">BGM {video.music}</div>
      </div>
      <div className="dy-rail">
        <button type="button" className="dy-avatar-btn" onClick={onFollow}>
          <span className="dy-avatar" style={{ background: author.avatarTone }}>{author.name.slice(0, 1)}
            {!followed ? <span className="dy-follow-dot">+</span> : null}
          </span>
        </button>
        <button type="button" className="dy-rail-btn" {...(video.liked ? { "data-on": "" } : {})} onClick={onLike}>
          <Heart size={28} {...(video.liked ? { fill: "currentColor" } : {})} />
          <span>{formatDouyinCount(video.likeCount)}</span>
        </button>
        <button type="button" className="dy-rail-btn" onClick={onComment}>
          <MessageCircle size={28} />
          <span>{formatDouyinCount(video.commentCount)}</span>
        </button>
        <button type="button" className="dy-rail-btn" {...(collected ? { "data-on": "" } : {})} onClick={onCollect}>
          <Star size={28} {...(collected ? { fill: "currentColor" } : {})} />
          <span>{S.want}</span>
        </button>
        <button type="button" className="dy-rail-btn" onClick={onShare}>
          <Share2 size={28} />
          <span>{formatDouyinCount(video.shareCount)}</span>
        </button>
      </div>
    </article>
  );
}

export function FeedViewX({ videos, scope, onScope, authors, followingIds, collectedIds, myTags, onClose, onSearch, onRefresh, refreshing, onLike, onFollow, onComment, onCollect, onShare, onGenImage, generatingImageId, onAuthor }: {
  videos: DouyinVideo[];
  scope: "recommend" | "follow";
  onScope: (scope: "recommend" | "follow") => void;
  authors: Map<string, AuthorLite>;
  followingIds: string[];
  collectedIds: string[];
  myTags: string[];
  onClose: () => void;
  onSearch: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLike: (id: string) => void;
  onFollow: (id: string) => void;
  onComment: (id: string) => void;
  onCollect: (id: string) => void;
  onShare: () => void;
  onGenImage: (id: string) => void;
  generatingImageId: string | null;
  onAuthor: (authorId: string) => void;
}) {
  return (
    <div style={{ height: "100%", position: "relative" }}>
      <div className="dy-topbar">
        <button type="button" className="dy-icon-btn" aria-label={S.back} onClick={onClose}><ChevronLeft size={18} /></button>
        <div className="dy-top-tabs">
          <button type="button" {...(scope === "follow" ? { "data-active": "" } : {})} onClick={() => onScope("follow")}>{S.follow}</button>
          <button type="button" {...(scope === "recommend" ? { "data-active": "" } : {})} onClick={() => onScope("recommend")}>{S.recommend}/{S.feed}</button>
        </div>
        <div className="dy-top-actions">
          <button type="button" className="dy-icon-btn" aria-label="refresh" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={16} />
          </button>
          <button type="button" className="dy-icon-btn" aria-label="search" onClick={onSearch}>
            <Search size={16} />
          </button>
        </div>
      </div>
      {myTags.length > 0 && scope === "recommend" ? (
        <div className="dy-tag-row">{myTags.map(t => <span key={t} className="dy-tag-chip">#{t}</span>)}</div>
      ) : null}
      <div className="dy-feed">
        {videos.length === 0 ? (
          <div className="dy-clip" style={{ background: "#12121a" }}>
            <div className="dy-empty" style={{ margin: "auto" }}>{scope === "follow" ? S.followEmpty : S.feedEmpty}</div>
          </div>
        ) : null}
        {videos.map(video => {
          const author = video.authorId === "self"
            ? { name: "me", avatarTone: "#25f4ee", handle: "me" }
            : authors.get(video.authorId) || { name: "creator", avatarTone: "#666", handle: "user" };
          const followed = followingIds.includes(video.authorId) || video.followed;
          return (
            <VideoClipX
              key={video.id}
              video={video}
              author={author}
              followed={followed}
              collected={collectedIds.includes(video.id)}
              generatingImage={generatingImageId === video.id}
              onLike={() => onLike(video.id)}
              onFollow={() => onFollow(video.authorId)}
              onComment={() => onComment(video.id)}
              onCollect={() => onCollect(video.id)}
              onShare={onShare}
              onGenImage={() => onGenImage(video.id)}
              onAuthor={() => onAuthor(video.authorId)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function CommentSheetX({ video, draft, onDraft, onClose, onSend }: {
  video: DouyinVideo;
  draft: string;
  onDraft: (v: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <div className="dy-sheet" onClick={onClose}>
      <div className="dy-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="dy-sheet-head">
          <span>{video.commentCount} {S.comments}</span>
          <button type="button" aria-label={S.close} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dy-sheet-list">
          {video.comments.length === 0 ? <div className="dy-empty">{S.sofa}</div> : null}
          {video.comments.map(comment => (
            <div key={comment.id} className="dy-comment">
              <DyAvatar name={comment.authorName} tone={comment.authorTone} size={32} />
              <div style={{ flex: 1 }}>
                <strong>{comment.authorName}</strong>
                <p>{comment.text}</p>
              </div>
              <span className="dy-comment-likes"><Heart size={12} /> {formatDouyinCount(comment.likeCount)}</span>
            </div>
          ))}
        </div>
        <div className="dy-sheet-input">
          <input
            value={draft}
            onChange={e => onDraft(e.target.value)}
            placeholder={S.kindPh}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button type="button" onClick={onSend}>{S.send}</button>
        </div>
      </div>
    </div>
  );
}

export function LiveTabX({ rooms, onClose, onRefresh, refreshing, busy, onEnter }: {
  rooms: DouyinLiveRoom[];
  onClose: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  busy: string;
  onEnter: (id: string) => void;
}) {
  return (
    <div className="dy-live-tab">
      <div className="dy-topbar dy-topbar-dark">
        <button type="button" className="dy-icon-btn" aria-label={S.back} onClick={onClose}><ChevronLeft size={18} /></button>
        <strong>{S.live}</strong>
        <button type="button" className="dy-icon-btn" aria-label="refresh" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={16} />
        </button>
      </div>
      {busy ? <div className="dy-busy">{busy}</div> : null}
      <div className="dy-live-swipe">
        {rooms.length === 0 ? (
          <div className="dy-live-swipe-page" style={{ background: "#0a0a0c" }}>
            <div className="dy-empty" style={{ margin: "auto" }}>{S.liveEmpty}</div>
          </div>
        ) : null}
        {rooms.map(room => (
          <button key={room.id} type="button" className="dy-live-swipe-page" onClick={() => onEnter(room.id)}>
            <RoomTile room={room} />
          </button>
        ))}
      </div>
    </div>
  );
}

function RoomTile({ room }: { room: DouyinLiveRoom }) {
  return (
    <div className="dy-live-swipe-cover" style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.72)), ${room.coverTone}` }}>
      <span className="dy-live-bigbadge"><Radio size={12} /> {S.living}</span>
      <div className="dy-live-swipe-info">
        <strong>{room.hostName}</strong>
        <p>{room.title}</p>
        <span>{formatDouyinCount(room.viewers)} watching{room.hostType === "character" ? " | role" : ""}</span>
      </div>
    </div>
  );
}

export function LiveRoomX({ room, isHost, walletLinked, spriteUrl, busy, showEmoji, showGifts, onToggleEmoji, onToggleGifts, onClose, onFollowHost, onDanmaku, draft, onDraft, onGift, onForward, onSpeak, onPk, onBurst, onEnd }: {
  room: DouyinLiveRoom;
  isHost: boolean;
  walletLinked: boolean;
  spriteUrl: string | null;
  busy: string;
  showEmoji: boolean;
  showGifts: boolean;
  onToggleEmoji: () => void;
  onToggleGifts: () => void;
  onClose: () => void;
  onFollowHost: () => void;
  onDanmaku: (text: string) => void;
  draft: string;
  onDraft: (value: string) => void;
  onGift: (coins: number, label: string) => void;
  onForward: () => void;
  onSpeak: (text: string) => void;
  onPk: () => void;
  onBurst: () => void;
  onEnd: () => void;
}) {
  const recent = room.danmaku.slice(-30);
  const send = () => {
    if (!draft.trim()) return;
    if (isHost && draft.startsWith("/speak ")) {
      onSpeak(draft.slice(7).trim());
      onDraft("");
      return;
    }
    onDanmaku(draft.trim());
  };
  return (
    <div className="dy-live-room">
      <div
        className="dy-live-stage"
        style={{
          background: spriteUrl
            ? `linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.55)), url(${spriteUrl}) center/cover no-repeat`
            : `linear-gradient(160deg, ${room.coverTone}, #0a0a0c 70%)`,
        }}
      >
        <div className="dy-live-top">
          <div className="dy-live-host">
            <DyAvatar name={room.hostName} tone={room.hostTone} size={32} />
            <div className="dy-live-host-meta">
              <strong>{room.hostName}</strong>
              <span>{formatDouyinCount(room.viewers)} watching</span>
            </div>
            <button type="button" className="dy-follow-btn" onClick={onFollowHost}>{S.followBtn}</button>
          </div>
          <div className="dy-live-top-right">
            <span className="dy-live-viewers">{formatDouyinCount(room.viewers)}</span>
            <button type="button" className="dy-icon-btn" aria-label={S.close} onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {room.pk?.active ? (
          <div className="dy-pk-bar">
            <div>
              <strong>PK | {room.pk.topic}</strong>
              <span>{room.hostName} {room.pk.myScore} : {room.pk.opponentScore} {room.pk.opponentName}</span>
            </div>
            <div className="dy-pk-meter">
              <i style={{ width: `${Math.max(8, (room.pk.myScore / Math.max(1, room.pk.myScore + room.pk.opponentScore)) * 100)}%` }} />
            </div>
          </div>
        ) : null}

        <div className="dy-live-danmaku-half">
          {room.speakLines?.length ? (
            <div className="dy-speak-line">{room.speakLines[room.speakLines.length - 1]}</div>
          ) : null}
          {recent.map(item => (
            <div key={item.id} className="dy-danmaku" style={{ color: item.tone }}>
              {item.authorName ? <em>{item.authorName}</em> : null}
              {item.text}
            </div>
          ))}
        </div>

        <div className="dy-live-bottom">
          {busy ? <div className="dy-busy">{busy}</div> : null}
          <div className="dy-live-inputrow">
            <input
              value={draft}
              onChange={e => onDraft(e.target.value)}
              placeholder={S.say}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" aria-label="emoji" onClick={onToggleEmoji}><Smile size={22} /></button>
            <button type="button" aria-label="gift" onClick={onToggleGifts}><Heart size={22} /></button>
            <button type="button" aria-label={S.share} onClick={onForward}><Send size={20} /></button>
          </div>
          {showEmoji ? (
            <div className="dy-emoji-panel">
              {EMOJI_POOL.map(e => (
                <button key={e} type="button" onClick={() => onDraft(draft + e)}>{e}</button>
              ))}
            </div>
          ) : null}
          {showGifts && !isHost ? (
            <div className="dy-gift-row">
              {GIFT_OPTIONS.map(gift => (
                <button
                  key={gift.label}
                  type="button"
                  onClick={() => onGift(gift.coins, gift.label)}
                  title={walletLinked ? `${gift.coins}` : "link wallet first"}
                >
                  <Gift size={14} style={{ display: "inline", marginRight: 4 }} />{gift.label} {gift.coins}
                </button>
              ))}
            </div>
          ) : null}
          <div className="dy-live-tools">
            <button type="button" onClick={onPk}><Swords size={14} /> {room.pk?.active ? S.endPk : S.pk}</button>
            <button type="button" onClick={onBurst}><RefreshCw size={14} /> {S.burst}</button>
            {isHost ? <button type="button" className="dy-live-end" onClick={onEnd}>{S.endLive}</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const GIFT_OPTIONS = [
  { label: "gift1", coins: 1 },
  { label: "gift9", coins: 9 },
  { label: "gift99", coins: 99 },
];

const EMOJI_POOL = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10", "e11", "e12"];

export function ForwardModalX({ room, characters, onForward, onClose }: {
  room: DouyinLiveRoom;
  characters: Array<{ id: string; name: string }>;
  onForward: (characterId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="dy-sheet" onClick={onClose}>
      <div className="dy-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="dy-sheet-head">
          <span>{S.shareLive}</span>
          <button type="button" aria-label={S.close} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dy-live-forward-card">{room.hostName} - {room.title}</div>
        <div className="dy-sheet-list">
          {characters.length === 0 ? <div className="dy-empty">{S.noChar}</div> : null}
          {characters.map(c => (
            <button key={c.id} type="button" className="dy-thread" onClick={() => onForward(c.id)}>
              <DyAvatar name={c.name} tone="#fe2c55" />
              <div className="dy-thread-body"><strong>{c.name}</strong><p>{S.send}</p></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SearchPageX({ keyword, onKeyword, onSearchKeyword, history, hotTags, results, authors, followingIds, busy, onBack, onLike, onFollow, onComment, onCollect, collectedIds, onGenImage, generatingImageId }: {
  keyword: string;
  onKeyword: (v: string) => void;
  onSearchKeyword: (kw: string) => void;
  history: string[];
  hotTags: string[];
  results: DouyinVideo[];
  authors: Map<string, AuthorLite>;
  followingIds: string[];
  busy: string;
  onBack: () => void;
  onLike: (id: string) => void;
  onFollow: (id: string) => void;
  onComment: (id: string) => void;
  onCollect: (id: string) => void;
  collectedIds: string[];
  onGenImage: (id: string) => void;
  generatingImageId: string | null;
}) {
  void followingIds;
  return (
    <div className="dy-panel-page dy-search-page">
      <div className="dy-search-bar">
        <button type="button" className="dy-icon-btn" aria-label={S.back} onClick={onBack}><ChevronLeft size={18} /></button>
        <input
          value={keyword}
          onChange={e => onKeyword(e.target.value)}
          placeholder={S.searchPh}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearchKeyword(keyword);
            }
          }}
        />
        <button type="button" className="dy-btn" onClick={() => onSearchKeyword(keyword)}>{S.searchOk}</button>
      </div>
      {busy ? <div className="dy-busy">{busy}</div> : null}
      {results.length === 0 ? (
        <>
          {history.length > 0 ? (
            <section className="dy-search-sec">
              <h3>{S.recentSearch}</h3>
              <div className="dy-tag-row">{history.map(h => (
                <button key={h} type="button" className="dy-tag-chip" onClick={() => onSearchKeyword(h)}>{h}</button>
              ))}</div>
            </section>
          ) : null}
          {hotTags.length > 0 ? (
            <section className="dy-search-sec">
              <h3>{S.myTags}</h3>
              <div className="dy-tag-row">{hotTags.map(t => (
                <button key={t} type="button" className="dy-tag-chip" onClick={() => onSearchKeyword(t)}>#{t}</button>
              ))}</div>
            </section>
          ) : null}
          <div className="dy-empty">{S.entryHint}</div>
        </>
      ) : (
        <div className="dy-search-results">
          {results.map(video => {
            const author = authors.get(video.authorId) || { name: "creator", avatarTone: "#666", handle: "user" };
            return (
              <div key={video.id} className="dy-search-card">
                {video.imageUrl ? (
                  <div className="dy-search-cover" style={{ background: `url(${video.imageUrl}) center/cover no-repeat` }} />
                ) : (
                  <div className="dy-search-cover" style={{ background: video.coverTone }}>
                    <span>{author.name.slice(0, 1)}</span>
                  </div>
                )}
                <div className="dy-search-info">
                  <p className="dy-search-caption">{video.caption}</p>
                  <span className="dy-search-author">@{author.name} | {formatDouyinCount(video.likeCount)} likes | {video.commentCount} comments</span>
                  <div className="dy-search-actions">
                    <button type="button" onClick={() => onLike(video.id)}>{video.liked ? "liked" : "like"}</button>
                    <button type="button" onClick={() => onComment(video.id)}>comments {video.commentCount}</button>
                    <button type="button" onClick={() => onCollect(video.id)}>{collectedIds.includes(video.id) ? "wanted" : S.want}</button>
                    {!video.imageUrl ? (
                      <button type="button" onClick={() => onGenImage(video.id)} disabled={generatingImageId === video.id}>
                        {generatingImageId === video.id ? S.generating : S.genCover}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProfileHeaderX({ backgroundTone, name, douyinId, bio, likes, following, followers, actions, tabs, subTab, onSubTab, list, collectedIds, onLike, onComment, onCollect }: {
  backgroundTone: string;
  name: string;
  douyinId: string;
  bio: string;
  likes: number;
  following: number;
  followers: number;
  actions: React.ReactNode;
  tabs: Array<{ id: string; label: string }>;
  subTab: string;
  onSubTab: (t: string) => void;
  list: DouyinVideo[];
  collectedIds: string[];
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onCollect: (id: string) => void;
}) {
  return (
    <div className="dy-me">
      <div className="dy-me-bg" style={{ background: `linear-gradient(180deg, ${backgroundTone}, #0a0a0c)` }} />
      {actions}
      <div className="dy-me-head">
        <DyAvatar name={name} tone="#25f4ee" size={72} />
        <strong className="dy-me-name">{name}</strong>
        <span className="dy-me-id">id: {douyinId}</span>
        {bio ? <p className="dy-me-bio">{bio}</p> : null}
      </div>
      <div className="dy-stats">
        <div><strong>{formatDouyinCount(likes)}</strong><span>likes</span></div>
        <div><strong>{following}</strong><span>following</span></div>
        <div><strong>{formatDouyinCount(followers)}</strong><span>fans</span></div>
      </div>
      <div className="dy-me-tabs">
        {tabs.map(t => (
          <button key={t.id} type="button" {...(subTab === t.id ? { "data-active": "" } : {})} onClick={() => onSubTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="dy-me-grid">
        {list.length === 0 ? <div className="dy-empty">{S.empty}</div> : null}
        {list.map(video => (
          <div key={video.id} className="dy-me-cell">
            {video.imageUrl ? (
              <div className="dy-me-thumb" style={{ background: `url(${video.imageUrl}) center/cover no-repeat` }} />
            ) : (
              <div className="dy-me-thumb" style={{ background: video.coverTone }}>
                <span>{video.caption.slice(0, 14)}</span>
              </div>
            )}
            <p>{video.caption.slice(0, 18)}</p>
            <span>{formatDouyinCount(video.likeCount)} likes</span>
            <div className="dy-me-cell-actions">
              <button type="button" onClick={() => onLike(video.id)}>{video.liked ? "liked" : "like"}</button>
              <button type="button" onClick={() => onComment(video.id)}>c:{video.commentCount}</button>
              <button type="button" onClick={() => onCollect(video.id)}>{collectedIds.includes(video.id) ? "wanted" : S.want}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MePageX({ state, myLikes, subTab, onSubTab, onClose, onOpenSettings, onAddFriend, onEdit, onLike, onFollow, onComment, onCollect, onAuthor }: {
  state: DouyinState;
  myLikes: number;
  subTab: "works" | "collected" | "liked";
  onSubTab: (t: "works" | "collected" | "liked") => void;
  onClose: () => void;
  onOpenSettings: () => void;
  onAddFriend: () => void;
  onEdit: () => void;
  onLike: (id: string) => void;
  onFollow: (id: string) => void;
  onComment: (id: string) => void;
  onCollect: (id: string) => void;
  onAuthor: (authorId: string) => void;
}) {
  void onFollow;
  void onAuthor;
  const works = state.videos.filter(v => v.authorId === "self" || v.source === "user");
  const collected = state.videos.filter(v => state.session.collectedIds.includes(v.id));
  const liked = state.videos.filter(v => v.liked);
  const list = subTab === "works" ? works : subTab === "collected" ? collected : liked;
  return (
    <div className="dy-panel-page dy-me-page">
      <ProfileHeaderX
        backgroundTone={state.session.backgroundTone}
        name={state.session.nickname}
        douyinId={state.session.handle}
        bio={state.session.bio}
        likes={myLikes}
        following={state.session.followingIds.length}
        followers={state.session.followers}
        actions={(
          <div className="dy-me-topbar">
            <button type="button" className="dy-icon-btn" aria-label={S.addFriend} onClick={onAddFriend}>
              <UserPlus size={18} />
            </button>
            <button type="button" className="dy-icon-btn" aria-label={S.back} onClick={onClose}>
              <ChevronLeft size={18} />
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="dy-me-edit" onClick={onEdit}>
              <Pencil size={12} style={{ display: "inline", marginRight: 4 }} />{S.editHome}
            </button>
            <button type="button" className="dy-icon-btn" aria-label={S.settings} onClick={onOpenSettings}>
              <Settings size={18} />
            </button>
          </div>
        )}
        tabs={[{ id: "works", label: S.works }, { id: "collected", label: S.want }, { id: "liked", label: S.liked }]}
        subTab={subTab}
        onSubTab={t => { if (t !== "recommend") onSubTab(t as "works" | "collected" | "liked"); }}
        list={list}
        collectedIds={state.session.collectedIds}
        onLike={onLike}
        onComment={onComment}
        onCollect={onCollect}
      />
      {state.settings.myTags.length > 0 ? (
        <div className="dy-tag-row" style={{ padding: "0 16px 16px" }}>
          {state.settings.myTags.map(t => <span key={t} className="dy-tag-chip">#{t}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function CharacterPageX({ author, videos, followingIds, collectedIds, busy, onBack, onFollow, onLike, onComment, onCollect, onRefresh, onDm }: {
  author: DouyinAuthor;
  videos: DouyinVideo[];
  followingIds: string[];
  collectedIds: string[];
  busy: string;
  onBack: () => void;
  onFollow: (id: string) => void;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onCollect: (id: string) => void;
  onRefresh: () => void;
  onDm: () => void;
}) {
  const [subTab, setSubTab] = useState<"works" | "recommend">("works");
  const works = videos.filter(v => v.authorId === author.id);
  const recommend = [...videos].filter(v => v.authorId !== author.id).sort((a, b) => b.likeCount - a.likeCount).slice(0, 12);
  const followed = followingIds.includes(author.id);
  const list = subTab === "works" ? works : recommend;
  return (
    <div className="dy-panel-page dy-me-page">
      <ProfileHeaderX
        backgroundTone={author.backgroundTone || "#161823"}
        name={author.name}
        douyinId={author.douyinId || author.handle}
        bio={author.bio || ""}
        likes={author.totalLikes || works.reduce((s, v) => s + v.likeCount, 0)}
        following={author.following}
        followers={author.followers}
        actions={(
          <div className="dy-me-topbar">
            <button type="button" className="dy-icon-btn" aria-label={S.back} onClick={onBack}>
              <ChevronLeft size={18} />
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="dy-icon-btn" aria-label={S.personaTip} title={S.personaTip} onClick={onRefresh} disabled={!!busy}>
              <RefreshCw size={16} />
            </button>
          </div>
        )}
        tabs={[{ id: "works", label: S.works }, { id: "recommend", label: S.recommend }]}
        subTab={subTab}
        onSubTab={t => setSubTab(t as "works" | "recommend")}
        list={list}
        collectedIds={collectedIds}
        onLike={onLike}
        onComment={onComment}
        onCollect={onCollect}
      />
      <div className="dy-char-actions">
        <button type="button" className={followed ? "dy-btn dy-btn-ghost" : "dy-btn"} onClick={() => onFollow(author.id)}>
          {followed ? S.followed : S.followBtn}
        </button>
        <button type="button" className="dy-btn dy-btn-cyan" onClick={onDm}>{S.sendDm}</button>
      </div>
      {busy ? <div className="dy-busy">{busy}</div> : null}
    </div>
  );
}

export function SettingsModalX({ state, tagDraft, onTagDraft, onToggleTag, onAddTag, portraits, portraitUrls, onUpload, onDeletePortrait, walletLinked, walletBalance, onLinkWallet, onUnlinkWallet, onLogout, busy, characters, participantIds, onToggleParticipant, onCharacterPublish, onCharacterLive, onClose }: {
  state: DouyinState;
  tagDraft: string;
  onTagDraft: (v: string) => void;
  onToggleTag: (t: string) => void;
  onAddTag: () => void;
  portraits: DouyinNpcPortrait[];
  portraitUrls: Record<string, string>;
  onUpload: () => void;
  onDeletePortrait: (id: string) => void;
  walletLinked: boolean;
  walletBalance: number;
  onLinkWallet: () => void;
  onUnlinkWallet: () => void;
  onLogout: () => void;
  busy: string;
  characters: Array<{ id: string; name: string }>;
  participantIds: string[];
  onToggleParticipant: (id: string) => void;
  onCharacterPublish: (id: string) => void;
  onCharacterLive: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="dy-sheet" onClick={onClose}>
      <div className="dy-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="dy-sheet-head">
          <span>{S.settings}</span>
          <button type="button" aria-label={S.close} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dy-sheet-list">
          <section className="dy-settings-block">
            <h3>{S.myTags}</h3>
            <div className="dy-tag-row">
              {state.settings.myTags.map(t => (
                <button key={t} type="button" className="dy-tag-chip" data-on="" onClick={() => onToggleTag(t)}>#{t} x</button>
              ))}
            </div>
            <div className="dy-tag-add">
              <input value={tagDraft} onChange={e => onTagDraft(e.target.value)} placeholder={S.tagPh} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAddTag(); } }} />
              <button type="button" onClick={onAddTag}>{S.addTag}</button>
            </div>
          </section>

          <section className="dy-settings-block">
            <div className="dy-settings-head"><h3>npc portraits</h3><span>{portraits.length}</span></div>
            <button type="button" className="dy-btn dy-btn-ghost" style={{ width: "100%" }} onClick={onUpload}>
              <ImagePlus size={14} style={{ display: "inline", marginRight: 4 }} />{S.upload}
            </button>
            {portraits.map(p => (
              <div key={p.id} className="dy-npc-card" style={{ marginTop: 8 }}>
                <div className="dy-npc-thumb" style={{ backgroundImage: portraitUrls[p.id] ? `url(${portraitUrls[p.id]})` : undefined }}>
                  {!portraitUrls[p.id] ? p.name.slice(0, 1) : null}
                </div>
                <div className="dy-npc-meta">
                  <strong>{p.name}</strong>
                  <button type="button" className="dy-link-btn" onClick={() => onDeletePortrait(p.id)}>{S.del}</button>
                </div>
              </div>
            ))}
          </section>

          <section className="dy-settings-block">
            <h3>characters</h3>
            {characters.map(c => (
              <div key={c.id} className="dy-char-item">
                <button
                  type="button"
                  className="dy-chip"
                  {...(participantIds.includes(c.id) ? { "data-on": "" } : {})}
                  onClick={() => onToggleParticipant(c.id)}
                >
                  {participantIds.includes(c.id) ? "[on] " : ""}{c.name}
                </button>
                <div className="dy-char-item-actions">
                  <button type="button" className="dy-link-btn" disabled={!!busy} onClick={() => onCharacterPublish(c.id)}>{S.publish}</button>
                  <button type="button" className="dy-link-btn" disabled={!!busy} onClick={() => onCharacterLive(c.id)}>{S.goLive}</button>
                </div>
              </div>
            ))}
          </section>

          <section className="dy-settings-block">
            <h3><Wallet size={14} style={{ display: "inline", marginRight: 6 }} />{S.wallet}</h3>
            <p className="dy-settings-desc">
              {walletLinked ? `linked | balance ${walletBalance}` : "link wallet for gifts"}
            </p>
            {walletLinked ? (
              <button type="button" className="dy-btn dy-btn-ghost" style={{ width: "100%" }} onClick={onUnlinkWallet}>{S.unlink}</button>
            ) : (
              <button type="button" className="dy-btn dy-btn-cyan" style={{ width: "100%" }} onClick={onLinkWallet}>{S.linkWallet}</button>
            )}
          </section>

          <button type="button" className="dy-btn dy-btn-ghost" style={{ width: "100%" }} onClick={onLogout}>{S.logout}</button>
        </div>
      </div>
    </div>
  );
}

export function EditProfileModalX({ draft, onDraft, onSave, onClose }: {
  draft: { nickname: string; handle: string; bio: string; backgroundTone: string };
  onDraft: (d: { nickname: string; handle: string; bio: string; backgroundTone: string }) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="dy-sheet" onClick={onClose}>
      <div className="dy-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="dy-sheet-head">
          <span>{S.editHome}</span>
          <button type="button" aria-label={S.close} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dy-sheet-list">
          <div className="dy-field"><label>name</label><input value={draft.nickname} onChange={e => onDraft({ ...draft, nickname: e.target.value })} /></div>
          <div className="dy-field"><label>id</label><input value={draft.handle} onChange={e => onDraft({ ...draft, handle: e.target.value })} /></div>
          <div className="dy-field"><label>bio</label><textarea value={draft.bio} onChange={e => onDraft({ ...draft, bio: e.target.value })} rows={3} /></div>
          <div className="dy-field"><label>bg</label>
            <div className="dy-bg-pick">
              {BG_TONES.map(t => (
                <button key={t} type="button" className="dy-bg-dot" style={{ background: t }} {...(draft.backgroundTone === t ? { "data-on": "" } : {})} onClick={() => onDraft({ ...draft, backgroundTone: t })} />
              ))}
            </div>
          </div>
          <button type="button" className="dy-btn" style={{ width: "100%" }} onClick={onSave}>{S.save}</button>
        </div>
      </div>
    </div>
  );
}

export function AddFriendModalX({ characters, busy, onAdd, onClose }: {
  characters: Array<{ id: string; name: string }>;
  busy: string;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="dy-sheet" onClick={onClose}>
      <div className="dy-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="dy-sheet-head">
          <span>{S.addFriend}</span>
          <button type="button" aria-label={S.close} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dy-sheet-list">
          {characters.length === 0 ? <div className="dy-empty">{S.noChar}</div> : null}
          {characters.map(c => (
            <div key={c.id} className="dy-char-item">
              <span><UserPlus size={14} style={{ display: "inline", marginRight: 6 }} />{c.name}</span>
              <button type="button" className="dy-btn" disabled={!!busy} onClick={() => onAdd(c.id)}>{S.add}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
