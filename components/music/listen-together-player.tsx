"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { overlayCharacterForDisplay, overlayUserIdentityForDisplay } from "@/lib/couple-avatar-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import {
    appendListenTogetherMessage,
    endListenTogetherSession,
    formatListenDuration,
    getActiveListenTogetherSession,
    getListenTogetherSession,
    loadListenTogetherSessions,
    LISTEN_TOGETHER_UPDATED_EVENT,
} from "@/lib/listen-together-storage";
import type { ListenTogetherSession, ListenTogetherTrack } from "@/lib/listen-together-types";
import { generateListenTogetherReply, splitListenTogetherBubbles } from "@/lib/listen-together-engine";
import { parseLyricLines } from "./listen-together";
import { sendListenTogetherReportCard } from "@/lib/listen-together-share";
import { getMusicControlBridge } from "@/lib/music-control-bridge";
import { STICKER_PACKS } from "@/lib/sticker-data";

export type ListenTogetherBodyTab = "player" | "chat";

type Props = {
    session: ListenTogetherSession;
    track: { id: string; title: string; artist: string; coverUrl?: string; lyrics?: string };
    isPlaying: boolean;
    currentTime: number;
    tab: ListenTogetherBodyTab;
    onTabChange: (tab: ListenTogetherBodyTab) => void;
    onOpenQueue: () => void;
    onNotice: (text: string) => void;
};

function formatTogetherElapsed(startedAt: string, now: number): string {
    const ms = Math.max(0, now - Date.parse(startedAt));
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours <= 0) return `一起听了${mins}分钟`;
    return `一起听了${hours}小时${mins}分钟`;
}

/** 双人头 + 各自名下气泡：每人最多2条，12秒后消失，完整记录去记录页 */
function DuoBar({ sessionId, characterName, playing }: { sessionId: string; characterName: string; playing: boolean }) {
    const [tick, setTick] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const refresh = () => setTick(n => n + 1);
        window.addEventListener("characters-updated", refresh);
        window.addEventListener("user-identities-updated", refresh);
        window.addEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
        const timer = window.setInterval(() => setNow(Date.now()), 2000);
        return () => {
            window.removeEventListener("characters-updated", refresh);
            window.removeEventListener("user-identities-updated", refresh);
            window.removeEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
            window.clearInterval(timer);
        };
    }, []);
    const session = getListenTogetherSession(sessionId) || getActiveListenTogetherSession();
    void tick;
    if (!session) return null;
    const raw = loadCharacters().find(item => item.id === session.characterId) || null;
    const character = raw ? overlayCharacterForDisplay(raw) : null;
    const identity = overlayUserIdentityForDisplay(session.characterId, resolveUserIdentity(session.characterId, "chat"));
    const userName = identity?.name || "我";
    const peerName = character?.screenName?.trim() || characterName;
    const fresh = (author: "user" | "character") =>
        (session.messages || [])
            .filter(m => m.author === author && now - Date.parse(m.createdAt) < 12000)
            .slice(-2);
    const mine = fresh("user");
    const theirs = fresh("character");
    return (
        <div className="ltp-duo" {...(playing ? { "data-playing": "" } : {})}>
            <span className="ltp-person">
                <span className="ltp-avatar" data-me="">
                    {identity?.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <ChatFallbackAvatar />}
                </span>
                <em className="ltp-name">{userName}</em>
                {mine.map(m => (
                    <span key={m.id} className="ltp-under-bubble is-me">{m.text}</span>
                ))}
            </span>
            <span className="ltp-together" aria-hidden="true" />
            <span className="ltp-person">
                <span className="ltp-avatar">
                    {character?.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                </span>
                <em className="ltp-name">{peerName}</em>
                {theirs.map(m => (
                    <span key={m.id} className="ltp-under-bubble">{m.text}</span>
                ))}
            </span>
        </div>
    );
}

function ChatBubbles({ sessionId, limit }: { sessionId: string; limit?: number }) {
    const [, force] = useState(0);
    useEffect(() => {
        const refresh = () => force(n => n + 1);
        window.addEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
        return () => window.removeEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
    }, []);
    const session = getListenTogetherSession(sessionId);
    const messages = useMemo(() => {
        const all = (session?.messages || []).filter(m => m.kind !== "emoji" || true);
        if (!limit) return all;
        const mine = all.filter(m => m.author === "user").slice(-2);
        const theirs = all.filter(m => m.author === "character").slice(-2);
        const mineIds = new Set(mine.map(m => m.id));
        const theirsIds = new Set(theirs.map(m => m.id));
        return all.filter(m => mineIds.has(m.id) || theirsIds.has(m.id));
    }, [session?.messages, limit]);
    const raw = session ? loadCharacters().find(item => item.id === session.characterId) || null : null;
    const character = raw ? overlayCharacterForDisplay(raw) : null;
    const identity = session
        ? overlayUserIdentityForDisplay(session.characterId, resolveUserIdentity(session.characterId, "chat"))
        : null;
    return (
        <div className="ltp-bubbles">
            {messages.map(m => (
                <div key={m.id} className={`ltp-msg${m.author === "user" ? " is-me" : ""}`}>
                    {m.author !== "user" && (
                        <span className="ltp-msg-avatar">
                            {character?.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                        </span>
                    )}
                    <span className="ltp-msg-text">{m.text}</span>
                    {m.author === "user" && (
                        <span className="ltp-msg-avatar" data-me="">
                            {identity?.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <ChatFallbackAvatar />}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
    const emojis = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const pack of STICKER_PACKS) {
            for (const item of pack.stickers) {
                if (item.emoji && !seen.has(item.emoji)) {
                    seen.add(item.emoji);
                    out.push(item.emoji);
                }
            }
        }
        return out.slice(0, 60);
    }, []);
    return (
        <div className="ltp-emoji-panel">
            {emojis.map((emoji, index) => (
                <button key={`${emoji}-${index}`} type="button" className="ltp-emoji" onClick={() => onPick(emoji)}>
                    {emoji}
                </button>
            ))}
        </div>
    );
}

/** 当前正在一起听歌单（p4）：只列歌名+歌手+删，不做详细信息 */
export function ListenTogetherQueueSheet({ sessionId, onClose, onNotice }: { sessionId: string; onClose: () => void; onNotice: (text: string) => void }) {
    const [, force] = useState(0);
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const refresh = () => force(n => n + 1);
        window.addEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
        return () => window.removeEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
    }, []);
    const session = getListenTogetherSession(sessionId);
    const tracks = session?.tracks || [];
    const addByQuery = async () => {
        const text = query.trim();
        if (!text || busy) return;
        setBusy(true);
        try {
            const bridge = getMusicControlBridge();
            const resolved = await bridge?.resolveByQuery(text);
            if (!resolved) {
                onNotice("没找到这首歌");
                return;
            }
            const { addListenTogetherPlaylistTrack } = await import("@/lib/listen-together-storage");
            addListenTogetherPlaylistTrack(sessionId, {
                id: resolved.id,
                title: resolved.title,
                artist: resolved.artist || "",
                coverUrl: resolved.coverUrl,
            });
            setQuery("");
            onNotice(`已加入一起听：${resolved.title}`);
        } finally {
            setBusy(false);
        }
    };
    const removeTrack = async (trackId: string, title: string) => {
        const { removeListenTogetherPlaylistTrack } = await import("@/lib/listen-together-storage");
        removeListenTogetherPlaylistTrack(sessionId, trackId);
        onNotice(`已移出：${title}`);
    };
    return (
        <div className="ltp-sheet-mask" onClick={onClose}>
            <div className="ltp-sheet" onClick={e => e.stopPropagation()}>
                <div className="ltp-sheet-title">当前正在一起听</div>
                <div className="ltp-sheet-list">
                    {tracks.length === 0 && <div className="ltp-sheet-empty">还没加歌，在下面搜一首吧</div>}
                    {tracks.map(item => (
                        <div key={item.id} className="ltp-track-row">
                            <span className="ltp-track-note" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                            </span>
                            <span className="ltp-track-name">{item.title}{item.artist ? ` · ${item.artist}` : ""}</span>
                            <button type="button" className="ltp-track-x" onClick={() => void removeTrack(item.id, item.title)} aria-label="移出">×</button>
                        </div>
                    ))}
                </div>
                <div className="ltp-add-row">
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") void addByQuery(); }}
                        placeholder="可额外添加歌曲到当前一起听列表"
                    />
                    <button type="button" disabled={busy || !query.trim()} onClick={() => void addByQuery()}>添加</button>
                </div>
            </div>
        </div>
    );
}

/** 聊天记录完整页（p8） */
export function ListenTogetherRecordsSheet({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
    const session = getListenTogetherSession(sessionId);
    const raw = session ? loadCharacters().find(item => item.id === session.characterId) || null : null;
    const character = raw ? overlayCharacterForDisplay(raw) : null;
    return (
        <div className="ltp-sheet-mask" onClick={onClose}>
            <div className="ltp-sheet ltp-sheet-tall" onClick={e => e.stopPropagation()}>
                <div className="ltp-sheet-head">
                    <span className="ltp-sheet-title">一起听聊天记录</span>
                    <button type="button" className="ltp-x" onClick={onClose} aria-label="关闭">×</button>
                </div>
                <div className="ltp-bubbles ltp-bubbles-full">
                    {(session?.messages || []).map(m => (
                        <div key={m.id} className={`ltp-msg${m.author === "user" ? " is-me" : ""}`}>
                            {m.author !== "user" && (
                                <span className="ltp-msg-avatar">
                                    {character?.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                                </span>
                            )}
                            <span className="ltp-msg-text">{m.text}</span>
                        </div>
                    ))}
                    {(session?.messages || []).length === 0 && <div className="ltp-sheet-empty">还没有聊天记录</div>}
                </div>
            </div>
        </div>
    );
}

/** 历史一起听（p7）：和 TA 的记录 + 聊天记录/分享报告入口 */
export function ListenTogetherHistorySheet({ characterId, characterName, onClose, onOpenRecords, onNotice }: {
    characterId: string;
    characterName: string;
    onClose: () => void;
    onOpenRecords: (sessionId: string) => void;
    onNotice: (text: string) => void;
}) {
    const sessions = loadListenTogetherSessions().filter(s => s.characterId === characterId);
    const totalTracks = sessions.reduce((sum, s) => sum + s.tracks.length, 0);
    const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);
    const raw = loadCharacters().find(item => item.id === characterId) || null;
    const character = raw ? overlayCharacterForDisplay(raw) : null;
    return (
        <div className="ltp-sheet-mask" onClick={onClose}>
            <div className="ltp-sheet ltp-sheet-tall" onClick={e => e.stopPropagation()}>
                <div className="ltp-sheet-head">
                    <span className="ltp-sheet-title">和TA的一起听</span>
                    <button type="button" className="ltp-x" onClick={onClose} aria-label="关闭">×</button>
                </div>
                <div className="ltp-history-head">
                    <span className="ltp-history-avatar">
                        {character?.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                    </span>
                    <div className="ltp-history-meta">
                        <strong>{character?.screenName?.trim() || characterName}</strong>
                    </div>
                </div>
                {sessions.length === 0 && <div className="ltp-sheet-empty">还没有一起听记录</div>}
                {sessions.map(item => (
                    <div key={item.id} className="ltp-history-card">
                        <div className="ltp-history-stats">
                            <span>本次一起听了 <b>{item.tracks.length}首歌曲</b></span>
                            <span>本次陪伴彼此 <b>{formatListenDuration(item)}</b></span>
                        </div>
                        <div className="ltp-history-sub">累计{totalTracks}首歌曲 · 互发消息{totalMessages}条</div>
                        <div className="ltp-history-actions">
                            <button type="button" onClick={() => onOpenRecords(item.id)}>聊天记录</button>
                            <button
                                type="button"
                                onClick={() => {
                                    sendListenTogetherReportCard({
                                        characterId: item.characterId,
                                        characterName: item.characterName,
                                        session: item,
                                    });
                                    onNotice("报告已发到聊天");
                                    onClose();
                                }}
                            >
                                分享报告
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ListenTogetherPlayerBody({ session, track, isPlaying, currentTime, tab, onTabChange, onOpenQueue, onNotice }: Props) {
    const [now, setNow] = useState(() => Date.now());
    const [coverMode, setCoverMode] = useState<"vinyl" | "cover" | "lyrics">("vinyl");
    const [draft, setDraft] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [recordsId, setRecordsId] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const lyricLines = useMemo(() => parseLyricLines(track.lyrics), [track.lyrics]);
    const lyricActive = useMemo(() => {
        let idx = -1;
        lyricLines.forEach((line, i) => {
            if (currentTime >= line.time) idx = i;
        });
        return idx;
    }, [lyricLines, currentTime]);

    const sendText = async (text: string) => {
        const content = text.trim();
        if (!content || sending) return;
        const active = getActiveListenTogetherSession();
        if (!active || active.status !== "active") {
            onNotice("一起听已结束");
            return;
        }
        setSending(true);
        setDraft("");
        setShowEmoji(false);
        try {
            appendListenTogetherMessage(active.id, { author: "user", text: content });
            const reply = await generateListenTogetherReply({
                characterId: active.characterId,
                session: getListenTogetherSession(active.id) || active,
                userText: content,
                currentTrack: {
                    id: track.id,
                    title: track.title,
                    artist: track.artist || "",
                    coverUrl: track.coverUrl,
                    lyrics: track.lyrics,
                },
                lyrics: track.lyrics,
            });
            const names = [active.characterName, "我", "用户"];
            for (const part of splitListenTogetherBubbles(reply.text, names)) {
                appendListenTogetherMessage(active.id, { author: "character", text: part });
            }
            const bridge = getMusicControlBridge();
            for (const action of reply.actions) {
                if (action.kind === "play" && action.query) await bridge?.playByQuery(action.query);
                else if (action.kind === "skip") {
                    if (action.action === "prev") bridge?.prev();
                    else bridge?.next();
                } else if (action.kind === "playlist_add" && action.queries.length > 0) {
                    const { addManyListenTogetherPlaylistTracks } = await import("@/lib/listen-together-storage");
                    const resolved = await Promise.all(action.queries.map(q => bridge?.resolveByQuery(q).catch(() => null)));
                    const fresh = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
                    if (fresh.length > 0) {
                        addManyListenTogetherPlaylistTracks(active.id, fresh.map(item => ({
                            id: item.id,
                            title: item.title,
                            artist: item.artist || "",
                            coverUrl: item.coverUrl,
                        })));
                        onNotice(`对方加了${fresh.length}首歌`);
                    }
                } else if (action.kind === "playlist_remove") {
                    const { removeListenTogetherPlaylistTrack } = await import("@/lib/listen-together-storage");
                    const latest = getListenTogetherSession(active.id);
                    const hit = latest?.tracks.find(item => item.title.includes(action.title) || action.title.includes(item.title));
                    if (hit) removeListenTogetherPlaylistTrack(active.id, hit.id);
                } else if (action.kind === "emoji" && action.emoji) {
                    appendListenTogetherMessage(active.id, { author: "character", text: action.emoji, kind: "emoji" });
                } else if (action.kind === "end" || action.kind === "refuse") {
                    endListenTogetherSession(active.id);
                    onNotice("对方结束了一起听");
                }
            }
        } catch {
            onNotice("这句没有发出，去聊天里说吧");
        } finally {
            setSending(false);
        }
    };

    const pickEmoji = (emoji: string) => {
        void sendText(emoji);
    };

    const closeTogether = () => {
        endListenTogetherSession(session.id);
        setShowMenu(false);
        onNotice("一起听已结束，可在历史里回看");
        setShowHistory(true);
    };

    return (
        <div className="ltp-wrap">
            <DuoBar sessionId={session.id} characterName={session.characterName} playing={isPlaying} />
            <div className="ltp-elapsed">{formatTogetherElapsed(session.startedAt, now)}</div>
            {tab === "player" ? (
                coverMode === "lyrics" ? (
                    <button
                        type="button"
                        className="ltp-lyrics"
                        onClick={() => setCoverMode("cover")}
                        aria-label="返回封面"
                    >
                        {lyricLines.length === 0 ? (
                            <span className="ltp-lyric" data-active="">暂无歌词</span>
                        ) : (
                            lyricLines.map((line, i) => (
                                <span
                                    key={`${line.time}-${i}`}
                                    className="ltp-lyric"
                                    {...(i === lyricActive ? { "data-active": "" } : {})}
                                >
                                    {line.text || " "}
                                </span>
                            ))
                        )}
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            className="ltp-art"
                            data-mode={coverMode}
                            data-playing={isPlaying ? "" : undefined}
                            onClick={() => setCoverMode(prev => (prev === "vinyl" ? "cover" : "lyrics"))}
                            aria-label="切换黑胶/封面/歌词"
                        >
                            {coverMode === "vinyl" ? (
                                <span className="ltp-vinyl">
                                    <span className="ltp-vinyl-disc">
                                        {track.coverUrl ? <img src={track.coverUrl} alt="" /> : null}
                                    </span>
                                </span>
                            ) : (
                                <span className="ltp-cover">
                                    {track.coverUrl ? <img src={track.coverUrl} alt="" /> : <ChatFallbackAvatar />}
                                </span>
                            )}
                        </button>
                        <div className="ltp-song">{track.title}</div>
                        <div className="ltp-artist">{track.artist || "未知歌手"}</div>
                    </>
                )
            ) : (
                <div className="ltp-chat">
                    <div className="ltp-chat-head">
                        <span className="ltp-song">{track.title}</span>
                        <span className="ltp-menu-wrap">
                            <button type="button" className="ltp-menu-btn" onClick={() => setShowMenu(prev => !prev)} aria-label="菜单">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                            </button>
                            {showMenu && (
                                <span className="ltp-menu">
                                    <button type="button" onClick={() => { setShowMenu(false); setShowHistory(true); }}>历史听歌记录</button>
                                    <button type="button" onClick={closeTogether}>关闭一起听</button>
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="ltp-chat-list">
                        <ChatBubbles sessionId={session.id} />
                        {sending && (
                            <div className="ltp-calling"><span /><span /><span /></div>
                        )}
                    </div>
                    <div className="ltp-input-row">
                        <input
                            ref={inputRef}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") void sendText(draft); }}
                            placeholder="说点什么..."
                        />
                        <button type="button" className="ltp-emoji-btn" onClick={() => setShowEmoji(prev => !prev)} aria-label="表情">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" /><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" /></svg>
                        </button>
                        {draft.trim() && (
                            <button type="button" className="ltp-send" disabled={sending} onClick={() => void sendText(draft)}>发送</button>
                        )}
                    </div>
                    {showEmoji && <EmojiPanel onPick={pickEmoji} />}
                </div>
            )}
            <div className="ltp-tab">
                <button type="button" data-active={tab === "player" ? "" : undefined} onClick={() => onTabChange("player")} aria-label="播放">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                </button>
                <button type="button" data-active={tab === "chat" ? "" : undefined} onClick={() => onTabChange("chat")} aria-label="聊天">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </button>
                <button type="button" className="ltp-queue-link" onClick={onOpenQueue}>歌单</button>
            </div>
            {showHistory && (
                <ListenTogetherHistorySheet
                    characterId={session.characterId}
                    characterName={session.characterName}
                    onClose={() => setShowHistory(false)}
                    onOpenRecords={setRecordsId}
                    onNotice={onNotice}
                />
            )}
            {recordsId && (
                <ListenTogetherRecordsSheet sessionId={recordsId} onClose={() => setRecordsId(null)} />
            )}
        </div>
    );
}
