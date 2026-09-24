"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, MessageCircle, Plus, Trash2, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-storage";
import type { Character } from "@/lib/character-types";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { saveChatImageToIndexedDB, getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
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
            if (!window.confirm("解除后双方空间会关闭，且一个人只能再绑定一段新关系。确定解除？")) return;
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
        <div className="rel-space-badge">{meta.emoji} {meta.label} · 第 {together} 天</div>
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

function RelationshipFeed({
  binding,
  posts,
  character,
  userName,
  userId,
  onCompose,
}: {
  binding: RelationshipBinding;
  posts: RelationshipPost[];
  character: Character | null;
  userName: string;
  userId: string;
  onCompose: () => void;
}) {
  if (posts.length === 0) {
    return (
      <div className="rel-space-empty">
        <p>还没有动态。可以写此刻的感触，也可以随手发一条。</p>
        <button type="button" className="rel-space-primary" onClick={onCompose}>发布动态</button>
      </div>
    );
  }
  return (
    <div className="rel-feed">
      <button type="button" className="rel-space-compose-btn" onClick={onCompose}>
        <Plus size={16} /> 发布动态
      </button>
      {posts.map(post => (
        <RelationshipPostCard
          key={post.id}
          post={post}
          binding={binding}
          character={character}
          userName={userName}
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
  userId,
}: {
  post: RelationshipPost;
  binding: RelationshipBinding;
  character: Character | null;
  userName: string;
  userId: string;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [comments, setComments] = useState(() => loadRelationshipComments(post.id));
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<RelationshipComment | null>(null);
  const liked = post.likes.some(like => like.authorType === "user" && like.authorId === userId);
  const authorName = post.authorType === "user" ? userName : (character?.name || "对方");
  const authorAvatar = post.authorType === "user" ? null : character?.avatar;

  useEffect(() => {
    if (!post.photoAssetId) return;
    let cancelled = false;
    getChatImageFromIndexedDB(post.photoAssetId).then(url => {
      if (!cancelled) setPhoto(url);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [post.photoAssetId]);

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
      replyToAuthorName: replyTo
        ? (replyTo.authorType === "user" ? userName : (character?.name || "对方"))
        : undefined,
    });
    setDraft("");
    setReplyTo(null);
    setComments(loadRelationshipComments(post.id));
  };

  return (
    <article className="rel-post">
      <div className="rel-post-head">
        <span className="rel-post-avatar">
          {authorAvatar ? <img src={authorAvatar} alt="" /> : <ChatFallbackAvatar alt={authorName} />}
        </span>
        <div>
          <div className="rel-post-name">{authorName}</div>
          <div className="rel-post-time">{new Date(post.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>
      {post.fromChat && post.chatExcerpt ? (
        <div className="rel-post-excerpt">来自聊天的感触{"\n"}{post.chatExcerpt}</div>
      ) : null}
      {post.content ? <p className="rel-post-content">{post.content}</p> : null}
      {photo ? <img src={photo} alt="" className="rel-post-photo" /> : null}
      <div className="rel-post-actions">
        <button
          type="button"
          className="rel-post-action"
          data-on={liked ? "" : undefined}
          onClick={() => toggleRelationshipPostLike(post.id, "user", userId)}
        >
          <Heart size={15} fill={liked ? "currentColor" : "none"} /> {post.likes.length || ""}
        </button>
        <span className="rel-post-action">
          <MessageCircle size={15} /> {comments.length || ""}
        </span>
      </div>
      {comments.length > 0 && (
        <div className="rel-post-comments">
          {comments.map(comment => {
            const name = comment.authorType === "user" ? userName : (character?.name || "对方");
            return (
              <button
                key={comment.id}
                type="button"
                className="rel-post-comment"
                onClick={() => setReplyTo(comment)}
              >
                <strong>{name}</strong>
                {comment.replyToAuthorName ? <span> 回复 {comment.replyToAuthorName}</span> : null}
                ：{comment.content}
              </button>
            );
          })}
        </div>
      )}
      <div className="rel-post-composer">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={replyTo ? `回复 ${replyTo.authorType === "user" ? userName : (character?.name || "对方")}` : "评论"}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        {replyTo ? (
          <button type="button" className="rel-space-text-btn" onClick={() => setReplyTo(null)}>取消</button>
        ) : null}
        <button type="button" className="rel-space-text-btn" onClick={submit} disabled={!draft.trim()}>发送</button>
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
      {fromChat && excerpt ? <pre className="rel-post-excerpt">{excerpt}</pre> : null}
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
