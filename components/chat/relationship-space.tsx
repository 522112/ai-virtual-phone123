"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, MessageCircle, Plus, Trash2, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-storage";
import type { Character } from "@/lib/character-types";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { saveChatImageToIndexedDB, getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { RelationshipKindIcon } from "./relationship-kind-icon";
import { buildTwoLevelMomentThreads } from "@/lib/moments-comment-threading";
import {
  RELATIONSHIP_CHANGED_EVENT,
  RELATIONSHIP_KIND_META,
  addAnniversary,
  addCheckin,
  addRelationshipComment,
  addRelationshipPost,
  anniversaryCountdown,
  checkinStreak,
  daysTogether,
  dissolveRelationship,
  getRelationshipById,
  hasCheckedInToday,
  loadAnniversaries,
  loadCheckins,
  loadRelationshipComments,
  loadRelationshipPosts,
  removeAnniversary,
  toggleRelationshipPostLike,
} from "@/lib/relationship-storage";
import type { RelationshipBinding, RelationshipComment, RelationshipPost } from "@/lib/relationship-types";

type TabKey = "feed" | "checkin" | "days";

function useRelationship(relationshipId: string) {
  const [binding, setBinding] = useState(() => getRelationshipById(relationshipId));
  const [posts, setPosts] = useState(() => loadRelationshipPosts(relationshipId));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setBinding(getRelationshipById(relationshipId));
      setPosts(loadRelationshipPosts(relationshipId));
      setTick(n => n + 1);
    };
    window.addEventListener(RELATIONSHIP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(RELATIONSHIP_CHANGED_EVENT, refresh);
  }, [relationshipId]);

  return { binding, posts, tick };
}

function buildChatExcerpt(messages: ChatMessage[]): string {
  return messages
    .filter(msg => (msg.role === "user" || msg.role === "assistant") && msg.content.trim() && !msg.mediaType)
    .slice(-6)
    .map(msg => `${msg.role === "user" ? "我" : "对方"}：${msg.content.trim().slice(0, 80)}`)
    .join("\n");
}

export function RelationshipSpace({
  relationshipId,
  character,
  messages,
  onClose,
  onNotice,
}: {
  relationshipId: string;
  character: Character | null;
  messages: ChatMessage[];
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const { binding, posts, tick } = useRelationship(relationshipId);
  const [tab, setTab] = useState<TabKey>("feed");
  const [composing, setComposing] = useState(false);
  const identity = resolveUserIdentity(character?.id || "", "chat");

  if (!binding || binding.status !== "active") {
    return (
      <div className="rel-space">
        <header className="rel-space-nav">
          <button type="button" className="rel-space-icon-btn" onClick={onClose} aria-label="返回">
            <X size={20} />
          </button>
          <span>关系空间</span>
          <span />
        </header>
        <div className="rel-space-empty">这段关系已经不在了</div>
      </div>
    );
  }

  const meta = RELATIONSHIP_KIND_META[binding.kind];
  const together = daysTogether(binding);

  return (
    <div className="rel-space" style={{ "--rel-accent": meta.accent } as React.CSSProperties}>
      <header className="rel-space-nav">
        <button type="button" className="rel-space-icon-btn" onClick={onClose} aria-label="返回">
          <X size={20} />
        </button>
        <span>{meta.label}空间</span>
        <button
          type="button"
          className="rel-space-text-btn"
          onClick={() => {
            if (!window.confirm("解除后双方空间会关闭。确定解除？")) return;
            dissolveRelationship(binding.id);
            onNotice("已解除关系");
            onClose();
          }}
        >
          解除
        </button>
      </header>

      <section className="rel-space-hero">
        <div className="rel-space-avatars">
          <span className="rel-space-avatar">
            {identity?.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <ChatFallbackAvatar alt={identity?.name || "我"} />}
          </span>
          <span className="rel-space-avatar">
            {character?.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar alt={character?.name || "对方"} />}
          </span>
        </div>
        <div className="rel-space-names">
          {identity?.name || "我"} 与 {character?.name || "对方"}
        </div>
        <div className="rel-space-badge">
          <RelationshipKindIcon kind={binding.kind} size="sm" />
          <span>{meta.label} · 第 {together} 天</span>
        </div>
      </section>

      <nav className="rel-space-tabs">
        {([
          ["feed", "动态"],
          ["checkin", "打卡"],
          ["days", "纪念日"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="rel-space-tab"
            data-active={tab === key ? "" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="rel-space-body">
        {tab === "feed" && (
          <RelationshipFeed
            key={tick}
            binding={binding}
            posts={posts}
            character={character}
            userName={identity?.name || "我"}
            userAvatar={identity?.avatarUrl || null}
            userId={identity?.id || "user"}
            onCompose={() => setComposing(true)}
          />
        )}
        {tab === "checkin" && (
          <RelationshipCheckinPane
            key={`c-${tick}`}
            binding={binding}
            userId={identity?.id || "user"}
            onNotice={onNotice}
          />
        )}
        {tab === "days" && (
          <RelationshipAnniversaryPane
            key={`a-${tick}`}
            binding={binding}
            onNotice={onNotice}
          />
        )}
      </div>

      {composing && (
        <RelationshipCompose
          binding={binding}
          messages={messages}
          userId={identity?.id || "user"}
          onClose={() => setComposing(false)}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}

function formatRelTimeAgo(isoStr: string): string {
  const now = Date.now();
  const then = Date.parse(isoStr);
  const diff = Math.floor((now - then) / 1000);
  if (!Number.isFinite(then) || diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 172800) return "昨天";
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  const d = new Date(isoStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function RelAvatar({ src, alt }: { src?: string | null; alt: string }) {
  if (src) return <img src={src} alt="" className="feed-post-author-avatar-image w-full h-full object-cover" />;
  return <ChatFallbackAvatar alt={alt} />;
}

function RelationshipFeed({
  binding,
  posts,
  character,
  userName,
  userAvatar,
  userId,
  onCompose,
}: {
  binding: RelationshipBinding;
  posts: RelationshipPost[];
  character: Character | null;
  userName: string;
  userAvatar: string | null;
  userId: string;
  onCompose: () => void;
}) {
  return (
    <div className="rel-feed">
      <button type="button" className="rel-feed-compose" onClick={onCompose}>
        <Plus size={16} strokeWidth={1.75} />
        <span>发布动态</span>
      </button>
      {posts.length === 0 ? (
        <div className="rel-space-empty">还没有动态。可以写此刻的感触，也可以随手发一条。</div>
      ) : posts.map(post => (
        <RelationshipPostCard
          key={post.id}
          post={post}
          binding={binding}
          character={character}
          userName={userName}
          userAvatar={userAvatar}
          userId={userId}
        />
      ))}
    </div>
  );
}

function RelationshipPostCard({
  post,
  binding,
  character,
  userName,
  userAvatar,
  userId,
}: {
  post: RelationshipPost;
  binding: RelationshipBinding;
  character: Character | null;
  userName: string;
  userAvatar: string | null;
  userId: string;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [comments, setComments] = useState(() => loadRelationshipComments(post.id));
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<RelationshipComment | null>(null);
  const [likes, setLikes] = useState(post.likes);
  const liked = likes.some(like => like.authorType === "user" && like.authorId === userId);
  const authorName = post.authorType === "user" ? userName : (character?.name || "对方");
  const authorAvatar = post.authorType === "user" ? userAvatar : (character?.avatar || null);
  const likeNames = likes.map(like => like.authorType === "user" ? userName : (character?.name || "对方"));
  const commentThreads = buildTwoLevelMomentThreads(comments);

  useEffect(() => {
    if (!post.photoAssetId) return;
    let cancelled = false;
    getChatImageFromIndexedDB(post.photoAssetId).then(url => {
      if (!cancelled) setPhoto(url);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [post.photoAssetId]);

  const authorOf = (comment: RelationshipComment) => (
    comment.authorType === "user" ? userName : (character?.name || "对方")
  );
  const avatarOf = (comment: RelationshipComment) => (
    comment.authorType === "user" ? userAvatar : (character?.avatar || null)
  );

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    addRelationshipComment({
      postId: post.id,
      relationshipId: binding.id,
      authorType: "user",
      authorId: userId,
      content,
      replyToCommentId: replyTo?.id,
      replyToAuthorName: replyTo ? authorOf(replyTo) : undefined,
    });
    setDraft("");
    setReplyTo(null);
    setComments(loadRelationshipComments(post.id));
  };

  return (
    <article className="feed-post rel-feed-post relative border-b-[2.5px] border-[var(--c-card-border)] pb-5 mb-5 w-full bg-transparent">
      <div className="feed-post-header flex items-center gap-3 mb-3">
        <div className="feed-post-author-avatar w-[40px] h-[40px] rounded-full shrink-0 bg-[var(--c-input)] overflow-hidden flex items-center justify-center">
          <RelAvatar src={authorAvatar} alt={authorName} />
        </div>
        <div className="feed-post-author flex-1">
          <span className="feed-post-author-name ts-16 font-medium text-[var(--c-text-title)]">{authorName}</span>
        </div>
      </div>

      {post.content ? (
        <div className="feed-post-content ts-16 leading-[1.75] text-[var(--c-text-title)] whitespace-pre-wrap break-words mb-3 w-full">
          {post.content}
        </div>
      ) : null}

      {post.fromChat && post.chatExcerpt ? (
        <div className="rel-feed-excerpt">{post.chatExcerpt}</div>
      ) : null}

      {photo ? <img src={photo} alt="" className="rel-feed-photo" /> : null}

      <div className="feed-post-action-row flex items-center justify-between mt-4 mb-3">
        <span className="feed-post-time ts-13 text-[var(--c-icon)]">{formatRelTimeAgo(post.createdAt)}</span>
        <div className="feed-post-actions flex gap-4">
          <button
            type="button"
            className="feed-post-like-btn border-none p-0 w-[19px] h-[19px] cursor-pointer flex items-center justify-center bg-none shrink-0"
            onClick={() => {
              const updated = toggleRelationshipPostLike(post.id, "user", userId);
              if (updated) setLikes(updated.likes);
            }}
          >
            <Heart size={17} strokeWidth={1.75} fill={liked ? "currentColor" : "none"} className="text-[var(--c-icon)]" />
          </button>
          <button
            type="button"
            className="feed-post-comment-btn bg-none border-none p-0 cursor-pointer flex items-center"
            onClick={() => setReplyTo(null)}
          >
            <MessageCircle size={16} strokeWidth={1.75} className="text-[var(--c-icon)]" />
          </button>
        </div>
      </div>

      {(likeNames.length > 0 || comments.length > 0) && (
        <div className="feed-feedback-section w-full flex flex-col gap-2 mb-3 mt-1">
          {likeNames.length > 0 && (
            <div className="feed-like-summary flex items-start gap-1 ts-15 leading-[1.55] text-[var(--c-text-title)]">
              <span className="feed-like-summary-icon shrink-0 mt-[4px] mr-1 text-[var(--c-icon)] opacity-80">
                <Heart size={15} strokeWidth={1.75} />
              </span>
              <span className="feed-like-summary-text opacity-90">{likeNames.join("、")} 赞了</span>
            </div>
          )}
          {commentThreads.length > 0 && (
            <div className="feed-comments flex flex-col gap-1 w-full mt-1">
              {commentThreads.map(({ root, replies }) => (
                <div key={root.id} className="feed-comment feed-comment-root w-full">
                  <div className="feed-comment-row flex items-start gap-2 cursor-pointer" onClick={() => setReplyTo(root)}>
                    <div className="feed-comment-avatar feed-comment-avatar-root w-[32px] h-[32px] rounded-full shrink-0 bg-[var(--c-input)] overflow-hidden flex items-center justify-center">
                      <RelAvatar src={avatarOf(root)} alt={authorOf(root)} />
                    </div>
                    <div className="feed-comment-content min-w-0 flex-1 ts-14 leading-[1.8] break-words">
                      <div className="feed-comment-author text-[var(--c-text)] opacity-70">{authorOf(root)}</div>
                      <div className="feed-comment-body ts-15 leading-[1.55] text-[var(--c-text-title)]">{root.content}</div>
                      <div className="feed-comment-meta flex items-center gap-0 mt-[2px] ts-13 text-[var(--c-icon)] w-full">
                        <span className="feed-comment-time whitespace-nowrap mr-4">{formatRelTimeAgo(root.createdAt)}</span>
                        <button type="button" className="feed-comment-reply-btn" onClick={(e) => { e.stopPropagation(); setReplyTo(root); }}>回复</button>
                      </div>
                    </div>
                  </div>
                  {replies.length > 0 && (
                    <div className="feed-comment-replies flex flex-col gap-1 w-full mt-1 pl-[40px]">
                      {replies.map(reply => (
                        <div key={reply.id} className="feed-comment feed-comment-child flex items-start gap-2 cursor-pointer" onClick={() => setReplyTo(reply)}>
                          <div className="feed-comment-avatar feed-comment-avatar-child w-[22px] h-[22px] rounded-full shrink-0 bg-[var(--c-input)] overflow-hidden flex items-center justify-center mt-[2px]">
                            <RelAvatar src={avatarOf(reply)} alt={authorOf(reply)} />
                          </div>
                          <div className="feed-comment-content min-w-0 flex-1">
                            <div className="feed-comment-author text-[var(--c-text)] opacity-70">{authorOf(reply)}</div>
                            <div className="feed-comment-body ts-15 leading-[1.55] text-[var(--c-text-title)]">
                              {reply.replyToAuthorName ? (
                                <>
                                  <span className="feed-comment-reply-prefix">回复 </span>
                                  <span className="feed-comment-reply-target ts-14 font-normal text-[var(--c-text)] opacity-70">{reply.replyToAuthorName}</span>
                                  <span className="feed-comment-reply-colon">：</span>
                                </>
                              ) : null}
                              {reply.content}
                            </div>
                            <div className="feed-comment-meta flex items-center gap-0 mt-[2px] ts-13 text-[var(--c-icon)]">
                              <span className="feed-comment-time whitespace-nowrap mr-4">{formatRelTimeAgo(reply.createdAt)}</span>
                              <button type="button" className="feed-comment-reply-btn" onClick={(e) => { e.stopPropagation(); setReplyTo(reply); }}>回复</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rel-feed-composer">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={replyTo ? `回复 ${authorOf(replyTo)}` : "评论"}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        {replyTo ? (
          <button type="button" className="feed-comment-reply-btn" onClick={() => setReplyTo(null)}>取消</button>
        ) : null}
        <button type="button" className="feed-comment-send" onClick={submit} disabled={!draft.trim()}>发送</button>
      </div>
    </article>
  );
}

function RelationshipCompose({
  binding,
  messages,
  userId,
  onClose,
  onNotice,
}: {
  binding: RelationshipBinding;
  messages: ChatMessage[];
  userId: string;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [fromChat, setFromChat] = useState(false);
  const [photoAssetId, setPhotoAssetId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const excerpt = useMemo(() => buildChatExcerpt(messages), [messages]);

  return (
    <div className="rel-compose">
      <header className="rel-space-nav">
        <button type="button" className="rel-space-text-btn" onClick={onClose}>取消</button>
        <span>新动态</span>
        <button
          type="button"
          className="rel-space-text-btn"
          data-primary=""
          onClick={() => {
            const content = text.trim();
            if (!content && !photoAssetId && !(fromChat && excerpt)) {
              onNotice("写一点内容再发吧");
              return;
            }
            addRelationshipPost({
              relationshipId: binding.id,
              authorType: "user",
              authorId: userId,
              content,
              photoAssetId: photoAssetId || undefined,
              fromChat: fromChat && !!excerpt,
              chatExcerpt: fromChat ? excerpt : undefined,
            });
            onNotice("已发布到空间");
            onClose();
          }}
        >
          发布
        </button>
      </header>
      <textarea
        className="rel-compose-text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="写此刻的心情，或只是想说的话"
        autoFocus
      />
      <label className="rel-compose-from-chat">
        <input type="checkbox" checked={fromChat} onChange={e => setFromChat(e.target.checked)} />
        来自当前聊天的感触
      </label>
      {fromChat && excerpt ? <pre className="rel-feed-excerpt">{excerpt}</pre> : null}
      {fromChat && !excerpt ? <p className="rel-compose-hint">最近几条文字消息会附在动态上</p> : null}
      {photoPreview ? <img src={photoPreview} alt="" className="rel-post-photo" /> : null}
      <div className="rel-compose-tools">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const assetId = await saveChatImageToIndexedDB(file);
            const preview = await getChatImageFromIndexedDB(assetId);
            setPhotoAssetId(assetId);
            setPhotoPreview(preview);
          }}
        />
        <button type="button" className="rel-space-primary" onClick={() => fileRef.current?.click()}>添加照片</button>
        {photoAssetId ? (
          <button type="button" className="rel-space-text-btn" onClick={() => { setPhotoAssetId(null); setPhotoPreview(null); }}>去掉照片</button>
        ) : null}
      </div>
    </div>
  );
}

function RelationshipCheckinPane({
  binding,
  userId,
  onNotice,
}: {
  binding: RelationshipBinding;
  userId: string;
  onNotice: (text: string) => void;
}) {
  const checked = hasCheckedInToday(binding.id, userId, "user");
  const streak = checkinStreak(binding.id);
  const checkins = loadCheckins(binding.id).slice(0, 14);

  return (
    <div className="rel-checkin">
      <div className="rel-checkin-card">
        <div className="rel-checkin-streak">连续 {streak} 天</div>
        <p>{checked ? "今天已经打过卡了" : "今天还没有打卡"}</p>
        <button
          type="button"
          className="rel-space-primary"
          disabled={checked}
          onClick={() => {
            const result = addCheckin(binding.id, "user", userId);
            if ("error" in result) onNotice(result.error);
            else onNotice("打卡成功");
          }}
        >
          {checked ? "已打卡" : "立即打卡"}
        </button>
      </div>
      <ul className="rel-checkin-list">
        {checkins.map(item => (
          <li key={item.id}>
            <strong>{item.date}</strong>
            <span>{item.authorType === "user" ? "我" : "对方"}</span>
          </li>
        ))}
        {checkins.length === 0 ? <li className="rel-space-empty">还没有打卡记录</li> : null}
      </ul>
    </div>
  );
}

function RelationshipAnniversaryPane({
  binding,
  onNotice,
}: {
  binding: RelationshipBinding;
  onNotice: (text: string) => void;
}) {
  const items = loadAnniversaries(binding.id);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  return (
    <div className="rel-anniv">
      <form
        className="rel-anniv-form"
        onSubmit={e => {
          e.preventDefault();
          const result = addAnniversary(binding.id, title, date);
          if ("error" in result) {
            onNotice(result.error);
            return;
          }
          setTitle("");
          setDate("");
          onNotice("已添加纪念日");
        }}
      >
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="纪念日名称，比如在一起" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button type="submit" className="rel-space-primary">添加</button>
      </form>
      <ul className="rel-anniv-list">
        {items.map(item => {
          const count = anniversaryCountdown(item.date);
          return (
            <li key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.date} · {count.occurred ? "就是今天" : `还有 ${count.days} 天`}</span>
              </div>
              <button type="button" className="rel-space-icon-btn" aria-label="删除纪念日" onClick={() => removeAnniversary(item.id)}>
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
        {items.length === 0 ? <li className="rel-space-empty">还没有纪念日</li> : null}
      </ul>
    </div>
  );
}
