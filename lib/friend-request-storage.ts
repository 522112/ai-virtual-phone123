import { loadCharacters } from "./character-storage";
import { loadChatContacts } from "./chat-storage";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
// lib/friend-request-storage.ts
// Friend request storage — manages pending/accepted/rejected friend requests
// from AI characters after user deletes them.

export type FriendRequest = {
    id: string;
    characterId: string;
    message: string;         // AI friend request message
    status: "pending" | "accepted" | "rejected" | "abandoned";
    round: number;           // attempt number (1, 2, 3)
    createdAt: string;       // ISO date
    // 角色小号申请：kind=character_sub，用马甲名/头像展示，接受=小号转正建档
    kind?: "character" | "character_sub";
    subId?: string;
    subName?: string;
    subAvatar?: string | null;
    ownerCharacterId?: string;
};

const STORAGE_KEY = "ai_phone_friend_requests_v1";
registerKvMigration(STORAGE_KEY);

export function loadFriendRequests(): FriendRequest[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = kvGet(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveFriendRequests(requests: FriendRequest[]): void {
    if (typeof window === "undefined") return;
    kvSet(STORAGE_KEY, JSON.stringify(requests));
}

export function addFriendRequest(characterId: string, message: string, round: number): FriendRequest {
    const all = loadFriendRequests();
    const req: FriendRequest = {
        id: `freq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        characterId,
        message,
        status: "pending",
        round,
        createdAt: new Date().toISOString(),
    };
    all.push(req);
    saveFriendRequests(all);
    return req;
}

/** 角色小号向用户/用户小号发起好友申请：主人格+马甲记录，接受=小号转正。 */
export function addSubFriendRequest(input: { ownerCharacterId: string; subId: string; subName: string; subAvatar?: string | null; message: string }): FriendRequest {
    const all = loadFriendRequests();
    const req: FriendRequest = {
        id: `freq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        characterId: input.ownerCharacterId,
        message: input.message,
        status: "pending",
        round: 1,
        createdAt: new Date().toISOString(),
        kind: "character_sub",
        subId: input.subId,
        subName: input.subName,
        subAvatar: input.subAvatar || null,
        ownerCharacterId: input.ownerCharacterId,
    };
    all.push(req);
    saveFriendRequests(all);
    return req;
}

export function updateFriendRequestStatus(
    requestId: string,
    status: FriendRequest["status"],
): void {
    const all = loadFriendRequests();
    const idx = all.findIndex(r => r.id === requestId);
    if (idx !== -1) {
        all[idx].status = status;
        saveFriendRequests(all);
    }
}

/** Get all pending requests (for UI display). */
export function getPendingFriendRequests(): FriendRequest[] {
    const all = loadFriendRequests();
    if (all.length === 0) return [];

    const characterIds = new Set(loadCharacters().map(c => c.id));
    const contactCharacterIds = new Set(loadChatContacts().map(c => c.characterId));
    let changed = false;

    const activeRequests = all.filter(r => {
        // 小号申请不过滤：主人格可能是好友，但马甲不是
        if (r.kind === "character_sub") return true;
        const stale = !characterIds.has(r.characterId) || contactCharacterIds.has(r.characterId);
        if (stale) {
            changed = true;
            return false;
        }
        return true;
    });

    if (changed) saveFriendRequests(activeRequests);
    return activeRequests.filter(r => r.status === "pending");
}

/** Get the latest request for a character (any status). */
export function getLatestRequestForCharacter(characterId: string): FriendRequest | null {
    const all = loadFriendRequests().filter(r => r.characterId === characterId);
    if (all.length === 0) return null;
    return all[all.length - 1];
}

/** Clean up all requests for a character (e.g., after accepting). */
export function clearRequestsForCharacter(characterId: string): void {
    const all = loadFriendRequests();
    saveFriendRequests(all.filter(r => r.characterId !== characterId));
}

/** 按 id 清理单条申请（小号转正/拒绝后用）。 */
export function clearRequestById(requestId: string): void {
    const all = loadFriendRequests();
    saveFriendRequests(all.filter(r => r.id !== requestId));
}

/** Dispatch event for UI refresh. */
export function dispatchFriendRequestUpdated(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("friend-requests-updated"));
    }
}
