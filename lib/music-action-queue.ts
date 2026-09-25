// lib/music-action-queue.ts — Queue user music operations, flush as system messages when chat is active

type MusicAction = {
    type: "playing" | "paused" | "skipped";
    trackTitle: string;
    trackArtist?: string;
    timestamp: number;
};

type MusicSystemNotice = {
    characterId: string;
    text: string;
    triggerReply: boolean;
};

type FlushCallback = (text: string, options?: { triggerReply?: boolean }) => void;

let _queue: MusicAction[] = [];
let _notices: MusicSystemNotice[] = [];
let _chatActive = false;
let _activeCharacterId: string | null = null;
let _flushCallback: FlushCallback | null = null;

const MAX_NOTICES = 60;

/** Set whether the chat is currently visible (messages will be injected) */
export function setChatActive(active: boolean, flush?: FlushCallback, characterId?: string | null) {
    _chatActive = active;
    _flushCallback = flush ?? null;
    _activeCharacterId = characterId ?? null;
    if (active) flushQueue();
}

/** Push a music operation to the queue */
export function pushMusicAction(action: Omit<MusicAction, "timestamp">) {
    const entry: MusicAction = { ...action, timestamp: Date.now() };

    // Dedupe: replace consecutive same-type actions
    if (_queue.length > 0 && _queue[_queue.length - 1].type === entry.type) {
        _queue[_queue.length - 1] = entry;
    } else {
        _queue.push(entry);
    }

    // If chat is active, flush immediately
    if (_chatActive && _flushCallback) {
        flushQueue();
    }
}

/**
 * Push a "歌单变更" notice that only the target character should perceive.
 * 当且仅当该角色的聊天处于打开状态时会立即送达，否则排队等它打开。
 */
export function pushMusicSystemNotice(characterId: string, text: string, options?: { triggerReply?: boolean }) {
    if (!characterId || !text) return;
    _notices.push({ characterId, text, triggerReply: Boolean(options?.triggerReply) });
    if (_notices.length > MAX_NOTICES) _notices = _notices.slice(-MAX_NOTICES);
    if (_chatActive && _flushCallback) flushQueue();
}

/** Flush queued actions / notices as system messages */
function flushQueue() {
    if (!_flushCallback) return;

    if (_queue.length > 0) {
        const actions = _queue;
        _queue = [];
        for (const action of actions) {
            const artist = action.trackArtist ? `-${action.trackArtist}` : "";
            let text = "";
            switch (action.type) {
                case "playing":
                    text = `[用户正在听:${action.trackTitle}${artist}]`;
                    break;
                case "paused":
                    text = `[用户暂停了音乐]`;
                    break;
                case "skipped":
                    text = `[用户切歌到:${action.trackTitle}${artist}]`;
                    break;
            }
            if (text) _flushCallback(text);
        }
    }

    if (_activeCharacterId && _notices.length > 0) {
        const remaining: MusicSystemNotice[] = [];
        for (const notice of _notices) {
            if (notice.characterId === _activeCharacterId) {
                _flushCallback(notice.text, { triggerReply: notice.triggerReply });
            } else {
                remaining.push(notice);
            }
        }
        _notices = remaining;
    }
}

/** Clear all pending actions */
export function clearMusicQueue() {
    _queue = [];
    _notices = [];
}
