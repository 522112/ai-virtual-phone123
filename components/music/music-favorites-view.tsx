// components/music/music-favorites-view.tsx — 每个角色独立的"喜欢的歌单"

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import type { MusicTrack } from "@/lib/music-storage";
import type { MusicControlsValue } from "@/lib/music-context";
import { searchNetease, type NeteaseSearchResult } from "@/lib/music-service";
import { fileToCompressedDataUrl } from "@/lib/music-bg";
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
        onToast("这首歌暂时无法播放");
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
            {/* 角色选择 */}
            <div className="music-fav-chars">
                {characters.map(character => (
                    <button
                        key={character.id}
                        type="button"
                        className="music-fav-char"
                        data-active={character.id === selectedId ? "" : undefined}
                        onClick={() => setSelectedId(character.id)}
                    >
                        <span className="music-fav-char-avatar">
                            {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                        </span>
                        <span className="music-fav-char-name">{character.name}</span>
                    </button>
                ))}
            </div>

            {favorites ? (
                <>
                    {/* 歌单卡片 */}
                    <div className="music-fav-card">
                        <button type="button" className="music-fav-cover" onClick={() => coverInputRef.current?.click()} title="更换封面">
                            {favorites.coverUrl ? <img src={favorites.coverUrl} alt="" /> : (
                                <span className="music-fav-cover-placeholder">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                </span>
                            )}
                            <span className="music-fav-cover-hint">换封面</span>
                        </button>
                        <div className="music-fav-meta">
                            <div className="music-fav-name-row">
                                <span className="music-fav-name">{favorites.name}</span>
                                <button type="button" className="music-fav-edit-btn" onClick={openEditor}>编辑</button>
                            </div>
                            <div className="music-fav-desc">{favorites.description || "还没有详情"}</div>
                            <div className="music-fav-count">{selectedCharacter?.name || favorites.characterName} · {favorites.songs.length} 首</div>
                        </div>
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

                    <button className="music-fav-add" onClick={() => { setShowAdd(true); setAddTab("local"); setAddQuery(""); setAddResults([]); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        添加歌曲
                    </button>
                </>
            ) : null}

            {/* 编辑歌单信息 */}
            {showEditor && (
                <div className="music-settings-modal-overlay" onClick={() => setShowEditor(false)}>
                    <div className="music-settings-modal-dialog" onClick={e => e.stopPropagation()}>
                        <div className="music-settings-header"><h2>编辑歌单</h2></div>
                        <div className="music-settings-body">
                            <label className="music-fav-field">
                                <span>歌单名字</span>
                                <input className="music-search-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="给歌单起个名字" />
                            </label>
                            <label className="music-fav-field">
                                <span>详情内容</span>
                                <textarea className="music-fav-textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="写点介绍/心情" rows={3} />
                            </label>
                            <div className="music-settings-actions">
                                <button className="music-settings-btn" onClick={() => setShowEditor(false)}>取消</button>
                                <button className="music-settings-btn music-settings-btn-primary" onClick={saveEditor}>保存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 添加歌曲 */}
            {showAdd && (
                <div className="music-settings-modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="music-settings-modal-dialog" onClick={e => e.stopPropagation()}>
                        <div className="music-settings-header">
                            <h2>添加歌曲</h2>
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

            {/* 删除歌曲确认 */}
            {deleteTarget && (
                <div className="music-settings-modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="music-settings-modal-dialog music-confirm-dialog" onClick={e => e.stopPropagation()}>
                        <div className="music-settings-header"><h2>移出歌单</h2></div>
                        <div className="music-settings-body">
                            <div className="music-confirm-text">确定把「{deleteTarget.title}」移出歌单吗？</div>
                            <div className="music-settings-actions">
                                <button className="music-settings-btn" onClick={() => setDeleteTarget(null)}>取消</button>
                                <button className="music-settings-btn music-settings-btn-danger" onClick={() => { if (favorites) removeFavoriteSong(favorites.characterId, favorites.characterName, deleteTarget.id); setDeleteTarget(null); }}>移出</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
