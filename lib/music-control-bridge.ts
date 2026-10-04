import type { MusicTrack } from "./music-storage";
import type { PlayMode } from "./music-context";

export type MusicControlSnapshot = {
    currentTrack: MusicTrack | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playMode: PlayMode;
    queue: MusicTrack[];
    volume: number;
};

export type MusicControlBridge = {
    getState: () => MusicControlSnapshot;
    playTrack: (track: MusicTrack) => Promise<{ ok: boolean; message: string; track?: MusicTrack }>;
    playByQuery: (query: string, artist?: string) => Promise<{ ok: boolean; message: string; track?: MusicTrack }>;
    /** 只解析元数据不播放：用于一起听批量加歌，一次调用解析多首 */
    resolveByQuery: (query: string, artist?: string) => Promise<MusicTrack | null>;
    addToQueue: (tracks: MusicTrack[], options?: { replace?: boolean; playFirst?: boolean }) => Promise<{ ok: boolean; message: string; queue: MusicTrack[] } >;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    next: () => void;
    prev: () => void;
    setPlayMode: (mode: PlayMode) => void;
};

let bridge: MusicControlBridge | null = null;

export function registerMusicControlBridge(nextBridge: MusicControlBridge | null): void {
    bridge = nextBridge;
}

export function getMusicControlBridge(): MusicControlBridge | null {
    return bridge;
}
