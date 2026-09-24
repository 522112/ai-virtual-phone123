"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  Home,
  MessageCircle,
  Radio,
  Share2,
  Users,
  Wallet,
  X,
  ChevronLeft,
} from "lucide-react";

import {
  addDouyinComment,
  addDouyinGift,
  appendDouyinDanmaku,
  endMyDouyinLive,
  formatDouyinCount,
  linkDouyinWallet,
  loadDouyinState,
  loginDouyinAccount,
  logoutDouyinAccount,
  markDouyinThreadRead,
  publishDouyinVideo,
  sendDouyinDm,
  startMyDouyinLive,
  toggleDouyinFollow,
  toggleDouyinLike,
  DOUYIN_UPDATED_EVENT,
} from "@/lib/douyin-storage";
import type { DouyinLiveRoom, DouyinState, DouyinTabId, DouyinVideo } from "@/lib/douyin-types";
import { resolveUserIdentity } from "@/lib/settings-storage";
import {
  formatWalletAmount,
  getWalletBalance,
  loadWalletState,
  payWithWalletBalance,
  WALLET_UPDATED_EVENT,
} from "@/lib/wallet-storage";

type DouyinAppProps = {
  onClose: () => void;
  visible?: boolean;
};

type FeedScope = "recommend" | "follow" | "live";

const TABS: Array<{ id: DouyinTabId; label: string }> = [
  { id: "home", label: "首页" },
  { id: "friends", label: "朋友" },
  { id: "create", label: "" },
  { id: "inbox", label: "消息" },
  { id: "profile", label: "我" },
];

const GIFT_OPTIONS = [
  { label: "小心心", coins: 1 },
  { label: "玫瑰", coins: 9 },
  { label: "火箭", coins: 99 },
];

function authorMap(state: DouyinState) {
  return new Map(state.authors.map(item => [item.id, item]));
}

function Avatar({ name, tone, size = 44 }: { name: string; tone: string; size?: number }) {
  return (
    <span className="dy-avatar" style={{ width: size, height: size, background: tone, fontSize: size > 50 ? 22 : 14 }}>
      {(name || "?").slice(0, 1)}
    </span>
  );
}

export function DouyinApp({ onClose, visible = true }: DouyinAppProps) {
  const [state, setState] = useState<DouyinState>(() => loadDouyinState());
  const [tab, setTab] = useState<DouyinTabId>("home");
  const [feedScope, setFeedScope] = useState<FeedScope>("recommend");
  const [walletBalance, setWalletBalance] = useState(() => getWalletBalance(loadWalletState()));
  const [loginName, setLoginName] = useState("");
  const [loginHandle, setLoginHandle] = useState("");
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [dmDraft, setDmDraft] = useState("");
  const [activeLiveId, setActiveLiveId] = useState<string | null>(null);
  const [danmakuDraft, setDanmakuDraft] = useState("");
  const [createCaption, setCreateCaption] = useState("");
  const [liveTitle, setLiveTitle] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  const refresh = () => setState(loadDouyinState());

  useEffect(() => {
    const onUpdate = () => refresh();
    const onWallet = () => setWalletBalance(getWalletBalance(loadWalletState()));
    window.addEventListener(DOUYIN_UPDATED_EVENT, onUpdate);
    window.addEventListener(WALLET_UPDATED_EVENT, onWallet);
    return () => {
      window.removeEventListener(DOUYIN_UPDATED_EVENT, onUpdate);
      window.removeEventListener(WALLET_UPDATED_EVENT, onWallet);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const identity = resolveUserIdentity();
    if (!loginName) setLoginName(identity?.name || state.session.nickname);
    if (!loginHandle) setLoginHandle(state.session.handle);
  }, [visible]);

  const notice = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  };

  const authors = useMemo(() => authorMap(state), [state.authors]);
  const commentVideo = state.videos.find(item => item.id === commentVideoId) || null;
  const activeThread = state.threads.find(item => item.id === activeThreadId) || null;
  const activeLive = state.liveRooms.find(item => item.id === activeLiveId) || null;
  const myLive = state.liveRooms.find(item => item.id === state.myLiveRoomId) || null;

  const feedVideos = useMemo(() => {
    if (feedScope === "follow") {
      const ids = new Set(state.session.followingIds);
      const followed = state.videos.filter(item => ids.has(item.authorId) || item.followed);
      return followed.length > 0 ? followed : state.videos.slice(0, 3);
    }
    return state.videos;
  }, [feedScope, state.session.followingIds, state.videos]);

  const unreadTotal = state.threads.reduce((sum, item) => sum + item.unread, 0);

  const handleLogin = () => {
    setState(loginDouyinAccount({ nickname: loginName, handle: loginHandle }));
    notice("已登录抖音");
  };

  const handleLinkWallet = () => {
    if (!state.session.loggedIn) {
      notice("请先登录");
      return;
    }
    setState(linkDouyinWallet(true));
    setWalletBalance(getWalletBalance(loadWalletState()));
    notice("已连接聊天钱包");
  };

  const handleGift = (room: DouyinLiveRoom, coins: number, label: string) => {
    if (!state.session.walletLinked) {
      notice("请先在「我」页连接钱包");
      return;
    }
    const paid = payWithWalletBalance({
      amount: coins,
      title: `抖音直播礼物 · ${label}`,
      detail: `${room.hostName} 的直播间`,
      category: "抖音",
    });
    if (!paid.ok) {
      notice(paid.error || "余额不足");
      return;
    }
    setWalletBalance(getWalletBalance(paid.state));
    setState(addDouyinGift(room.id, coins));
    setState(appendDouyinDanmaku(room.id, `送出 ${label}`, true));
    notice(`已送出${label}`);
  };

  if (!visible) return null;

  if (!state.session.loggedIn) {
    return (
      <div className="dy-app" data-ui="douyin">
        <div className="dy-login">
          <button type="button" className="dy-icon-btn" aria-label="关闭" onClick={onClose} style={{ marginBottom: 24 }}>
            <ChevronLeft size={18} />
          </button>
          <h1 className="dy-login-brand">抖音</h1>
          <p className="dy-login-sub">模拟刷视频、评论、私信和直播。登录后可连接聊天钱包送礼物。</p>
          <div className="dy-login-card">
            <div className="dy-field">
              <label>昵称</label>
              <input value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="你的抖音昵称" />
            </div>
            <div className="dy-field">
              <label>抖音号</label>
              <input value={loginHandle} onChange={e => setLoginHandle(e.target.value)} placeholder="douyin_id" />
            </div>
            <button type="button" className="dy-btn" onClick={handleLogin} disabled={!loginName.trim()}>
              登录并进入
            </button>
            <button type="button" className="dy-btn dy-btn-ghost" onClick={onClose}>
              稍后再说
            </button>
          </div>
        </div>
        {toast ? <div className="dy-toast">{toast}</div> : null}
      </div>
    );
  }

  return (
    <div className="dy-app" data-ui="douyin">
      <div className="dy-shell">
        <div className="dy-main">
          {tab === "home" || tab === "friends" ? (
            <FeedView
              videos={tab === "friends" ? feedVideos.filter(v => state.session.followingIds.includes(v.authorId) || v.followed) : feedVideos}
              scope={tab === "friends" ? "follow" : feedScope}
              onScope={setFeedScope}
              authors={authors}
              followingIds={state.session.followingIds}
              onClose={onClose}
              onLike={id => setState(toggleDouyinLike(id))}
              onFollow={id => setState(toggleDouyinFollow(id))}
              onComment={id => { setCommentVideoId(id); setCommentDraft(""); }}
              onShare={() => notice("已模拟分享到聊天")}
              showLiveEntry={tab === "home"}
              onOpenLive={() => setFeedScope("live")}
              liveMode={feedScope === "live" && tab === "home"}
              liveRooms={state.liveRooms.filter(item => item.status === "live")}
              onEnterLive={id => setActiveLiveId(id)}
            />
          ) : null}

          {tab === "create" ? (
            <div className="dy-panel-page">
              <button type="button" className="dy-icon-btn" aria-label="返回" onClick={() => setTab("home")}>
                <ChevronLeft size={18} />
              </button>
              <h2 className="dy-panel-title">创作中心</h2>
              <div className="dy-card">
                <div className="dy-field">
                  <label>发一条视频动态</label>
                  <textarea value={createCaption} onChange={e => setCreateCaption(e.target.value)} placeholder="这一刻想分享什么…" />
                </div>
                <button
                  type="button"
                  className="dy-btn"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={() => {
                    setState(publishDouyinVideo(createCaption));
                    setCreateCaption("");
                    setTab("home");
                    notice("已发布到推荐流");
                  }}
                >
                  发布作品
                </button>
              </div>
              <div className="dy-card">
                <div className="dy-field">
                  <label>开直播</label>
                  <input value={liveTitle} onChange={e => setLiveTitle(e.target.value)} placeholder="直播间标题" />
                </div>
                {myLive ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" className="dy-btn dy-btn-cyan" style={{ flex: 1 }} onClick={() => setActiveLiveId(myLive.id)}>
                      回到直播间
                    </button>
                    <button type="button" className="dy-btn dy-btn-ghost" style={{ flex: 1 }} onClick={() => { setState(endMyDouyinLive()); notice("直播已结束"); }}>
                      结束直播
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dy-btn dy-btn-cyan"
                    style={{ width: "100%", marginTop: 8 }}
                    onClick={() => {
                      const next = startMyDouyinLive(liveTitle);
                      setState(next);
                      setActiveLiveId(next.myLiveRoomId);
                      setLiveTitle("");
                      notice("直播已开始");
                    }}
                  >
                    开始直播
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {tab === "inbox" ? (
            activeThread ? (
              <div className="dy-chat">
                <div className="dy-chat-head">
                  <button type="button" aria-label="返回" onClick={() => setActiveThreadId(null)}>
                    <ChevronLeft size={20} />
                  </button>
                  <strong>{activeThread.peerName}</strong>
                </div>
                <div className="dy-chat-messages">
                  {activeThread.messages.map(msg => (
                    <div key={msg.id} className="dy-bubble" {...(msg.fromMe ? { "data-me": "" } : {})}>
                      {msg.text}
                    </div>
                  ))}
                </div>
                <div className="dy-compose">
                  <input
                    value={dmDraft}
                    onChange={e => setDmDraft(e.target.value)}
                    placeholder="发私信"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!dmDraft.trim()) return;
                        setState(sendDouyinDm(activeThread.id, dmDraft));
                        setDmDraft("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!dmDraft.trim()) return;
                      setState(sendDouyinDm(activeThread.id, dmDraft));
                      setDmDraft("");
                    }}
                  >
                    发送
                  </button>
                </div>
              </div>
            ) : (
              <div className="dy-panel-page">
                <button type="button" className="dy-icon-btn" aria-label="关闭" onClick={onClose}>
                  <ChevronLeft size={18} />
                </button>
                <h2 className="dy-panel-title">消息</h2>
                {state.threads.length === 0 ? <div className="dy-empty">还没有私信</div> : null}
                {state.threads.map(thread => (
                  <button
                    key={thread.id}
                    type="button"
                    className="dy-thread"
                    onClick={() => {
                      setState(markDouyinThreadRead(thread.id));
                      setActiveThreadId(thread.id);
                    }}
                  >
                    <Avatar name={thread.peerName} tone={thread.peerTone} />
                    <div className="dy-thread-body">
                      <strong>{thread.peerName}</strong>
                      <p>{thread.messages[thread.messages.length - 1]?.text || "开始聊天"}</p>
                    </div>
                    {thread.unread > 0 ? <span className="dy-unread">{thread.unread}</span> : null}
                  </button>
                ))}
              </div>
            )
          ) : null}

          {tab === "profile" ? (
            <div className="dy-panel-page">
              <button type="button" className="dy-icon-btn" aria-label="关闭" onClick={onClose}>
                <ChevronLeft size={18} />
              </button>
              <div className="dy-profile-hero">
                <Avatar name={state.session.nickname} tone={state.session.avatarTone} size={72} />
                <strong style={{ fontSize: 18 }}>{state.session.nickname}</strong>
                <span style={{ color: "var(--dy-muted)", fontSize: 12 }}>抖音号：{state.session.handle}</span>
                <span style={{ color: "var(--dy-muted)", fontSize: 12 }}>{state.session.bio}</span>
              </div>
              <div className="dy-stats">
                <div>
                  <strong>{state.session.followingIds.length}</strong>
                  <span>关注</span>
                </div>
                <div>
                  <strong>{formatDouyinCount(state.videos.filter(v => v.authorId === "self").length || 1)}</strong>
                  <span>作品</span>
                </div>
                <div>
                  <strong>{formatDouyinCount(state.videos.reduce((s, v) => s + (v.liked ? 1 : 0), 0))}</strong>
                  <span>喜欢</span>
                </div>
              </div>
              <div className="dy-wallet-card">
                <h3><Wallet size={14} style={{ display: "inline", marginRight: 6 }} />聊天钱包</h3>
                <p>
                  {state.session.walletLinked
                    ? `已连接 · 余额 ¥${formatWalletAmount(walletBalance)}`
                    : "连接后可在直播间用余额刷礼物"}
                </p>
                <div className="dy-wallet-actions">
                  {state.session.walletLinked ? (
                    <button type="button" className="dy-btn dy-btn-ghost" onClick={() => { setState(linkDouyinWallet(false)); notice("已断开钱包"); }}>
                      断开连接
                    </button>
                  ) : (
                    <button type="button" className="dy-btn dy-btn-cyan" onClick={handleLinkWallet}>
                      连接钱包
                    </button>
                  )}
                  <button
                    type="button"
                    className="dy-btn dy-btn-ghost"
                    onClick={() => {
                      setState(logoutDouyinAccount());
                      setTab("home");
                      notice("已退出登录");
                    }}
                  >
                    退出登录
                  </button>
                </div>
              </div>
              <div className="dy-card">
                <strong style={{ fontSize: 13 }}>我的作品</strong>
                <p style={{ margin: "8px 0 0", color: "var(--dy-muted)", fontSize: 12 }}>
                  共 {state.videos.filter(v => v.authorId === "self").length} 条本地发布内容
                </p>
              </div>
            </div>
          ) : null}

          {commentVideo ? (
            <div className="dy-sheet" onClick={() => setCommentVideoId(null)}>
              <div className="dy-sheet-panel" onClick={e => e.stopPropagation()}>
                <div className="dy-sheet-head">
                  <span>{commentVideo.commentCount} 条评论</span>
                  <button type="button" aria-label="关闭" onClick={() => setCommentVideoId(null)}><X size={18} /></button>
                </div>
                <div className="dy-sheet-list">
                  {commentVideo.comments.length === 0 ? <div className="dy-empty">抢沙发</div> : null}
                  {commentVideo.comments.map(comment => (
                    <div key={comment.id} className="dy-comment">
                      <Avatar name={comment.authorName} tone={comment.authorTone} size={32} />
                      <div>
                        <strong>{comment.authorName}</strong>
                        <p>{comment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dy-sheet-input">
                  <input
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    placeholder="友善评论"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!commentDraft.trim()) return;
                        setState(addDouyinComment(commentVideo.id, commentDraft));
                        setCommentDraft("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!commentDraft.trim()) return;
                      setState(addDouyinComment(commentVideo.id, commentDraft));
                      setCommentDraft("");
                    }}
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeLive ? (
            <LiveRoom
              room={activeLive}
              isHost={activeLive.id === state.myLiveRoomId}
              walletLinked={state.session.walletLinked}
              onClose={() => setActiveLiveId(null)}
              onDanmaku={(text) => {
                setState(appendDouyinDanmaku(activeLive.id, text, true));
                setDanmakuDraft("");
              }}
              draft={danmakuDraft}
              onDraft={setDanmakuDraft}
              onGift={(coins, label) => handleGift(activeLive, coins, label)}
              onEnd={() => {
                setState(endMyDouyinLive());
                setActiveLiveId(null);
                notice("直播已结束");
              }}
            />
          ) : null}
        </div>

        {!activeLive && !activeThread ? (
          <nav className="dy-tabbar">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                className="dy-tab"
                {...(tab === item.id ? { "data-active": "" } : {})}
                onClick={() => {
                  if (item.id === "home") setFeedScope("recommend");
                  setTab(item.id);
                }}
              >
                {item.id === "create" ? (
                  <span className="dy-tab-create">+</span>
                ) : (
                  <>
                    {item.id === "home" ? <Home size={20} /> : null}
                    {item.id === "friends" ? <Users size={20} /> : null}
                    {item.id === "inbox" ? (
                      <span style={{ position: "relative" }}>
                        <MessageCircle size={20} />
                        {unreadTotal > 0 ? <span className="dy-unread" style={{ position: "absolute", top: -6, right: -10 }}>{unreadTotal}</span> : null}
                      </span>
                    ) : null}
                    {item.id === "profile" ? <Avatar name={state.session.nickname} tone={state.session.avatarTone} size={22} /> : null}
                    <span>{item.label}</span>
                  </>
                )}
              </button>
            ))}
          </nav>
        ) : null}
      </div>
      {toast ? <div className="dy-toast">{toast}</div> : null}
    </div>
  );
}

function FeedView({
  videos,
  scope,
  onScope,
  authors,
  followingIds,
  onClose,
  onLike,
  onFollow,
  onComment,
  onShare,
  showLiveEntry,
  onOpenLive,
  liveMode,
  liveRooms,
  onEnterLive,
}: {
  videos: DouyinVideo[];
  scope: FeedScope;
  onScope: (scope: FeedScope) => void;
  authors: Map<string, { name: string; avatarTone: string; handle: string }>;
  followingIds: string[];
  onClose: () => void;
  onLike: (id: string) => void;
  onFollow: (id: string) => void;
  onComment: (id: string) => void;
  onShare: () => void;
  showLiveEntry: boolean;
  onOpenLive: () => void;
  liveMode: boolean;
  liveRooms: DouyinLiveRoom[];
  onEnterLive: (id: string) => void;
}) {
  if (liveMode) {
    return (
      <div className="dy-panel-page" style={{ background: "#0a0a0c" }}>
        <div className="dy-topbar" style={{ position: "relative", marginBottom: 8 }}>
          <button type="button" className="dy-icon-btn" aria-label="关闭" onClick={onClose}><ChevronLeft size={18} /></button>
          <div className="dy-top-tabs">
            <button type="button" onClick={() => onScope("recommend")}>推荐</button>
            <button type="button" onClick={() => onScope("follow")}>关注</button>
            <button type="button" data-active="" onClick={onOpenLive}>直播</button>
          </div>
          <span style={{ width: 32 }} />
        </div>
        <h2 className="dy-panel-title">正在直播</h2>
        <div className="dy-live-grid">
          {liveRooms.map(room => (
            <button key={room.id} type="button" className="dy-live-tile" onClick={() => onEnterLive(room.id)}>
              <div className="dy-live-cover" style={{ background: room.coverTone }}>
                <span className="dy-live-badge">LIVE</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{formatDouyinCount(room.viewers)} 人</span>
              </div>
              <h4>{room.title}</h4>
              <p>{room.hostName}</p>
            </button>
          ))}
        </div>
        {liveRooms.length === 0 ? <div className="dy-empty">暂时没有直播</div> : null}
      </div>
    );
  }

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <div className="dy-topbar">
        <button type="button" className="dy-icon-btn" aria-label="关闭" onClick={onClose}><ChevronLeft size={18} /></button>
        <div className="dy-top-tabs">
          <button type="button" {...(scope === "follow" ? { "data-active": "" } : {})} onClick={() => onScope("follow")}>关注</button>
          <button type="button" {...(scope === "recommend" ? { "data-active": "" } : {})} onClick={() => onScope("recommend")}>推荐</button>
          {showLiveEntry ? <button type="button" onClick={onOpenLive}>直播</button> : null}
        </div>
        <span style={{ width: 32 }} />
      </div>
      <div className="dy-feed">
        {videos.length === 0 ? (
          <div className="dy-clip" style={{ background: "#12121a" }}>
            <div className="dy-empty" style={{ margin: "auto" }}>关注一些创作者后再来看</div>
          </div>
        ) : null}
        {videos.map(video => {
          const author = video.authorId === "self"
            ? { name: "我", avatarTone: "#25f4ee", handle: "me" }
            : authors.get(video.authorId) || { name: "创作者", avatarTone: "#666", handle: "user" };
          const followed = followingIds.includes(video.authorId) || video.followed;
          return (
            <article key={video.id} className="dy-clip">
              <div className="dy-clip-stage" style={{ backgroundColor: video.coverTone }} />
              <div className="dy-clip-meta">
                <div className="dy-clip-author">@{author.name}</div>
                <div className="dy-clip-caption">{video.caption}</div>
                <div className="dy-clip-music">♪ {video.music}</div>
              </div>
              <div className="dy-rail">
                <button type="button" className="dy-avatar-btn" onClick={() => onFollow(video.authorId)}>
                  <span className="dy-avatar" style={{ background: author.avatarTone }}>{author.name.slice(0, 1)}
                    {!followed && video.authorId !== "self" ? <span className="dy-follow-dot">+</span> : null}
                  </span>
                </button>
                <button type="button" className="dy-rail-btn" {...(video.liked ? { "data-on": "" } : {})} onClick={() => onLike(video.id)}>
                  <Heart size={28} {...(video.liked ? { fill: "currentColor" } : {})} />
                  <span>{formatDouyinCount(video.likeCount)}</span>
                </button>
                <button type="button" className="dy-rail-btn" onClick={() => onComment(video.id)}>
                  <MessageCircle size={28} />
                  <span>{formatDouyinCount(video.commentCount)}</span>
                </button>
                <button type="button" className="dy-rail-btn" onClick={onShare}>
                  <Share2 size={28} />
                  <span>{formatDouyinCount(video.shareCount)}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function LiveRoom({
  room,
  isHost,
  walletLinked,
  onClose,
  onDanmaku,
  draft,
  onDraft,
  onGift,
  onEnd,
}: {
  room: DouyinLiveRoom;
  isHost: boolean;
  walletLinked: boolean;
  onClose: () => void;
  onDanmaku: (text: string) => void;
  draft: string;
  onDraft: (value: string) => void;
  onGift: (coins: number, label: string) => void;
  onEnd: () => void;
}) {
  const recent = room.danmaku.slice(-8);

  useEffect(() => {
    if (isHost || room.status !== "live") return;
    const timer = window.setInterval(() => {
      const pool = ["来了", "好听", "加鸡腿", "前方高能", "主播大气", "哈哈哈"];
      appendDouyinDanmaku(room.id, pool[Math.floor(Math.random() * pool.length)]);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [isHost, room.id, room.status]);

  return (
    <div className="dy-live-room">
      <div className="dy-live-stage" style={{ background: room.coverTone }}>
        <div className="dy-live-overlay">
          <div className="dy-live-top">
            <div className="dy-live-host">
              <Avatar name={room.hostName} tone={room.hostTone} size={28} />
              <div>
                <strong>{room.hostName}</strong>
                <span>{formatDouyinCount(room.viewers)} 在看 · 礼物 {room.giftCoins}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {isHost ? (
                <button type="button" className="dy-btn" style={{ padding: "8px 12px" }} onClick={onEnd}>结束</button>
              ) : null}
              <button type="button" className="dy-icon-btn" aria-label="关闭" onClick={onClose}><X size={16} /></button>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--dy-accent)", fontWeight: 700, marginBottom: 4 }}>
                <Radio size={12} style={{ display: "inline", marginRight: 4 }} />LIVE
              </div>
              <div style={{ fontSize: 16, fontWeight: 750 }}>{room.title}</div>
            </div>
            <div className="dy-danmaku-lane">
              {recent.map(item => (
                <div key={item.id} className="dy-danmaku" style={{ color: item.tone }}>{item.text}</div>
              ))}
            </div>
            {!isHost ? (
              <div className="dy-gift-row">
                {GIFT_OPTIONS.map(gift => (
                  <button
                    key={gift.label}
                    type="button"
                    onClick={() => onGift(gift.coins, gift.label)}
                    title={walletLinked ? `¥${gift.coins}` : "需先连接钱包"}
                  >
                    {gift.label} ¥{gift.coins}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="dy-live-actions">
              <input
                value={draft}
                onChange={e => onDraft(e.target.value)}
                placeholder={isHost ? "和观众互动…" : "说点什么…"}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!draft.trim()) return;
                    onDanmaku(draft.trim());
                  }
                }}
              />
              <button
                type="button"
                className="dy-btn"
                style={{ padding: "11px 16px" }}
                onClick={() => {
                  if (!draft.trim()) return;
                  onDanmaku(draft.trim());
                }}
              >
                弹幕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
