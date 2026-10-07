"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, MessageCircle, Phone, Pin, Video } from "lucide-react";
import { loadCharacters, saveCharacters } from "@/lib/character-storage";
import { getAllPosts } from "@/lib/moments-storage";
import { refreshMomentsForCharacter } from "@/lib/moments-engine";
import type { Character } from "@/lib/character-types";
import type { MomentPost } from "@/lib/moments-types";
import { derivePeerCoverTheme, pickPersonaPinnedPost } from "@/lib/peer-homepage-style";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { MomentPostCard } from "./moment-post-card";

type PeerHomepageProps = {
    characterId: string;
    onClose: () => void;
    onMessage?: () => void;
    onVoiceCall?: () => void;
    onVideoCall?: () => void;
};

function fileToCoverDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
        reader.readAsDataURL(file);
    });
}

function formatDay(iso: string): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const d = new Date(t);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 微信风个人主页：点头像进来，先看主页，点朋友圈只看 TA 的动态。 */
export function PeerHomepage({ characterId, onClose, onMessage, onVoiceCall, onVideoCall }: PeerHomepageProps) {
    const [character, setCharacter] = useState<Character | null>(
        () => loadCharacters().find(c => c.id === characterId) || null,
    );
    const [tab, setTab] = useState<"home" | "moments">("home");
    const [coverBusy, setCoverBusy] = useState(false);
    const [coverLinkOpen, setCoverLinkOpen] = useState(false);
    const [coverLinkUrl, setCoverLinkUrl] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const posts = useMemo<MomentPost[]>(() => {
        try {
            return getAllPosts()
                .filter(p => p.authorType === "character" && p.authorId === characterId)
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        } catch {
            return [];
        }
    }, [characterId, tab, refreshing]);

    const pinned = useMemo<MomentPost | null>(() => {
        if (posts.length === 0) return null;
        const manual = character?.pinnedMomentId
            ? posts.find(p => p.id === character!.pinnedMomentId) || null
            : null;
        return manual || pickPersonaPinnedPost(posts);
    }, [posts, character?.pinnedMomentId]);

    const restPosts = useMemo(
        () => (pinned ? posts.filter(p => p.id !== pinned.id) : posts),
        [posts, pinned],
    );

    const previewPhotos = useMemo(
        () => posts.filter(p => p.photoUrl).slice(0, 4),
        [posts],
    );

    if (!character) return null;
    const displayName = character.screenName?.trim() || character.name || "对方";
    const theme = derivePeerCoverTheme(character);
    const coverStyle: React.CSSProperties = character.momentsCover
        ? { backgroundImage: `url(${character.momentsCover})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: theme.background };

    const refresh = () => {
        setCharacter(loadCharacters().find(c => c.id === characterId) || null);
    };

    // 首次进入自动刷新：没动态就按人设补几条（含加好友前的内容）
    useEffect(() => {
        let cancelled = false;
        try {
            const existing = getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId);
            if (existing.length > 0) return;
        } catch {
            return;
        }
        setRefreshing(true);
        void refreshMomentsForCharacter(characterId)
            .catch(() => {})
            .finally(() => {
                if (cancelled) return;
                setRefreshing(false);
                refresh();
            });
        return () => { cancelled = true; };
    }, [characterId]);

    const flash = (text: string) => {
        setNotice(text);
        window.setTimeout(() => setNotice(current => (current === text ? null : current)), 2200);
    };

    const patchCharacter = (patch: Partial<Character>) => {
        const chars = loadCharacters();
        const idx = chars.findIndex(c => c.id === characterId);
        if (idx === -1) return;
        chars[idx] = { ...chars[idx], ...patch, updatedAt: new Date().toISOString() };
        saveCharacters(chars);
        window.dispatchEvent(new CustomEvent("characters-updated"));
        refresh();
    };

    const pickCover = async (file: File) => {
        setCoverBusy(true);
        try {
            const url = await fileToCoverDataUrl(file);
            patchCharacter({ momentsCover: url });
            flash("封面已更换");
        } catch {
            flash("图片读取失败");
        } finally {
            setCoverBusy(false);
        }
    };

    return (
        <div className="peer-home-overlay" onClick={onClose}>
            <div className="peer-home" onClick={e => e.stopPropagation()}>
                <div className="peer-home-topbar">
                    <button type="button" className="peer-home-back" onClick={onClose} aria-label="返回">
                        <ChevronLeft size={24} strokeWidth={1.5} />
                    </button>
                    {tab === "moments" && <span className="peer-home-topbar-title">朋友圈</span>}
                </div>

                {tab === "home" ? (
                    <>
                        <div className="peer-home-cover" style={coverStyle}>
                            <button
                                type="button"
                                className="peer-home-cover-btn"
                                disabled={coverBusy}
                                onClick={() => coverInputRef.current?.click()}
                                aria-label="更换封面"
                            >
                                <Camera size={16} />
                                {coverBusy ? "处理中" : "换封面"}
                            </button>
                            <button
                                type="button"
                                className="peer-home-cover-btn"
                                style={{ right: 108 }}
                                onClick={() => setCoverLinkOpen(v => !v)}
                                aria-label="用链接换封面"
                            >
                                链接
                            </button>
                            {coverLinkOpen ? (
                                <div style={{ position: "absolute", top: "calc(var(--page-header-safe-top, 48px) + 38px)", right: 12, left: 12, zIndex: 2, display: "flex", gap: 6 }}>
                                    <input
                                        value={coverLinkUrl}
                                        onChange={e => setCoverLinkUrl(e.target.value)}
                                        placeholder="粘贴封面图片链接"
                                        style={{ flex: 1, borderRadius: 10, border: 0, padding: "8px 10px", fontSize: 13 }}
                                    />
                                    <button
                                        type="button"
                                        disabled={!coverLinkUrl.trim().startsWith("http")}
                                        onClick={() => { patchCharacter({ momentsCover: coverLinkUrl.trim() }); flash("封面已更换"); setCoverLinkOpen(false); setCoverLinkUrl(""); }}
                                        style={{ borderRadius: 10, border: 0, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                                    >
                                        确定
                                    </button>
                                </div>
                            ) : null}
                            <input
                                ref={coverInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (file) void pickCover(file);
                                }}
                            />
                            <div className="peer-home-idblock">
                                <div className="peer-home-avatar">
                                    {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                                </div>
                                <div className="peer-home-name">{displayName}</div>
                            </div>
                        </div>
                        <div className="peer-home-rows">
                            <div className="peer-home-row">
                                <span className="peer-home-label">昵称</span>
                                <span className="peer-home-value">{character.name || "未命名"}</span>
                            </div>
                            <div className="peer-home-row">
                                <span className="peer-home-label">微信号</span>
                                <span className="peer-home-value">{character.wechatID || character.id.slice(-8)}</span>
                            </div>
                            {character.personality?.trim() && (
                                <div className="peer-home-row">
                                    <span className="peer-home-label">个性签名</span>
                                    <span className="peer-home-value peer-home-sign">{character.personality.trim().slice(0, 60)}</span>
                                </div>
                            )}
                            <button type="button" className="peer-home-row peer-home-moments-entry" onClick={() => setTab("moments")}>
                                <span className="peer-home-label">朋友圈</span>
                                <span className="peer-home-thumbs">
                                    {refreshing ? (
                                        <span className="peer-home-empty">正在按人设刷新…</span>
                                    ) : previewPhotos.length === 0 ? (
                                        <span className="peer-home-empty">暂无动态</span>
                                    ) : (
                                        previewPhotos.map(p => (
                                            <span key={p.id} className="peer-home-thumb">
                                                {p.photoUrl ? <img src={p.photoUrl} alt="" /> : null}
                                            </span>
                                        ))
                                    )}
                                </span>
                                <ChevronRight size={18} className="peer-home-go" />
                            </button>
                        </div>
                        <div className="peer-home-actions">
                            {onMessage ? (
                                <button type="button" className="peer-home-action-btn" onClick={onMessage}>
                                    <MessageCircle size={18} /> 发消息
                                </button>
                            ) : null}
                            {onVoiceCall ? (
                                <button type="button" className="peer-home-action-btn" onClick={onVoiceCall}>
                                    <Phone size={18} /> 音视频通话
                                </button>
                            ) : null}
                            {onVideoCall && !onVoiceCall ? (
                                <button type="button" className="peer-home-action-btn" onClick={onVideoCall}>
                                    <Video size={18} /> 视频通话
                                </button>
                            ) : null}
                        </div>
                    </>
                ) : (
                    <div className="peer-home-feed">
                        <div className="peer-home-feed-head" onClick={() => setTab("home")}>
                            <div className="peer-home-feed-avatar">
                                {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                            </div>
                            <div className="peer-home-feed-name">{displayName}</div>
                        </div>
                        {pinned && (
                            <div className="peer-home-pinned-tag">
                                <Pin size={13} /> 置顶 · {formatDay(pinned.createdAt)}（按人设精选，可在下面更换）
                            </div>
                        )}
                        <div className="peer-home-feed-list">
                            {(pinned ? [pinned, ...restPosts] : restPosts).map(post => (
                                <div key={post.id} className="peer-home-feed-item">
                                    <MomentPostCard post={post} onUpdate={refresh} />
                                    {(!character.pinnedMomentId || character.pinnedMomentId !== post.id) && (
                                        <button
                                            type="button"
                                            className="peer-home-pin-btn"
                                            onClick={() => {
                                                patchCharacter({ pinnedMomentId: post.id });
                                                flash("已设为置顶");
                                            }}
                                        >
                                            <Pin size={13} /> 设为置顶
                                        </button>
                                    )}
                                </div>
                            ))}
                            {posts.length === 0 && <div className="peer-home-empty-feed">TA 还没有发布过动态</div>}
                        </div>
                    </div>
                )}
                {notice && <div className="peer-home-notice">{notice}</div>}
            </div>
        </div>
    );
}
