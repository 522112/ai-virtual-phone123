import { useEffect, useMemo, useState } from "react";
import type { MomentComment, MomentPost } from "@/lib/moments-types";
import {
  addMomentComment,
  loadMomentComments,
  loadMomentPosts,
  toggleMomentLike,
} from "@/lib/moments-storage";
import { loadCharacters } from "@/lib/character-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { getActiveSub } from "./sub-account-sheet";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { MomentTextThumb } from "./moment-text-thumb";

function useAuthorOf(post: MomentPost): { name: string; avatar: string | null } {
  return useMemo(() => {
    if (post.authorType === "character") {
      const hit = loadCharacters().find(c => c.id === post.authorId);
      return { name: hit?.name || "对方", avatar: hit?.avatar || null };
    }
    const me = resolveUserIdentity();
    return { name: me?.name || "我", avatar: me?.avatarUrl || null };
  }, [post.authorType, post.authorId]);
}

function formatWxTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 24 * 3600_000) return `${Math.floor(diff / 3600_000)}小时前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDetailTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function commentAuthorName(c: MomentComment): string {
  if (c.authorType === "character") {
    return loadCharacters().find(ch => ch.id === c.authorId)?.name || "对方";
  }
  if (c.authorName) return c.authorName;
  return "我";
}

function useViewer(): { authorId: string; authorName: string } {
  return useMemo(() => {
    const sub = getActiveSub();
    if (sub) return { authorId: `sub:${sub.id}`, authorName: sub.name };
    const me = resolveUserIdentity();
    return { authorId: me?.id || "user", authorName: me?.name || "我" };
  }, []);
}

/** 朋友圈详情（P3）：点赞/评论/底部评论框，微信交互感 */
export function WxMomentDetail({ postId, onBack, onChanged }: { postId: string; onBack: () => void; onChanged: () => void }) {
  const [post, setPost] = useState<MomentPost | null>(() => loadMomentPosts().find(p => p.id === postId) || null);
  const [comments, setComments] = useState<MomentComment[]>(() => loadMomentComments(postId));
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<MomentComment | null>(null);
  const author = useAuthorOf(post || ({ authorType: "character", authorId: "" } as MomentPost));
  const viewer = useViewer();

  const reload = () => {
    setPost(loadMomentPosts().find(p => p.id === postId) || null);
    setComments(loadMomentComments(postId));
    onChanged();
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [postId]);

  if (!post) return null;
  const liked = post.likes.some(l => l.authorType === "user" && l.authorId === viewer.authorId);
  const likerNames = post.likes.map(l => {
    if (l.authorType === "character") return loadCharacters().find(c => c.id === l.authorId)?.name || "好友";
    return l.authorName || (l.authorId === viewer.authorId ? viewer.authorName : "我");
  });

  const like = () => {
    toggleMomentLike(post.id, "user", viewer.authorId);
    const posts = loadMomentPosts();
    const target = posts.find(p => p.id === post.id);
    if (target && liked === false) {
      const likeEntry = target.likes.find(l => l.authorType === "user" && l.authorId === viewer.authorId);
      if (likeEntry) (likeEntry as { authorName?: string }).authorName = viewer.authorName;
    }
    reload();
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    addMomentComment({
      postId: post.id,
      authorType: "user",
      authorId: viewer.authorId,
      authorName: viewer.authorName,
      content: text.slice(0, 200),
      ...(replyTo ? { replyToCommentId: replyTo.id, replyToAuthorId: replyTo.authorId, replyToAuthorName: commentAuthorName(replyTo) } : {}),
    });
    setDraft("");
    setReplyTo(null);
    reload();
  };

  return (
    <div className="wx-moment-detail">
      <div className="wx-moment-detail-nav">
        <button type="button" onClick={onBack} aria-label="返回">‹</button>
        <span>详情</span>
      </div>
      <div className="wx-moment-detail-body">
        <div className="wx-moment-row">
          <span className="wx-moment-avatar">
            {author.avatar ? <img src={author.avatar} alt="" /> : <ChatFallbackAvatar />}
          </span>
          <div className="wx-moment-main">
            <div className="wx-moment-name">{author.name}</div>
            <div className="wx-moment-text">{post.content}</div>
            {post.photoUrl ? (
              <img className="wx-moment-photo" src={post.photoUrl} alt="" />
            ) : post.photoDescription ? (
              <MomentTextThumb text={post.photoDescription} size={120} radius={4} />
            ) : null}
            <div className="wx-moment-foot">
              <span>{formatDetailTime(post.createdAt)}</span>
              <span className="wx-moment-actions">
                <button type="button" onClick={like}>{liked ? "♥ 已赞" : "♡ 赞"}</button>
                <button type="button" onClick={() => setReplyTo(null)}>评论</button>
              </span>
            </div>
            {likerNames.length > 0 || comments.length > 0 ? (
              <div className="wx-moment-zone">
                {likerNames.length > 0 ? <div className="wx-moment-likes">♥ {likerNames.join("、")}</div> : null}
                {comments.map(c => (
                  <div key={c.id} className="wx-moment-comment">
                    <span className="wx-moment-comment-name">{commentAuthorName(c)}</span>
                    {c.replyToAuthorName ? ` 回复 ${c.replyToAuthorName}` : ""}：{c.content}
                    <button type="button" onClick={() => setReplyTo(c)}>回复</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="wx-moment-inputbar">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={replyTo ? `回复 ${commentAuthorName(replyTo)}：` : "发表评论："}
          maxLength={200}
        />
        <button type="button" disabled={!draft.trim()} onClick={send}>发送</button>
      </div>
    </div>
  );
}

/** 微信风动态行：正文+缩略图，点击进详情；compact 时不显示头像和名字（好友朋友圈页用）。 */
export function WxMomentRow({ post, onOpen, compact }: { post: MomentPost; onOpen: (postId: string) => void; compact?: boolean }) {
  const author = useAuthorOf(post);
  return (
    <div className="wx-moment-row" onClick={() => onOpen(post.id)}>
      {compact ? null : (
        <span className="wx-moment-avatar">
          {author.avatar ? <img src={author.avatar} alt="" /> : <ChatFallbackAvatar />}
        </span>
        )}
      <div className="wx-moment-main">
        {compact ? null : <div className="wx-moment-name">{author.name}</div>}
        <div className="wx-moment-text">{post.content}</div>
        {post.photoUrl || post.photoDescription ? (
          <div className="wx-moment-thumbrow">
            {post.photoUrl ? (
              <img src={post.photoUrl} alt="" />
            ) : (
              <MomentTextThumb text={post.photoDescription || post.content} size={72} />
            )}
          </div>
        ) : null}
        <div className="wx-moment-foot">
          <span>{formatWxTime(post.createdAt)}</span>
          <span className="wx-moment-counts">
            {post.likes.length > 0 ? `♥${post.likes.length}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
