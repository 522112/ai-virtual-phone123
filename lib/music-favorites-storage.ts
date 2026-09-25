// lib/music-favorites-storage.ts — 每个角色单独一份"喜欢的歌单"（名字/详情/封面/歌曲）

import { kvGet, kvSet } from "./kv-db";

export type FavoriteSong = {
    id: string;
    source: "local" | "netease";
    trackId?: string;        // 本地歌曲 id（source=local）
    neteaseId?: number;      // 网易云歌曲 id（source=netease）
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;       // 秒
    addedBy: "user" | "character";
    addedAt: string;
};

export type CharacterFavorites = {
    characterId: string;
    characterName: string;
    name: string;            // 歌单名字
    description: string;     // 歌单详情内容
    coverUrl: string;        // 歌单封面（dataURL）
    songs: FavoriteSong[];
    createdAt: string;
    updatedAt: string;
};

const STORAGE_KEY = "ai_phone_music_favorites_v1";
export const MUSIC_FAVORITES_UPDATED_EVENT = "music-favorites-updated";

function dispatchUpdated(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(MUSIC_FAVORITES_UPDATED_EVENT));
}

export function generateFavoriteSongId(): string {
    return `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeSong(value: unknown): FavoriteSong | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<FavoriteSong>;
    if (typeof item.title !== "string" || !item.title.trim()) return null;
    const source: FavoriteSong["source"] = item.source === "netease" ? "netease" : "local";
    return {
        id: typeof item.id === "string" && item.id ? item.id : generateFavoriteSongId(),
        source,
        trackId: typeof item.trackId === "string" ? item.trackId : undefined,
        neteaseId: typeof item.neteaseId === "number" ? item.neteaseId : undefined,
        title: item.title,
        artist: typeof item.artist === "string" ? item.artist : "",
        album: typeof item.album === "string" ? item.album : undefined,
        coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : undefined,
        duration: typeof item.duration === "number" && isFinite(item.duration) ? item.duration : undefined,
        addedBy: item.addedBy === "character" ? "character" : "user",
        addedAt: typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString(),
    };
}

function normalizeFavorites(value: unknown, fallbackId: string): CharacterFavorites | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<CharacterFavorites>;
    const characterId = typeof item.characterId === "string" && item.characterId ? item.characterId : fallbackId;
    if (!characterId) return null;
    const now = new Date().toISOString();
    return {
        characterId,
        characterName: typeof item.characterName === "string" ? item.characterName : "角色",
        name: typeof item.name === "string" && item.name.trim() ? item.name : "喜欢的音乐",
        description: typeof item.description === "string" ? item.description : "",
        coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : "",
        songs: Array.isArray(item.songs) ? item.songs.map(normalizeSong).filter(Boolean) as FavoriteSong[] : [],
        createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
    };
}

function readAll(): Record<string, CharacterFavorites> {
    try {
        const raw = kvGet(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Record<string, CharacterFavorites> = {};
        for (const [key, value] of Object.entries(parsed)) {
            const normalized = normalizeFavorites(value, key);
            if (normalized) out[key] = normalized;
        }
        return out;
    } catch {
        return {};
    }
}

function writeAll(map: Record<string, CharacterFavorites>): void {
    try {
        kvSet(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* ignore quota errors */
    }
    dispatchUpdated();
}

function defaultFavorites(characterId: string, characterName: string): CharacterFavorites {
    const now = new Date().toISOString();
    return {
        characterId,
        characterName: characterName || "角色",
        name: "喜欢的音乐",
        description: "",
        coverUrl: "",
        songs: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function loadAllCharacterFavorites(): CharacterFavorites[] {
    return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 读取某角色的歌单；没有则返回一个未保存的默认歌单 */
export function getCharacterFavorites(characterId: string, characterName?: string): CharacterFavorites {
    const map = readAll();
    const found = map[characterId];
    if (found) return found;
    return defaultFavorites(characterId, characterName || "角色");
}

export function saveCharacterFavorites(next: CharacterFavorites): CharacterFavorites {
    const map = readAll();
    const updated: CharacterFavorites = { ...next, updatedAt: new Date().toISOString() };
    map[next.characterId] = updated;
    writeAll(map);
    return updated;
}

/** 修改歌单名字 / 详情 / 封面 */
export function updateCharacterFavorites(
    characterId: string,
    characterName: string,
    patch: Partial<Pick<CharacterFavorites, "name" | "description" | "coverUrl">>,
): CharacterFavorites {
    const current = getCharacterFavorites(characterId, characterName);
    const merged: CharacterFavorites = {
        ...current,
        characterName: characterName || current.characterName,
        ...patch,
    };
    return saveCharacterFavorites(merged);
}

function songKey(song: Pick<FavoriteSong, "source" | "trackId" | "neteaseId">): string {
    if (song.source === "netease" && song.neteaseId) return `netease_${song.neteaseId}`;
    if (song.trackId) return `local_${song.trackId}`;
    return "";
}

/** 往角色歌单加歌；重复则不重复添加 */
export function addFavoriteSong(
    characterId: string,
    characterName: string,
    song: Omit<FavoriteSong, "id" | "addedAt"> & { id?: string; addedAt?: string },
): { favorites: CharacterFavorites; added: boolean } {
    const current = getCharacterFavorites(characterId, characterName);
    const key = songKey(song);
    if (key && current.songs.some(item => songKey(item) === key)) {
        return { favorites: current, added: false };
    }
    const entry: FavoriteSong = {
        ...song,
        id: song.id || generateFavoriteSongId(),
        addedAt: song.addedAt || new Date().toISOString(),
    };
    const next: CharacterFavorites = {
        ...current,
        characterName: characterName || current.characterName,
        songs: [...current.songs, entry],
    };
    const saved = saveCharacterFavorites(next);
    return { favorites: saved, added: true };
}

export function removeFavoriteSong(characterId: string, characterName: string, songId: string): CharacterFavorites {
    const current = getCharacterFavorites(characterId, characterName);
    return saveCharacterFavorites({ ...current, songs: current.songs.filter(item => item.id !== songId) });
}

export function isFavoriteSong(characterId: string, characterName: string, song: Pick<FavoriteSong, "source" | "trackId" | "neteaseId">): boolean {
    const key = songKey(song);
    if (!key) return false;
    return getCharacterFavorites(characterId, characterName).songs.some(item => songKey(item) === key);
}
