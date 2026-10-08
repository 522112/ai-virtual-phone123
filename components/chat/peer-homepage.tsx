"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft } from "lucide-react";
import { loadCharacters, saveCharacters } from "@/lib/character-storage";
import { getAllPosts } from "@/lib/moments-storage";
import { generateMomentsBackfill } from "@/lib/moments-backfill";
import { WxMomentDetail, WxMomentRow } from "./wx-moment-row";
import type { Character } from "@/lib/character-types";
import type { MomentPost } from "@/lib/moments-types";
import { derivePeerCoverTheme, pickPersonaPinnedPost } from "@/lib/peer-homepage-style";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";

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
        reader.onerror = () => reject(reader.error || new Error("鍥剧墖璇诲彇澶辫触"));
        reader.readAsDataURL(file);
    });
}

/** 寰俊椋庝釜浜轰富椤碉細鐐瑰ご鍍忚繘鏉ワ紝鍏堢湅涓婚〉锛岀偣鏈嬪弸鍦堝彧鐪?TA 鐨勫姩鎬併€?*/
export function PeerHomepage({ characterId, onClose, onMessage, onVoiceCall, onVideoCall }: PeerHomepageProps) {
    const [character, setCharacter] = useState<Character | null>(
        () => loadCharacters().find(c => c.id === characterId) || null,
    );
    const [openPostId, setOpenPostId] = useState<string | null>(null);
    const [coverBusy, setCoverBusy] = useState(false);
    const [coverLinkOpen, setCoverLinkOpen] = useState(false);
    const [coverLinkUrl, setCoverLinkUrl] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [backfillError, setBackfillError] = useState("");
    const [postsTick, setPostsTick] = useState(0);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const posts = useMemo<MomentPost[]>(() => {
        try {
            return getAllPosts()
                .filter(p => p.authorType === "character" && p.authorId === characterId)
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        } catch {
            return [];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [characterId, refreshing, postsTick]);

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

    if (!character) return null;
    const displayName = character.screenName?.trim() || character.name || "瀵规柟";
    const signature = character.profileSignature?.trim() || character.personality?.trim().slice(0, 60) || "";
    const theme = derivePeerCoverTheme(character);
    const coverStyle: React.CSSProperties = character.momentsCover
        ? { backgroundImage: `url(${character.momentsCover})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: theme.background };

    const refresh = () => {
        setCharacter(loadCharacters().find(c => c.id === characterId) || null);
        setPostsTick(t => t + 1);
    };

    // 首次进入自动补全：没动态就一次调用生成 5-10 条过往动态（时间铺开，模拟真实朋友圈）
    const runBackfill = () => {
        setBackfillError("");
        setRefreshing(true);
        void generateMomentsBackfill(characterId)
            .catch((error) => { setBackfillError(error instanceof Error ? error.message : "生成失败"); })
            .finally(() => { setRefreshing(false); refresh(); });
    };
 
    // 首次进入自动补全：没动态就一次调用生成 5-10 条过往动态（时间铺开，模拟真实朋友圈）
    useEffect(() => {
        try {
            const existing = getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId);
            if (existing.length > 0) return;
        } catch {
            return;
        }
        runBackfill();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            flash("鍥剧墖璇诲彇澶辫触");
        } finally {
            setCoverBusy(false);
        }
    };

    return (
        <div className="peer-home-overlay" onClick={onClose}>
            <div className="peer-home" onClick={e => e.stopPropagation()}>
                <div className="peer-home-topbar">
                    <button type="button" className="peer-home-back" onClick={onClose} aria-label="杩斿洖">
                        <ChevronLeft size={24} strokeWidth={1.5} />
                    </button>
                    <span className="peer-home-topbar-title">朋友圈</span>
                </div>

                        <div className="peer-home-cover" style={coverStyle}>
                            <button
                                type="button"
                                className="peer-home-cover-btn"
                                disabled={coverBusy}
                                onClick={() => coverInputRef.current?.click()}
                                aria-label="鏇存崲灏侀潰"
                            >
                                <Camera size={16} />
                                {coverBusy ? "澶勭悊涓" : "鎹㈠皝闈"}
                            </button>
                            <button
                                type="button"
                                className="peer-home-cover-btn"
                                style={{ right: 108 }}
                                onClick={() => setCoverLinkOpen(v => !v)}
                                aria-label="鐢ㄩ摼鎺ユ崲灏侀潰"
                            >
                                閾炬帴
                            </button>
                            {coverLinkOpen ? (
                                <div style={{ position: "absolute", top: "calc(var(--page-header-safe-top, 48px) + 38px)", right: 12, left: 12, zIndex: 2, display: "flex", gap: 6 }}>
                                    <input
                                        value={coverLinkUrl}
                                        onChange={e => setCoverLinkUrl(e.target.value)}
                                        placeholder="绮樿创灏侀潰鍥剧墖閾炬帴"
                                        style={{ flex: 1, borderRadius: 10, border: 0, padding: "8px 10px", fontSize: 13 }}
                                    />
                                    <button
                                        type="button"
                                        disabled={!coverLinkUrl.trim().startsWith("http")}
                                        onClick={() => { patchCharacter({ momentsCover: coverLinkUrl.trim() }); flash("灏侀潰宸叉洿鎹"); setCoverLinkOpen(false); setCoverLinkUrl(""); }}
                                        style={{ borderRadius: 10, border: 0, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                                    >
                                        纭畾
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
                        <div className="peer-home-signline">{signature}</div>
                        <div className="peer-home-feed-list">
                            {(pinned ? [pinned, ...restPosts] : restPosts).map(post => (
                                <WxMomentRow key={post.id} post={post} onOpen={postId => setOpenPostId(postId)} />
                            ))}
                            {posts.length === 0 && (
                                <div className="peer-home-empty-feed">
                                    {refreshing ? "正在生成 TA 的朋友圈…" : backfillError ? (
                                        <span>生成失败：{backfillError} <button type="button" onClick={runBackfill}>重试</button></span>
                                    ) : (
                                        <span>TA 还没有发布过动态 <button type="button" onClick={runBackfill}>生成朋友圈</button></span>
                                    )}
                                </div>
                            )}
                        </div>
                {openPostId && (
                    <WxMomentDetail
                        postId={openPostId}
                        onBack={() => setOpenPostId(null)}
                        onChanged={() => refresh()}
                    />
                )}
                {notice && <div className="peer-home-notice">{notice}</div>}
            </div>
        </div>
    );
}
