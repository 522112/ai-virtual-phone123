// components/music/music-favorites-view.tsx — 每个角色独立的"喜欢的歌单"

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import type { MusicTrack } from "@/lib/music-storage";
import type { MusicControlsValue } from "@/lib/music-context";
import { searchNetease, type NeteaseSearchResult } from "@/lib/music-service";
import { fileToCompressedDataUrl } from "@/lib/music-bg";
import { getMusicControlBridge } from "@/lib/music-control-bridge";
import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import {
    MUSIC_FAVORITES_UPDATED_EVENT,
    addFavoriteSong,
    getCharacterFavorites,
    isFavoriteSong,
    removeFavoriteSong,
    updateCharacterFavorites,
    type CharacterFavorites,
    type FavoriteSong,
} from "@/lib/music-favorites-storage";

type Props = {
    player: MusicControlsValue;
    formatTime: (s: number) => string;
    tracks: MusicTrack[];
    onPlayLocal: (track: MusicTrack) => void;
    onPlayNetease: (result: NeteaseSearchResult) => void;
    onUploadFiles: (files: FileList | null) => void;
    onToast: (text: string) => void;
};

const TrashIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

export default function MusicFavoritesView({ player, formatTime, tracks, onPlayLocal, onPlayNetease, onUploadFiles, onToast }: Props) {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [favorites, setFavorites] = useState<CharacterFavorites | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const [addTab, setAddTab] = useState<"local" | "netease">("local");
    const [addQuery, setAddQuery] = useState("");
    const [addResults, setAddResults] = useState<NeteaseSearchResult[]>([]);
    const [addSearching, setAddSearching] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<FavoriteSong | null>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const refreshCharacters = useCallback(() => {
        const list = loadCharacters();
        setCharacters(list);
        if (list.length > 0) {
            setSelectedId(prev => (prev && list.some(c => c.id === prev) ? prev : list[0].id));
        }
    }, []);

    useEffect(() => {
        refreshCharacters();
        const handler = () => refreshCharacters();
        window.addEventListener(CHARACTERS_UPDATED_EVENT, handler);
        return () => window.removeEventListener(CHARACTERS_UPDATED_EVENT, handler);
    }, [refreshCharacters]);

    const reload = useCallback(() => {
        if (!selectedId) { setFavorites(null); return; }
        const character = characters.find(c => c.id === selectedId);
        setFavorites(getCharacterFavorites(selectedId, character?.name));
    }, [characters, selectedId]);

    useEffect(() => {
        reload();
        const handler = () => reload();
        window.addEventListener(MUSIC_FAVORITES_UPDATED_EVENT, handler);
        return () => window.removeEventListener(MUSIC_FAVORITES_UPDATED_EVENT, handler);
    }, [reload]);

    const selectedCharacter = characters.find(c => c.id === selectedId) || null;

    const openEditor = () => {
        if (!favorites) return;
        setEditName(favorites.name);
        setEditDesc(favorites.description);
        setShowEditor(true);
    };

    const saveEditor = () => {
        if (!favorites) return;
        updateCharacterFavorites(favorites.characterId, favorites.characterName, {
            name: editName.trim() || "喜欢的音乐",
            description: editDesc,
        });
        setShowEditor(false);
        onToast("歌单已更新");
    };

    const handleCover = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file || !favorites) return;
        try {
            const dataUrl = await fileToCompressedDataUrl(file, 720, 0.85);
            updateCharacterFavorites(favorites.characterId, favorites.characterName, { coverUrl: dataUrl });
            onToast("封面已更换");
        } catch {
            onToast("封面上传失败");
        }
    };

    const addLocalSong = (track: MusicTrack) => {
        if (!favorites) return;
        const res = addFavoriteSong(favorites.characterId, favorites.characterName, {
            source: "local",
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            coverUrl: track.coverUrl,
            duration: track.duration,
            addedBy: "user",
        });
        onToast(res.added ? "已加入歌单" : "歌单里已经有这首歌了");
    };

    const addNeteaseSong = (result: NeteaseSearchResult) => {
        if (!favorites) return;
        const res = addFavoriteSong(favorites.characterId, favorites.characterName, {
            source: "netease",
            neteaseId: result.id,
            title: result.name,
            artist: result.artists,
            album: result.album,
            coverUrl: result.coverUrl,
            duration: Math.round((result.duration || 0) / 1000),
            addedBy: "user",
        });
        onToast(res.added ? "已加入歌单" : "歌单里已经有这首歌了");
    };

    const doAddSearch = async () => {
        if (!addQuery.trim()) return;
        setAddSearching(true);
        try {
            const r = await searchNetease(addQuery.trim());
            setAddResults(r);
        } catch {
            onToast("搜索失败");
        }
        setAddSearching(false);
    };

    const playFavorite = (song: FavoriteSong) => {
        if (song.source === "netease" && song.neteaseId) {
            onPlayNetease({
                id: song.neteaseId,
                name: song.title,
                artists: song.artist,
                album: song.album || "",
                duration: Math.round((song.duration || 0) * 1000),
                coverUrl: song.coverUrl,
            });
            return;
        }
        if (song.trackId) {
            const local = tracks.find(t => t.id === song.trackId);
            if (local) {
                onPlayLocal(local);
                return;
            }
            onPlayLocal({
                id: song.trackId,
                title: song.title,
                artist: song.artist,
                album: song.album,
                duration: song.duration || 0,
                coverUrl: song.coverUrl,
                liked: false,
                addedAt: song.addedAt,
            });
            return;
        }
        const keyword = [song.title, song.artist].filter(Boolean).join(" ").trim();
        if (keyword) {
            void getMusicControlBridge()?.playByQuery(song.title, song.artist || undefined);
        } else {
            onToast("这首歌暂时无法播放");
        }
    };

    if (characters.length === 0) {
        return (
            <div className="music-empty">
                <div className="music-empty-icon">♪</div>
                <div className="music-empty-text">还没有角色，先去创建一个角色吧</div>
            </div>
        );
    }

    return (
        <div className="music-fav">
            <style>{`
.fav-modal{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,6,12,0.55);backdrop-filter:blur(8px);z-index:60;animation:favFade 0.22s ease}
@keyframes favFade{from{opacity:0}to{opacity:1}}
.fav-sheet{width:100%;max-height:84%;overflow:hidden auto;border-radius:22px 22px 0 0;background:linear-gradient(170deg,#221d2e,#14121a 55%,#191423);border:1px solid rgba(255,255,255,0.1);border-bottom:none;color:#f4efe8;box-shadow:0 -12px 48px rgba(0,0,0,0.6);animation:favUp 0.28s cubic-bezier(0.2,0.9,0.3,1.1);padding:6px 0 18px}
@keyframes favUp{from{transform:translateY(48px);opacity:0}to{transform:none;opacity:1}}
.fav-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px 8px;font-size:15px;font-weight:800}
.fav-sheet-head button{background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.1);color:#f4efe8;font-size:12px;padding:5px 12px;border-radius:999px}
.fav-sheet-body{padding:2px 16px 8px}
.fav-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:12px;opacity:1;color:#cfc8dc}
.fav-input{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:#fff;font-size:14px;padding:10px 12px;width:100%;box-sizing:border-box}
textarea.fav-input{resize:vertical;min-height:64px;font-family:inherit}
.fav-actions{display:flex;gap:8px;margin-top:4px}
.fav-btn{flex:1;border-radius:12px;padding:10px;font-size:13px;font-weight:700;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);color:#fff}
.fav-btn-primary{background:linear-gradient(135deg,#ff5f8f,#a855f7);border:none}
.fav-btn-danger{background:rgba(255,77,79,0.16);border:1px solid rgba(255,77,79,0.4);color:#ff9090}
.fav-char-scroll{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}
.fav-char-pill{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);color:#fff;font-size:13px}
.fav-char-pill[data-active]{background:linear-gradient(135deg,rgba(255,95,143,0.28),rgba(168,85,247,0.28));border-color:rgba(255,255,255,0.22)}
.fav-char-pill img{width:32px;height:32px;border-radius:50%;object-fit:cover}
.fav-hero{display:flex;gap:14px;align-items:center;background:linear-gradient(140deg,rgba(255,95,143,0.16),rgba(168,85,247,0.16) 60%,rgba(255,255,255,0.04));border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:14px;margin-bottom:12px}
.fav-hero-cover{width:84px;height:84px;border-radius:14px;object-fit:cover;flex:0 0 auto;background:linear-gradient(140deg,#3a3348,#23202b);box-shadow:0 6px 20px rgba(0,0,0,0.5)}
.fav-hero-name{font-size:17px;font-weight:800;display:flex;align-items:center;gap:8px}
.fav-hero-desc{font-size:12px;opacity:0.7;margin-top:3px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fav-hero-sub{display:flex;align-items:center;gap:6px;font-size:11px;opacity:0.75;margin-top:6px}
.fav-hero-sub img{width:16px;height:16px;border-radius:50%;object-fit:cover}
.fav-hero-edit{margin-left:auto;flex:0 0 auto;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.14);color:#fff;font-size:12px;padding:6px 13px;border-radius:999px}
.fav-addbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:12px 0 4px;padding:12px;border-radius:14px;border:1px dashed rgba(255,255,255,0.22);background:rgba(255,255,255,0.04);color:#fff;font-size:13px;font-weight:700}
`}</style>
            {/* 角色选择：头像+名字横滑 */}
            <div className="fav-char-scroll">
                {characters.map(character => (
                    <button
                        key={character.id}
                        type="button"
                        className="fav-char-pill"
                        data-active={character.id === selectedId ? "" : undefined}
                        onClick={() => setSelectedId(character.id)}
                    >
                        <span style={{ display: "inline-flex" }}>
                            {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                        </span>
                        {character.name}
                    </button>
                ))}
            </div>

            {favorites ? (
                <>
                    {/* 歌单卡片：封面+名字+详情+角色头像名字 */}
                    <div className="fav-hero">
                        <button type="button" onClick={() => coverInputRef.current?.click()} title="更换封面" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                            {favorites.coverUrl ? <img className="fav-hero-cover" src={favorites.coverUrl} alt="" /> : (
                                <span className="fav-hero-cover" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                </span>
                            )}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="fav-hero-name">{favorites.name}</div>
                            <div className="fav-hero-desc">{favorites.description || "还没有写简介，点编辑加一句吧"}</div>
                            <div className="fav-hero-sub">
                                {selectedCharacter?.avatar ? <img src={selectedCharacter.avatar} alt="" /> : null}
                                <span>{selectedCharacter?.name || favorites.characterName} 的歌单 · {favorites.songs.length} 首 · 持久保存</span>
                            </div>
                        </div>
                        <button type="button" className="fav-hero-edit" onClick={openEditor}>编辑</button>
                    </div>

                    <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={(e) => { void handleCover(e.target.files); if (coverInputRef.current) coverInputRef.current.value = ""; }} />

                    {/* 歌曲列表 */}
                    {favorites.songs.length === 0 ? (
                        <div className="music-empty"><div className="music-empty-icon">♪</div><div className="music-empty-text">歌单还空着，点下面的加号添加歌曲</div></div>
                    ) : (
                        <div className="music-list">
                            {favorites.songs.map((song, idx) => {
                                const isCurrent = player.currentTrack
                                    && ((song.source === "netease" && player.currentTrack.id === `netease_${song.neteaseId}`)
                                        || (song.source === "local" && player.currentTrack.id === song.trackId));
                                return (
                                    <div key={song.id} className="music-song" {...(isCurrent ? { "data-playing": "" } : {})} style={{ animationDelay: `${Math.min(idx * 0.04, 0.5)}s` }} onClick={() => playFavorite(song)}>
                                        <div className="music-song-cover">
                                            {song.coverUrl ? <img src={song.coverUrl} alt="" /> : (
                                                <div className="music-song-cover-placeholder">
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                                </div>
                                            )}
                                        </div>
                                        <div className="music-song-info">
                                            <div className="music-song-title">
                                                {song.title}
                                                {song.addedBy === "character" ? <span className="music-fav-tag">角色添加</span> : null}
                                            </div>
                                            <div className="music-song-artist">{song.artist}</div>
                                        </div>
                                        <div className="music-song-duration">{song.duration ? formatTime(song.duration) : ""}</div>
                                        <div className="music-song-actions">
                                            <button className="music-song-action-btn" data-danger="" onClick={(e) => { e.stopPropagation(); setDeleteTarget(song); }}>{TrashIcon}</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <button className="fav-addbtn" onClick={() => { setShowAdd(true); setAddTab("local"); setAddQuery(""); setAddResults([]); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        添加歌曲
                    </button>
                </>
            ) : null}

            {/* 编辑歌单信息：弹窗样式 */}
            {showEditor && (
                <div className="fav-modal" onClick={() => setShowEditor(false)}>
                    <div className="fav-sheet" onClick={e => e.stopPropagation()}>
                        <div className="fav-sheet-head"><span>编辑歌单</span><button onClick={() => setShowEditor(false)}>收起</button></div>
                        <div className="fav-sheet-body">
                            <label className="fav-field">
                                <span>歌单名字</span>
                                <input className="fav-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="给歌单起个名字" />
                            </label>
                            <label className="fav-field">
                                <span>详情内容（角色能看到）</span>
                                <textarea className="fav-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="写点介绍/心情" rows={3} />
                            </label>
                            <div className="fav-actions">
                                <button className="fav-btn" onClick={() => setShowEditor(false)}>取消</button>
                                <button className="fav-btn fav-btn-primary" onClick={saveEditor}>保存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 添加歌曲：弹窗样式 */}
            {showAdd && (
                <div className="fav-modal" onClick={() => setShowAdd(false)}>
                    <div className="fav-sheet" onClick={e => e.stopPropagation()}>
                        <div className="fav-sheet-head">
                            <span>添加歌曲</span>
                            <button onClick={() => setShowAdd(false)}>收起</button>
                        </div>
                        <div className="music-fav-add-tabs">
                            <button type="button" data-active={addTab === "local" ? "" : undefined} onClick={() => setAddTab("local")}>本地音乐</button>
                            <button type="button" data-active={addTab === "netease" ? "" : undefined} onClick={() => setAddTab("netease")}>网易云</button>
                        </div>
                        <div className="music-settings-body">
                            {addTab === "local" ? (
                                <>
                                    <button className="music-fav-upload" onClick={() => uploadInputRef.current?.click()}>上传本地音乐</button>
                                    <input ref={uploadInputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { onUploadFiles(e.target.files); if (uploadInputRef.current) uploadInputRef.current.value = ""; }} />
                                    {tracks.length === 0 ? (
                                        <div className="music-empty"><div className="music-empty-text">还没有本地音乐，先上传一首</div></div>
                                    ) : (
                                        <div className="music-list music-fav-pick">
                                            {tracks.map(track => {
                                                const picked = favorites ? isFavoriteSong(favorites.characterId, favorites.characterName, { source: "local", trackId: track.id }) : false;
                                                return (
                                                    <div key={track.id} className="music-song" onClick={() => addLocalSong(track)}>
                                                        <div className="music-song-cover">
                                                            {track.coverUrl ? <img src={track.coverUrl} alt="" /> : (
                                                                <div className="music-song-cover-placeholder">
                                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="music-song-info">
                                                            <div className="music-song-title">{track.title}</div>
                                                            <div className="music-song-artist">{track.artist}</div>
                                                        </div>
                                                        <div className="music-song-duration">{picked ? "已加入" : formatTime(track.duration)}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="music-search-bar">
                                        <input className="music-search-input" placeholder="搜索网易云歌曲..." value={addQuery} onChange={e => setAddQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void doAddSearch()} />
                                        <button className="music-search-btn" onClick={() => void doAddSearch()} disabled={addSearching}>{addSearching ? "..." : "搜索"}</button>
                                    </div>
                                    {addResults.length > 0 ? (
                                        <div className="music-list music-fav-pick">
                                            {addResults.map(result => {
                                                const picked = favorites ? isFavoriteSong(favorites.characterId, favorites.characterName, { source: "netease", neteaseId: result.id }) : false;
                                                return (
                                                    <div key={result.id} className="music-song" onClick={() => addNeteaseSong(result)}>
                                                        <div className="music-song-cover">
                                                            {result.coverUrl ? <img src={result.coverUrl} alt="" /> : (
                                                                <div className="music-song-cover-placeholder">
                                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="music-song-info">
                                                            <div className="music-song-title">{result.name}</div>
                                                            <div className="music-song-artist">{result.artists}</div>
                                                        </div>
                                                        <div className="music-song-duration">{picked ? "已加入" : ""}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 删除歌曲确认：弹窗样式 */}
            {deleteTarget && (
                <div className="fav-modal" onClick={() => setDeleteTarget(null)}>
                    <div className="fav-sheet" onClick={e => e.stopPropagation()}>
                        <div className="fav-sheet-head"><span>移出歌单</span><button onClick={() => setDeleteTarget(null)}>收起</button></div>
                        <div className="fav-sheet-body">
                            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>确定把「{deleteTarget.title}」移出歌单吗？</div>
                            <div className="fav-actions">
                                <button className="fav-btn" onClick={() => setDeleteTarget(null)}>取消</button>
                                <button className="fav-btn fav-btn-danger" onClick={() => { if (favorites) removeFavoriteSong(favorites.characterId, favorites.characterName, deleteTarget.id); setDeleteTarget(null); }}>移出</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
