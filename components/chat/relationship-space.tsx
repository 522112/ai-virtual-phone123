"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, ImagePlus, MessageCircle, Trash2, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-storage";
import type { Character } from "@/lib/character-types";
import { overlayCharacterForDisplay, overlayUserIdentityForDisplay } from "@/lib/couple-avatar-storage";
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
  buildCheckinNudgeCard,
  checkinStreakForBinding,
  daysTogether,
  dissolveRelationship,
  getRelationshipById,
  updateRelationshipCover,
  hasCheckedInToday,
  loadAnniversaries,
  loadVisibleCheckins,
  loadRelationshipComments,
  loadRelationshipPosts,
  needsCheckinRelight,
  reigniteCheckins,
  removeAnniversary,
  toggleRelationshipPostLike,
} from "@/lib/relationship-storage";
import type { RelationshipSpaceCard } from "@/lib/relationship-storage";
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

export function RelationshipSpace({
  relationshipId,
  character: rawCharacter,
  messages,
  onClose,
  onNotice,
  onDissolved,
  onPersonaNudge,
  onSpaceCard,
}: {
  relationshipId: string;
  character: Character | null;
  messages: ChatMessage[];
  onClose: () => void;
  onNotice: (text: string) => void;
  onDissolved?: (binding: RelationshipBinding) => void;
  onPersonaNudge?: (kind: "checkin" | "anniversary" | "nudge_checkin") => void;
  onSpaceCard?: (card: RelationshipSpaceCard, role: "user" | "assistant") => void;
}) {
  const { binding, posts, tick } = useRelationship(relationshipId);
  const [tab, setTab] = useState<TabKey>("feed");
  const [composing, setComposing] = useState(false);
  const [activeComposer, setActiveComposer] = useState<{
    postId: string;
    replyTo?: { commentId: string; authorId: string; authorType: "user" | "character"; name: string };
  } | null>(null);
  const [composerText, setComposerText] = useState("");
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const identityId = resolveUserIdentity()?.id || "user";

  const closeComposer = useCallback(() => {
    setActiveComposer(null);
    setComposerText("");
    composerInputRef.current?.blur();
  }, []);

  const submitComposer = useCallback(() => {
    if (!binding) return;
    const text = composerText.trim();
    const target = activeComposer;
    if (!text || !target) return;
    addRelationshipComment({
      postId: target.postId,
      relationshipId: binding.id,
      authorType: "user",
      authorId: identityId,
      content: text,
      replyToCommentId: target.replyTo?.commentId,
      replyToAuthorId: target.replyTo?.authorId,
      replyToAuthorType: target.replyTo?.authorType,
      replyToAuthorName: target.replyTo?.name,
    });
    closeComposer();
    onPersonaNudge?.("checkin");
  }, [activeComposer, binding, closeComposer, composerText, identityId, onPersonaNudge]);

  useEffect(() => {
    if (!activeComposer) return;
    const timer = window.setTimeout(() => {
      composerInputRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [activeComposer]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const character = rawCharacter ? overlayCharacterForDisplay(rawCharacter) : null;
  const identity = overlayUserIdentityForDisplay(character?.id, resolveUserIdentity(character?.id || "", "chat"));

  useEffect(() => {
    const src = binding?.coverImage;
    if (!src) {
      setCoverUrl(null);
      return;
    }
    if (src.startsWith("data:") || src.startsWith("http") || src.startsWith("blob:")) {
      setCoverUrl(src);
      return;
    }
    let cancelled = false;
    getChatImageFromIndexedDB(src.startsWith("asset://") ? src.slice("asset://".length) : src)
      .then(url => {
        if (!cancelled) setCoverUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCoverUrl(src);
      });
    return () => { cancelled = true; };
  }, [binding?.coverImage]);

  if (!binding || binding.status !== "active") {
    return (
      <div className="rel-space">
        <header className="page-header rel-space-header">
          <div className="page-header-safe-area" />
          <div className="page-header-content rel-space-nav">
            <button type="button" className="rel-space-icon-btn" onClick={onClose} aria-label="返回">
              <X size={20} />
            </button>
            <span>关系空间</span>
            <span />
          </div>
        </header>
        <div className="rel-space-empty">这段关系已经不在了</div>
      </div>
    );
  }

  const meta = RELATIONSHIP_KIND_META[binding.kind];
  const together = daysTogether(binding);

  return (
    <div className="rel-space" style={{ "--rel-accent": meta.accent } as React.CSSProperties}>
      <header className="page-header rel-space-header">
        <div className="page-header-safe-area" />
        <div className="page-header-content rel-space-nav">
          <button type="button" className="rel-space-icon-btn" onClick={onClose} aria-label="返回">
            <X size={20} />
          </button>
          <span>{meta.label}空间</span>
          <button
            type="button"
            className="rel-space-text-btn"
            onClick={() => {
              if (!window.confirm("解除后双方空间会关闭。确定解除？")) return;
              const dissolved = dissolveRelationship(binding.id);
              if (dissolved) onDissolved?.(dissolved);
              onNotice("已解除关系");
              onClose();
            }}
          >
            解除
          </button>
        </div>
      </header>

      <section
        className="rel-space-hero"
        data-has-cover={coverUrl ? "" : undefined}
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        <button
          type="button"
          className="rel-space-cover-btn"
          onClick={() => coverInputRef.current?.click()}
        >
          <ImagePlus size={15} strokeWidth={1.75} />
          <span>{binding.coverImage ? "换背景" : "上传背景"}</span>
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const assetId = await saveChatImageToIndexedDB(file);
            updateRelationshipCover(binding.id, assetId, "user");
            onNotice("已更新空间背景");
          }}
        />
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
        {binding.coverUpdatedBy === "character" ? (
          <div className="rel-space-cover-credit">{character?.name || "对方"}设的背景</div>
        ) : binding.coverUpdatedBy === "user" ? (
          <div className="rel-space-cover-credit">我设的背景</div>
        ) : null}
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
            posts={posts}
            character={character}
            userName={identity?.name || "我"}
            userAvatar={identity?.avatarUrl || null}
            userId={identity?.id || "user"}
            onCompose={() => setComposing(true)}
            onOpenComment={postId => {
              setComposerText("");
              setActiveComposer({ postId });
            }}
            onOpenReply={(postId, comment, name) => {
              setComposerText("");
              setActiveComposer({
                postId,
                replyTo: {
                  commentId: comment.id,
                  authorId: comment.authorId,
                  authorType: comment.authorType,
                  name,
                },
              });
            }}
          />
        )}
        {tab === "checkin" && (
          <RelationshipCheckinPane
            key={`c-${tick}`}
            binding={binding}
            userId={identity?.id || "user"}
            characterName={character?.name || "对方"}
            onNotice={onNotice}
            onPersonaNudge={onPersonaNudge}
            onNudgePartner={() => {
              onSpaceCard?.(buildCheckinNudgeCard(binding, character?.name || "对方"), "user");
              onPersonaNudge?.("nudge_checkin");
              onNotice("已催对方打卡");
              onClose();
            }}
          />
        )}
        {tab === "days" && (
          <RelationshipAnniversaryPane
            key={`a-${tick}`}
            binding={binding}
            userId={identity?.id || "user"}
            characterName={character?.name || "对方"}
            onNotice={onNotice}
            onPersonaNudge={onPersonaNudge}
          />
        )}
      </div>

      {composing && (
        <RelationshipCompose
          binding={binding}
          userId={identity?.id || "user"}
          onClose={() => setComposing(false)}
          onNotice={onNotice}
        />
      )}

      {activeComposer ? (
        <div className="feed-comment-modal-layer" data-ui="modal">
          <button
            type="button"
            className="feed-comment-modal-backdrop"
            aria-label="关闭评论输入"
            onClick={closeComposer}
          />
          <div
            className="feed-comment-modal-dialog"
            data-ui="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={activeComposer.replyTo ? `回复 ${activeComposer.replyTo.name}` : "发表评论"}
          >
            <div className="feed-comment-modal-title">
              {activeComposer.replyTo ? `回复 ${activeComposer.replyTo.name}` : "发表评论"}
            </div>
            <textarea
              ref={composerInputRef}
              value={composerText}
              onChange={event => setComposerText(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  submitComposer();
                } else if (event.key === "Escape") {
                  closeComposer();
                }
              }}
              placeholder={activeComposer.replyTo ? `回复 ${activeComposer.replyTo.name}` : "说点什么吧"}
              className="feed-comment-modal-input"
            />
            <div className="feed-comment-modal-actions">
              <button type="button" className="feed-comment-modal-cancel" onClick={closeComposer}>取消</button>
              <button
                type="button"
                className="feed-comment-modal-send"
                disabled={!composerText.trim()}
                onClick={submitComposer}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  posts,
  character,
  userName,
  userAvatar,
  userId,
  onCompose,
  onOpenComment,
  onOpenReply,
}: {
  posts: RelationshipPost[];
  character: Character | null;
  userName: string;
  userAvatar: string | null;
  userId: string;
  onCompose: () => void;
  onOpenComment: (postId: string) => void;
  onOpenReply: (postId: string, comment: RelationshipComment, name: string) => void;
}) {
  return (
    <div className="rel-feed">
      <button type="button" className="rel-feed-composer-card" onClick={onCompose}>
        <span className="rel-feed-composer-avatar">
          <RelAvatar src={userAvatar} alt={userName} />
        </span>
        <span className="rel-feed-composer-placeholder">写点什么...</span>
        <span className="rel-feed-composer-cam" aria-hidden="true">
          <ImagePlus size={18} strokeWidth={1.7} />
        </span>
      </button>
      {posts.length === 0 ? (
        <div className="rel-space-empty">还没有动态。可以写此刻的感触，也可以随手发一条。</div>
      ) : posts.map(post => (
        <RelationshipPostCard
          key={post.id}
          post={post}
          character={character}
          userName={userName}
          userAvatar={userAvatar}
          userId={userId}
          onOpenComment={() => onOpenComment(post.id)}
          onOpenReply={(comment, name) => onOpenReply(post.id, comment, name)}
        />
      ))}
    </div>
  );
}

function RelationshipPostCard({
  post,
  character,
  userName,
  userAvatar,
  userId,
  onOpenComment,
  onOpenReply,
}: {
  post: RelationshipPost;
  character: Character | null;
  userName: string;
  userAvatar: string | null;
  userId: string;
  onOpenComment: () => void;
  onOpenReply: (comment: RelationshipComment, name: string) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [comments, setComments] = useState(() => loadRelationshipComments(post.id));
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

  useEffect(() => {
    const refresh = () => setComments(loadRelationshipComments(post.id));
    window.addEventListener(RELATIONSHIP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(RELATIONSHIP_CHANGED_EVENT, refresh);
  }, [post.id]);

  const authorOf = (comment: RelationshipComment) => (
    comment.authorType === "user" ? userName : (character?.name || "对方")
  );
  const avatarOf = (comment: RelationshipComment) => (
    comment.authorType === "user" ? userAvatar : (character?.avatar || null)
  );

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
            onClick={onOpenComment}
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
                  <div className="feed-comment-row flex items-start gap-2 cursor-pointer" onClick={() => onOpenReply(root, authorOf(root))}>
                    <div className="feed-comment-avatar feed-comment-avatar-root w-[32px] h-[32px] rounded-full shrink-0 bg-[var(--c-input)] overflow-hidden flex items-center justify-center">
                      <RelAvatar src={avatarOf(root)} alt={authorOf(root)} />
                    </div>
                    <div className="feed-comment-content min-w-0 flex-1 ts-14 leading-[1.8] break-words">
                      <div className="feed-comment-author text-[var(--c-text)] opacity-70">{authorOf(root)}</div>
                      <div className="feed-comment-body ts-15 leading-[1.55] text-[var(--c-text-title)]">{root.content}</div>
                      <div className="feed-comment-meta flex items-center gap-0 mt-[2px] ts-13 text-[var(--c-icon)] w-full">
                        <span className="feed-comment-time whitespace-nowrap mr-4">{formatRelTimeAgo(root.createdAt)}</span>
                        <button type="button" className="feed-comment-reply-btn" onClick={(e) => { e.stopPropagation(); onOpenReply(root, authorOf(root)); }}>回复</button>
                      </div>
                    </div>
                  </div>
                  {replies.length > 0 && (
                    <div className="feed-comment-replies flex flex-col gap-1 w-full mt-1 pl-[40px]">
                      {replies.map(reply => (
                        <div key={reply.id} className="feed-comment feed-comment-child flex items-start gap-2 cursor-pointer" onClick={() => onOpenReply(reply, authorOf(reply))}>
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
                              <button type="button" className="feed-comment-reply-btn" onClick={(e) => { e.stopPropagation(); onOpenReply(reply, authorOf(reply)); }}>回复</button>
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

    </article>
  );
}

function RelationshipCompose({
  binding,
  userId,
  onClose,
  onNotice,
}: {
  binding: RelationshipBinding;
  userId: string;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [photoAssetId, setPhotoAssetId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const canPublish = Boolean(text.trim() || photoAssetId);

  const handlePublish = () => {
    const content = text.trim();
    if (!content && !photoAssetId) {
      onNotice("写一点内容再发吧");
      return;
    }
    addRelationshipPost({
      relationshipId: binding.id,
      authorType: "user",
      authorId: userId,
      content,
      photoAssetId: photoAssetId || undefined,
    });
    onNotice("已发布到空间");
    onClose();
  };

  return (
    <div className="rel-compose-overlay" role="dialog" aria-modal="true" aria-label="新动态">
      <header className="page-header rel-space-header">
        <div className="page-header-safe-area" />
        <div className="page-header-content rel-space-nav">
          <button type="button" className="rel-space-text-btn" onClick={onClose}>取消</button>
          <span>新动态</span>
          <button
            type="button"
            className="rel-space-text-btn"
            data-primary=""
            disabled={!canPublish}
            onClick={handlePublish}
          >
            发表
          </button>
        </div>
      </header>
      <div className="rel-compose-body">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="这一刻的想法..."
          className="rel-compose-text"
        />
        <div className="rel-compose-tools">
          {photoPreview ? (
            <div className="rel-compose-photo">
              <img src={photoPreview} alt="" />
              <button
                type="button"
                className="rel-space-icon-btn"
                aria-label="去掉图片"
                onClick={() => { setPhotoAssetId(null); setPhotoPreview(null); }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button type="button" className="rel-compose-add-photo" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={20} strokeWidth={1.7} />
              <span>添加图片</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
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
      </div>
    </div>
  );
}

function RelationshipCheckinPane({
  binding,
  userId,
  characterName,
  onNotice,
  onPersonaNudge,
  onNudgePartner,
}: {
  binding: RelationshipBinding;
  userId: string;
  characterName: string;
  onNotice: (text: string) => void;
  onPersonaNudge?: (kind: "checkin" | "anniversary" | "nudge_checkin") => void;
  onNudgePartner?: () => void;
}) {
  const checked = hasCheckedInToday(binding.id, userId, "user");
  const partnerChecked = hasCheckedInToday(binding.id, binding.characterId, "character");
  const waitingRelight = needsCheckinRelight(binding);
  const streak = checkinStreakForBinding(binding);
  const checkins = loadVisibleCheckins(binding).slice(0, 14);

  return (
    <div className="rel-checkin">
      <div className="rel-checkin-card">
        <div className="rel-checkin-streak">连续 {streak} 天</div>
        <p>
          {waitingRelight ? "重建后旧打卡还在，重燃才会继续之前的连续天数。 " : ""}
          {checked ? "我今天已经打过卡了" : "我今天还没有打卡"}
          {partnerChecked ? ` · ${characterName}也打过了` : ` · ${characterName}还没打`}
        </p>
        {waitingRelight ? (
          <button
            type="button"
            className="rel-space-primary"
            onClick={() => {
              const result = reigniteCheckins(binding.id);
              if ("error" in result) onNotice(result.error);
              else {
                onNotice("已重燃打卡，之前的连续天数会接上");
                onPersonaNudge?.("checkin");
              }
            }}
          >
            重燃打卡
          </button>
        ) : null}
        <button
          type="button"
          className="rel-space-primary"
          disabled={checked}
          onClick={() => {
            const result = addCheckin(binding.id, "user", userId);
            if ("error" in result) onNotice(result.error);
            else {
              onNotice("打卡成功");
              onPersonaNudge?.("checkin");
            }
          }}
        >
          {checked ? "已打卡" : "立即打卡"}
        </button>
        {!waitingRelight && !partnerChecked ? (
          <button type="button" className="rel-space-primary" onClick={onNudgePartner}>
            催{characterName}打卡
          </button>
        ) : null}
      </div>
      <ul className="rel-checkin-list">
        {checkins.map(item => (
          <li key={item.id}>
            <strong>{item.date}{waitingRelight && item.relationshipId === binding.restoredFromId ? " · 待重燃" : ""}</strong>
            <span>{item.authorType === "user" ? "我" : characterName}</span>
          </li>
        ))}
        {checkins.length === 0 ? <li className="rel-space-empty">还没有打卡记录</li> : null}
      </ul>
    </div>
  );
}

function RelationshipAnniversaryPane({
  binding,
  userId,
  characterName,
  onNotice,
  onPersonaNudge,
}: {
  binding: RelationshipBinding;
  userId: string;
  characterName: string;
  onNotice: (text: string) => void;
  onPersonaNudge?: (kind: "checkin" | "anniversary") => void;
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
          const result = addAnniversary(binding.id, title, date, "user", userId);
          if ("error" in result) {
            onNotice(result.error);
            return;
          }
          setTitle("");
          setDate("");
          onNotice("已添加纪念日");
          onPersonaNudge?.("anniversary");
        }}
      >
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="纪念日名称，比如在一起" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button type="submit" className="rel-space-primary">添加</button>
      </form>
      <ul className="rel-anniv-list">
        {items.map(item => {
          const count = anniversaryCountdown(item.date);
          const who = item.authorType === "character" ? characterName : "我";
          return (
            <li key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.date} · {count.occurred ? "就是今天" : `还有 ${count.days} 天`} · {who}加的</span>
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
