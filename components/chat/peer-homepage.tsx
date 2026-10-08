"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, MessageCircle, Phone, Video } from "lucide-react";
import { loadCharacters, saveCharacters } from "@/lib/character-storage";
import { getAllPosts } from "@/lib/moments-storage";
import { generateMomentsBackfill } from "@/lib/moments-backfill";
import { MomentTextThumb } from "./moment-text-thumb";
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
    const [tab, setTab] = useState<"home" | "moments">("home");
    const [openPostId, setOpenPostId] = useState<string | null>(null);
    const [coverBusy, setCoverBusy] = useState(false);
    const [coverLinkOpen, setCoverLinkOpen] = useState(false);
    const [coverLinkUrl, setCoverLinkUrl] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
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
    }, [characterId, tab, refreshing, postsTick]);

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
        // 棰勮鍙敹鏈夊浘鍔ㄦ€侊紙瀹炲浘鎴栨枃瀛楀浘锛夛紝绾枃瀛楀姩鎬佷笉鍗犱綅
        () => posts.filter(p => p.photoUrl || p.photoDescription).slice(0, 4),
        [posts],
    );

    if (!character) return null;
    const displayName = character.screenName?.trim() || character.name || "瀵规柟";
    const theme = derivePeerCoverTheme(character);
    const coverStyle: React.CSSProperties = character.momentsCover
        ? { backgroundImage: `url(${character.momentsCover})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: theme.background };

    const refresh = () => {
        setCharacter(loadCharacters().find(c => c.id === characterId) || null);
        setPostsTick(t => t + 1);
    };

    // 棣栨杩涘叆鑷姩琛ュ叏锛氭病鍔ㄦ€佸氨涓€娆¤皟鐢ㄧ敓鎴?5-10 鏉¤繃寰€鍔ㄦ€侊紙鏃堕棿閾哄紑锛屾ā鎷熺湡瀹炴湅鍙嬪湀锛?    useEffect(() => {
        let cancelled = false;
        try {
            const existing = getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId);
            if (existing.length > 0) return;
        } catch {
            return;
        }
        setRefreshing(true);
        void generateMomentsBackfill(characterId)
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
            flash("灏侀潰宸叉洿鎹?);
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
                    {tab === "moments" && <span className="peer-home-topbar-title">鏈嬪弸鍦?/span>}
                </div>

                {tab === "home" ? (
                    <>
                        <div className="peer-home-cover" style={coverStyle}>
                            <button
                                type="button"
                                className="peer-home-cover-btn"
                                disabled={coverBusy}
                                onClick={() => coverInputRef.current?.click()}
                                aria-label="鏇存崲灏侀潰"
                            >
                                <Camera size={16} />
                                {coverBusy ? "澶勭悊涓? : "鎹㈠皝闈?}
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
                                        onClick={() => { patchCharacter({ momentsCover: coverLinkUrl.trim() }); flash("灏侀潰宸叉洿鎹?); setCoverLinkOpen(false); setCoverLinkUrl(""); }}
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
                        <div className="peer-home-rows">
                            <div className="peer-home-row">
                                <span className="peer-home-label">鏄电О</span>
                                <span className="peer-home-value">{character.name || "鏈懡鍚?}</span>
                            </div>
                            <div className="peer-home-row">
                                <span className="peer-home-label">寰俊鍙?/span>
                                <span className="peer-home-value">{character.wechatID || character.id.slice(-8)}</span>
                            </div>
                            {character.personality?.trim() && (
                                <div className="peer-home-row">
                                    <span className="peer-home-label">涓€х鍚?/span>
                                    <span className="peer-home-value peer-home-sign">{character.personality.trim().slice(0, 60)}</span>
                                </div>
                            )}
                            <button type="button" className="peer-home-row peer-home-moments-entry" onClick={() => setTab("moments")}>
                                <span className="peer-home-label">鏈嬪弸鍦?/span>
                                <span className="peer-home-thumbs">
                                    {refreshing ? (
                                        <span className="peer-home-empty">姝ｅ湪鎸変汉璁惧埛鏂扳€?/span>
                                    ) : previewPhotos.length === 0 ? (
                                        <span className="peer-home-empty">鏆傛棤鍔ㄦ€?/span>
                                    ) : (
                                        previewPhotos.map(p => (
                                            <span key={p.id} className="peer-home-thumb">
                                                {p.photoUrl
                                                    ? <img src={p.photoUrl} alt="" />
                                                    : <MomentTextThumb text={p.photoDescription || p.content} size={56} radius={4} />}
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
                                    <MessageCircle size={18} /> 鍙戞秷鎭?                                </button>
                            ) : null}
                            {onVoiceCall ? (
                                <button type="button" className="peer-home-action-btn" onClick={onVoiceCall}>
                                    <Phone size={18} /> 闊宠棰戦€氳瘽
                                </button>
                            ) : null}
                            {onVideoCall && !onVoiceCall ? (
                                <button type="button" className="peer-home-action-btn" onClick={onVideoCall}>
                                    <Video size={18} /> 瑙嗛閫氳瘽
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
                        <div className="peer-home-feed-list">
                            {(pinned ? [pinned, ...restPosts] : restPosts).map(post => (
                                <WxMomentRow key={post.id} post={post} onOpen={postId => setOpenPostId(postId)} />
                            ))}
                            {posts.length === 0 && (
                                <div className="peer-home-empty-feed">
                                    {refreshing ? "姝ｅ湪鐢熸垚 TA 鐨勬湅鍙嬪湀鈥? : "TA 杩樻病鏈夊彂甯冭繃鍔ㄦ€?}
                                </div>
                            )}
                        </div>
                    </div>
                )}
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
