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
  ImagePlus,
  RefreshCw,
  Swords,
  Mic,
} from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import {
  generateDouyinAudienceDanmaku,
  generateDouyinCharacterActivity,
  generateDouyinNpcLiveRefresh,
  runDouyinLiveInteractionBurst,
  startDouyinCharacterLive,
} from "@/lib/douyin-engine";
import {
  addDouyinNpcPortrait,
  deleteDouyinNpcPortrait,
  DOUYIN_NPC_LIBRARY_UPDATED_EVENT,
  loadDouyinNpcPortraits,
  resolveDouyinNpcPortraitUrls,
  resolveDouyinSpriteUrl,
} from "@/lib/douyin-npc-library";
import {
  addDouyinComment,
  addDouyinGift,
  appendDouyinDanmaku,
  endDouyinLiveRoom,
  endDouyinPk,
  endMyDouyinLive,
  formatDouyinCount,
  linkDouyinWallet,
  loadDouyinState,
  loginDouyinAccount,
  logoutDouyinAccount,
  markDouyinThreadRead,
  publishDouyinVideo,
  sendDouyinDm,
  startDouyinPk,
  startMyDouyinLive,
  toggleDouyinFollow,
  toggleDouyinLike,
  updateDouyinLiveRoom,
  updateDouyinSettings,
  DOUYIN_UPDATED_EVENT,
} from "@/lib/douyin-storage";
import type {
  DouyinLiveRoom,
  DouyinNpcPortrait,
  DouyinState,
  DouyinTabId,
  DouyinVideo,
} from "@/lib/douyin-types";
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
  const [loginPersona, setLoginPersona] = useState("");
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [dmDraft, setDmDraft] = useState("");
  const [activeLiveId, setActiveLiveId] = useState<string | null>(null);
  const [danmakuDraft, setDanmakuDraft] = useState("");
  const [createCaption, setCreateCaption] = useState("");
  const [liveTitle, setLiveTitle] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [portraits, setPortraits] = useState<DouyinNpcPortrait[]>([]);
  const [portraitUrls, setPortraitUrls] = useState<Record<string, string>>({});
  const [liveSpriteUrl, setLiveSpriteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => setState(loadDouyinState());

  const refreshPortraits = async () => {
    const list = loadDouyinNpcPortraits();
    setPortraits(list);
    setPortraitUrls(await resolveDouyinNpcPortraitUrls(list));
  };

  useEffect(() => {
    const onUpdate = () => refresh();
    const onWallet = () => setWalletBalance(getWalletBalance(loadWalletState()));
    const onNpc = () => { void refreshPortraits(); };
    window.addEventListener(DOUYIN_UPDATED_EVENT, onUpdate);
    window.addEventListener(WALLET_UPDATED_EVENT, onWallet);
    window.addEventListener(DOUYIN_NPC_LIBRARY_UPDATED_EVENT, onNpc);
    setCharacters(loadCharacters());
    void refreshPortraits();
    return () => {
      window.removeEventListener(DOUYIN_UPDATED_EVENT, onUpdate);
      window.removeEventListener(WALLET_UPDATED_EVENT, onWallet);
      window.removeEventListener(DOUYIN_NPC_LIBRARY_UPDATED_EVENT, onNpc);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const identity = resolveUserIdentity();
    if (!loginName) setLoginName(identity?.name || state.session.nickname);
    if (!loginHandle) setLoginHandle(state.session.handle);
    if (!loginPersona) setLoginPersona(state.session.persona || "");
  }, [visible]);

  const notice = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  };

  const authors = useMemo(() => authorMap(state), [state.authors]);
  const commentVideo = state.videos.find(item => item.id === commentVideoId) || null;
  const activeThread = state.threads.find(item => item.id === activeThreadId) || null;
  const activeLive = state.liveRooms.find(item => item.id === activeLiveId) || null;
  const myLive = state.liveRooms.find(item => item.id === state.myLiveRoomId) || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeLive?.spriteAssetId) {
        setLiveSpriteUrl(null);
        return;
      }
      const url = await resolveDouyinSpriteUrl(activeLive.spriteAssetId);
      if (!cancelled) setLiveSpriteUrl(url);
    })();
    return () => { cancelled = true; };
  }, [activeLive?.id, activeLive?.spriteAssetId]);

  const feedVideos = useMemo(() => {
    if (feedScope === "follow") {
      const ids = new Set(state.session.followingIds);
      const followed = state.videos.filter(item => ids.has(item.authorId) || item.followed);
      return followed.length > 0 ? followed : state.videos.slice(0, 3);
    }
    return state.videos;
  }, [feedScope, state.session.followingIds, state.videos]);

  const unreadTotal = state.threads.reduce((sum, item) => sum + item.unread, 0);
  const participantIds = state.settings.participantCharacterIds;

  const handleLogin = () => {
    setState(loginDouyinAccount({ nickname: loginName, handle: loginHandle, persona: loginPersona }));
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

  const triggerInteraction = async (room: DouyinLiveRoom, hint: string) => {
    try {
      setBusy("生成弹幕…");
      await runDouyinLiveInteractionBurst(room.id, hint, participantIds);
      refresh();
    } catch (error) {
      notice(error instanceof Error ? error.message : "互动生成失败");
    } finally {
      setBusy("");
    }
  };

  const handleGift = async (room: DouyinLiveRoom, coins: number, label: string) => {
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
    setState(appendDouyinDanmaku(room.id, `送出 ${label}`, { fromMe: true, kind: "user" }));
    notice(`已送出${label}`);
    await triggerInteraction(room, `用户送出了${label}`);
  };

  const handleRefreshNpcLives = async () => {
    try {
      setBusy("刷新直播…");
      const rooms = await generateDouyinNpcLiveRefresh(3);
      refresh();
      notice(`已刷新 ${rooms.length} 个 NPC 直播间`);
      setFeedScope("live");
      setTab("home");
    } catch (error) {
      notice(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setBusy("");
    }
  };

  const handleCharacterPublish = async (characterId: string) => {
    try {
      setBusy("角色创作中…");
      const result = await generateDouyinCharacterActivity(characterId);
      refresh();
      notice(result.published ? "角色已发布作品" : (result.reason || "角色选择不发布"));
      if (result.published) setTab("home");
    } catch (error) {
      notice(error instanceof Error ? error.message : "角色创作失败");
    } finally {
      setBusy("");
    }
  };

  const handleCharacterLive = async (characterId: string) => {
    try {
      setBusy("角色开播…");
      const room = await startDouyinCharacterLive(characterId, liveTitle || undefined);
      refresh();
      if (room) {
        setActiveLiveId(room.id);
        notice("角色已开播");
      }
    } catch (error) {
      notice(error instanceof Error ? error.message : "开播失败");
    } finally {
      setBusy("");
    }
  };

  const toggleParticipant = (characterId: string) => {
    const next = participantIds.includes(characterId)
      ? participantIds.filter(id => id !== characterId)
      : [...participantIds, characterId];
    setState(updateDouyinSettings({ participantCharacterIds: next }));
  };

  const handleUploadPortrait = async (file: File | null) => {
    if (!file) return;
    try {
      setBusy("上传立绘…");
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "NPC立绘";
      await addDouyinNpcPortrait(name, file, ["直播"]);
      await refreshPortraits();
      notice("已加入 NPC 立绘库");
    } catch (error) {
      notice(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
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
          <p className="dy-login-sub">人设驱动的刷作品、直播、弹幕与礼物。登录后可连接聊天钱包，礼物结束后折合入账。</p>
          <div className="dy-login-card">
            <div className="dy-field">
              <label>昵称</label>
              <input value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="你的抖音昵称" />
            </div>
            <div className="dy-field">
              <label>抖音号</label>
              <input value={loginHandle} onChange={e => setLoginHandle(e.target.value)} placeholder="douyin_id" />
            </div>
            <div className="dy-field">
              <label>人设（影响观看人数与观众身份）</label>
              <textarea value={loginPersona} onChange={e => setLoginPersona(e.target.value)} placeholder="例如：深夜刷手机的学生，爱看练舞和生活号" />
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
              onRefreshLives={() => { void handleRefreshNpcLives(); }}
              refreshing={busy === "刷新直播…"}
            />
          ) : null}

          {tab === "create" ? (
            <div className="dy-panel-page">
              <button type="button" className="dy-icon-btn" aria-label="返回" onClick={() => setTab("home")}>
                <ChevronLeft size={18} />
              </button>
              <h2 className="dy-panel-title">创作中心</h2>
              {busy ? <div className="dy-busy">{busy}</div> : null}

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
                    <button
                      type="button"
                      className="dy-btn dy-btn-ghost"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setState(endMyDouyinLive());
                        setWalletBalance(getWalletBalance(loadWalletState()));
                        notice("直播结束，礼物已折合入账");
                      }}
                    >
                      结束并入账
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
                      notice("直播已开始，观众身份按人设刷新");
                      if (next.myLiveRoomId) {
                        void generateDouyinAudienceDanmaku(next.myLiveRoomId, "用户开播").then(refresh);
                      }
                    }}
                  >
                    开始直播
                  </button>
                )}
              </div>

              <div className="dy-card">
                <strong style={{ fontSize: 13 }}>NPC 立绘库</strong>
                <p style={{ margin: "6px 0 10px", color: "var(--dy-muted)", fontSize: 12 }}>
                  刷新直播时会随机抽立绘生成人设开播
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={e => { void handleUploadPortrait(e.target.files?.[0] || null); }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button type="button" className="dy-btn dy-btn-ghost" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={14} style={{ display: "inline", marginRight: 4 }} />上传立绘
                  </button>
                  <button type="button" className="dy-btn" style={{ flex: 1 }} onClick={() => { void handleRefreshNpcLives(); }} disabled={!!busy}>
                    <RefreshCw size={14} style={{ display: "inline", marginRight: 4 }} />刷新直播
                  </button>
                </div>
                <div className="dy-npc-grid">
                  {portraits.map(portrait => (
                    <div key={portrait.id} className="dy-npc-card">
                      <div className="dy-npc-thumb" style={{ backgroundImage: portraitUrls[portrait.id] ? `url(${portraitUrls[portrait.id]})` : undefined }}>
                        {!portraitUrls[portrait.id] ? portrait.name.slice(0, 1) : null}
                      </div>
                      <div className="dy-npc-meta">
                        <strong>{portrait.name}</strong>
                        <button
                          type="button"
                          className="dy-link-btn"
                          onClick={() => { void deleteDouyinNpcPortrait(portrait.id).then(refreshPortraits); }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {portraits.length === 0 ? <div className="dy-empty" style={{ padding: 12 }}>还没有立绘</div> : null}
              </div>

              <div className="dy-card">
                <strong style={{ fontSize: 13 }}>参与角色</strong>
                <p style={{ margin: "6px 0 10px", color: "var(--dy-muted)", fontSize: 12 }}>
                  按人设决定是否发作品/开播；进直播间时另调角色互动，观众弹幕每次 15 条
                </p>
                {characters.length === 0 ? <div className="dy-empty" style={{ padding: 8 }}>暂无角色</div> : null}
                {characters.map(character => {
                  const selected = participantIds.includes(character.id);
                  return (
                    <div key={character.id} className="dy-char-row">
                      <button
                        type="button"
                        className="dy-chip"
                        {...(selected ? { "data-on": "" } : {})}
                        onClick={() => toggleParticipant(character.id)}
                      >
                        {character.name}
                      </button>
                      <button type="button" className="dy-link-btn" disabled={!!busy} onClick={() => { void handleCharacterPublish(character.id); }}>
                        刷新作品
                      </button>
                      <button type="button" className="dy-link-btn" disabled={!!busy} onClick={() => { void handleCharacterLive(character.id); }}>
                        开播
                      </button>
                    </div>
                  );
                })}
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
                <span style={{ color: "var(--dy-muted)", fontSize: 12 }}>{state.session.persona || state.session.bio}</span>
              </div>
              <div className="dy-stats">
                <div>
                  <strong>{state.session.followingIds.length}</strong>
                  <span>关注</span>
                </div>
                <div>
                  <strong>{formatDouyinCount(state.session.followers)}</strong>
                  <span>粉丝</span>
                </div>
                <div>
                  <strong>{formatDouyinCount(state.videos.filter(v => v.authorId === "self" || v.source === "user").length || 1)}</strong>
                  <span>作品</span>
                </div>
              </div>
              <div className="dy-wallet-card">
                <h3><Wallet size={14} style={{ display: "inline", marginRight: 6 }} />聊天钱包</h3>
                <p>
                  {state.session.walletLinked
                    ? `已连接 · 余额 ¥${formatWalletAmount(walletBalance)}（直播礼物结束折合入账）`
                    : "连接后可在直播间用余额刷礼物，主播侧礼物结束入账"}
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
              isHost={activeLive.id === state.myLiveRoomId || (activeLive.hostType === "character" && participantIds.includes(activeLive.characterId || ""))}
              walletLinked={state.session.walletLinked}
              spriteUrl={liveSpriteUrl}
              busy={busy}
              onClose={() => setActiveLiveId(null)}
              onDanmaku={(text) => {
                setState(appendDouyinDanmaku(activeLive.id, text, { fromMe: true, kind: "user" }));
                setDanmakuDraft("");
                void triggerInteraction(activeLive, `用户发弹幕：${text}`);
              }}
              draft={danmakuDraft}
              onDraft={setDanmakuDraft}
              onGift={(coins, label) => { void handleGift(activeLive, coins, label); }}
              onSpeak={(text) => {
                setState(updateDouyinLiveRoom(activeLive.id, { speakLines: [text] }));
                setState(appendDouyinDanmaku(activeLive.id, text, { fromMe: true, kind: "host", authorName: activeLive.hostName }));
                void triggerInteraction(activeLive, `主播讲话：${text}`);
              }}
              onPk={() => {
                if (activeLive.pk?.active) {
                  setState(endDouyinPk(activeLive.id));
                  notice("PK 结束");
                } else {
                  setState(startDouyinPk(activeLive.id, "隔壁主播", "才艺比拼"));
                  notice("PK 开始");
                  void triggerInteraction(activeLive, "主播发起了 PK");
                }
              }}
              onBurst={() => { void triggerInteraction(activeLive, "用户点了互动刷新"); }}
              onEnd={() => {
                if (activeLive.id === state.myLiveRoomId) {
                  setState(endMyDouyinLive());
                } else {
                  setState(endDouyinLiveRoom(activeLive.id));
                }
                setWalletBalance(getWalletBalance(loadWalletState()));
                setActiveLiveId(null);
                notice("直播已结束，礼物已折合入账");
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
  onRefreshLives,
  refreshing,
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
  onRefreshLives: () => void;
  refreshing: boolean;
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
          <button type="button" className="dy-icon-btn" aria-label="刷新" onClick={onRefreshLives} disabled={refreshing}>
            <RefreshCw size={16} />
          </button>
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
              <p>{room.hostName}{room.hostType === "character" ? " · 角色" : room.hostType === "user" ? " · 我" : " · NPC"}</p>
            </button>
          ))}
        </div>
        {liveRooms.length === 0 ? <div className="dy-empty">暂时没有直播，可在创作中心上传立绘后刷新</div> : null}
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
                <div className="dy-clip-author">@{author.name}{video.source === "character" ? " · 角色" : ""}</div>
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
  spriteUrl,
  busy,
  onClose,
  onDanmaku,
  draft,
  onDraft,
  onGift,
  onSpeak,
  onPk,
  onBurst,
  onEnd,
}: {
  room: DouyinLiveRoom;
  isHost: boolean;
  walletLinked: boolean;
  spriteUrl: string | null;
  busy: string;
  onClose: () => void;
  onDanmaku: (text: string) => void;
  draft: string;
  onDraft: (value: string) => void;
  onGift: (coins: number, label: string) => void;
  onSpeak: (text: string) => void;
  onPk: () => void;
  onBurst: () => void;
  onEnd: () => void;
}) {
  const recent = room.danmaku.slice(-10);

  return (
    <div className="dy-live-room">
      <div
        className="dy-live-stage"
        style={{
          background: spriteUrl
            ? `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.72)), url(${spriteUrl}) center/cover no-repeat`
            : room.coverTone,
        }}
      >
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

          {room.pk?.active ? (
            <div className="dy-pk-bar">
              <div>
                <strong>PK · {room.pk.topic}</strong>
                <span>{room.hostName} {room.pk.myScore} : {room.pk.opponentScore} {room.pk.opponentName}</span>
              </div>
              <div className="dy-pk-meter">
                <i style={{ width: `${Math.max(8, (room.pk.myScore / Math.max(1, room.pk.myScore + room.pk.opponentScore)) * 100)}%` }} />
              </div>
            </div>
          ) : null}

          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--dy-accent)", fontWeight: 700, marginBottom: 4 }}>
                <Radio size={12} style={{ display: "inline", marginRight: 4 }} />LIVE
                {room.persona ? ` · ${room.persona.slice(0, 28)}` : ""}
              </div>
              <div style={{ fontSize: 16, fontWeight: 750 }}>{room.title}</div>
              {room.speakLines?.length ? (
                <div className="dy-speak-line">{room.speakLines[room.speakLines.length - 1]}</div>
              ) : null}
              {room.viewerHints?.length ? (
                <div className="dy-viewer-hints">观众：{room.viewerHints.slice(0, 3).join(" · ")}</div>
              ) : null}
            </div>
            <div className="dy-danmaku-lane">
              {recent.map(item => (
                <div key={item.id} className="dy-danmaku" style={{ color: item.tone }}>
                  {item.authorName ? `${item.authorName}：` : ""}{item.text}
                </div>
              ))}
            </div>
            {busy ? <div className="dy-busy">{busy}</div> : null}
            <div className="dy-live-tools">
              <button type="button" onClick={onPk}><Swords size={14} /> {room.pk?.active ? "结束PK" : "PK"}</button>
              <button type="button" onClick={onBurst}><RefreshCw size={14} /> 刷弹幕</button>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!draft.trim()) return;
                    onSpeak(draft.trim());
                    onDraft("");
                  }}
                >
                  <Mic size={14} /> 讲话
                </button>
              ) : null}
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
                placeholder={isHost ? "讲话或发弹幕…" : "说点什么…"}
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
