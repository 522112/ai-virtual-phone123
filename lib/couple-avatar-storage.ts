import type { UserIdentity } from "@/components/settings/user-identity";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadCharacters, saveCharacters } from "./character-storage";
import {
    resolveUserIdentity,
    loadUserIdentities,
    saveUserIdentities,
} from "./settings-storage";
import { createOrGetSession, pushChatMessage, type ChatMessage } from "./chat-storage";

const PENDING_REPLY_PREFIX = "pending_friend_reply_";

const STORAGE_KEY = "ai_phone_couple_avatars_v1";
export const COUPLE_AVATARS_UPDATED_EVENT = "couple-avatars-updated";

registerKvMigration(STORAGE_KEY);

export type CoupleAvatarPair = {
    id: string;
    characterId: string;
    userAvatar: string;
    characterAvatar: string;
    label?: string;
    createdAt: string;
};

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function dispatchUpdated(characterId?: string): void {
    if (!isBrowser()) return;
    window.dispatchEvent(new CustomEvent(COUPLE_AVATARS_UPDATED_EVENT, { detail: { characterId } }));
}

function isValidPair(value: unknown): value is CoupleAvatarPair {
    if (!value || typeof value !== "object") return false;
    const pair = value as CoupleAvatarPair;
    return typeof pair.id === "string"
        && typeof pair.characterId === "string"
        && typeof pair.userAvatar === "string"
        && typeof pair.characterAvatar === "string"
        && pair.userAvatar.trim().length > 0
        && pair.characterAvatar.trim().length > 0;
}

function simpleHash(text: string): string {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

/** Stable fingerprint so the same stored data-URL still matches after a reload. */
export function avatarFingerprint(url: string | null | undefined): string {
    const trimmed = (url || "").trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("data:")) {
        const comma = trimmed.indexOf(",");
        const payload = comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
        return `data:${payload.length}:${simpleHash(payload)}`;
    }
    return trimmed;
}

export function avatarsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
    if (!left || !right) return false;
    if (left === right) return true;
    const leftPrint = avatarFingerprint(left);
    const rightPrint = avatarFingerprint(right);
    return Boolean(leftPrint) && leftPrint === rightPrint;
}

export function loadCoupleAvatarPairs(characterId?: string): CoupleAvatarPair[] {
    if (!isBrowser()) return [];
    try {
        const raw = kvGet(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        const pairs = parsed.filter(isValidPair);
        return characterId ? pairs.filter(pair => pair.characterId === characterId) : pairs;
    } catch {
        return [];
    }
}

function saveCoupleAvatarPairs(pairs: CoupleAvatarPair[]): void {
    if (!isBrowser()) return;
    kvSet(STORAGE_KEY, JSON.stringify(pairs));
}

export function addCoupleAvatarPair(input: {
    characterId: string;
    userAvatar: string;
    characterAvatar: string;
    label?: string;
}): CoupleAvatarPair | null {
    const userAvatar = input.userAvatar.trim();
    const characterAvatar = input.characterAvatar.trim();
    if (!input.characterId || !userAvatar || !characterAvatar) return null;

    const pair: CoupleAvatarPair = {
        id: generateId("qingtou"),
        characterId: input.characterId,
        userAvatar,
        characterAvatar,
        label: input.label?.trim() || undefined,
        createdAt: new Date().toISOString(),
    };
    saveCoupleAvatarPairs([pair, ...loadCoupleAvatarPairs()]);
    dispatchUpdated(input.characterId);
    return pair;
}

export function removeCoupleAvatarPair(pairId: string): void {
    const pairs = loadCoupleAvatarPairs();
    const target = pairs.find(pair => pair.id === pairId);
    if (!target) return;
    saveCoupleAvatarPairs(pairs.filter(pair => pair.id !== pairId));
    dispatchUpdated(target.characterId);
}

export function findCouplePairByUserAvatar(characterId: string, userAvatar: string | null | undefined): CoupleAvatarPair | null {
    if (!userAvatar) return null;
    return loadCoupleAvatarPairs(characterId).find(pair => avatarsMatch(pair.userAvatar, userAvatar)) || null;
}

export function updateCharacterAvatar(characterId: string, avatar: string | null): boolean {
    const chars = loadCharacters();
    const index = chars.findIndex(item => item.id === characterId);
    if (index < 0) return false;
    if (chars[index].avatar === avatar) return false;
    chars[index] = {
        ...chars[index],
        avatar,
        updatedAt: new Date().toISOString(),
    };
    saveCharacters(chars);
    return true;
}

export function updateResolvedUserAvatar(characterId: string | undefined, avatarUrl: string, appId = "chat"): UserIdentity | null {
    const current = resolveUserIdentity(characterId, appId);
    const identities = loadUserIdentities();
    if (current) {
        const next = identities.map(item => item.id === current.id ? { ...item, avatarUrl } : item);
        saveUserIdentities(next);
        return { ...current, avatarUrl };
    }
    const created: UserIdentity = {
        id: `identity-${Date.now()}`,
        name: "我",
        bio: "",
        gender: "保密",
        age: "",
        occupation: "",
        customSettings: "",
        avatarUrl,
    };
    saveUserIdentities([created, ...identities]);
    return created;
}

/** 在联系人页更换用户头像；若这张是已存情头，角色立刻换上配套的那张。 */
export function setContactUserAvatar(characterId: string, avatarUrl: string): CoupleAvatarPair | null {
    updateResolvedUserAvatar(characterId, avatarUrl, "chat");
    const pair = findCouplePairByUserAvatar(characterId, avatarUrl);
    if (pair) updateCharacterAvatar(characterId, pair.characterAvatar);
    return pair;
}

export function setContactCharacterAvatar(characterId: string, avatarUrl: string): void {
    updateCharacterAvatar(characterId, avatarUrl);
}

export function applyCoupleAvatarPair(characterId: string, pairId: string): CoupleAvatarPair | null {
    const pair = loadCoupleAvatarPairs(characterId).find(item => item.id === pairId) || null;
    if (!pair) return null;
    updateResolvedUserAvatar(characterId, pair.userAvatar, "chat");
    updateCharacterAvatar(characterId, pair.characterAvatar);
    return pair;
}

export function applyCoupleAvatarIfUserSentPair(input: {
    sessionId: string;
    characterId: string;
    userImage: string | null | undefined;
    characterName?: string;
}): ChatMessage | null {
    if (!input.userImage) return null;
    const pair = findCouplePairByUserAvatar(input.characterId, input.userImage);
    if (!pair) return null;

    const character = loadCharacters().find(item => item.id === input.characterId);
    const alreadyWearing = avatarsMatch(character?.avatar, pair.characterAvatar);
    if (!alreadyWearing) {
        updateCharacterAvatar(input.characterId, pair.characterAvatar);
    }

    const name = input.characterName || character?.name || "对方";
    return pushChatMessage({
        sessionId: input.sessionId,
        role: "system",
        content: alreadyWearing
            ? `${name}看着你发来的情头，自己也已经戴着配套的那张`
            : `${name}察觉到你发的是情头，主动换上了配套的头像`,
    });
}

export function sendCoupleAvatarToChat(input: {
    characterId: string;
    pairId: string;
    characterName?: string;
}): { sessionId: string; message: ChatMessage; notice: ChatMessage | null } | null {
    const pair = loadCoupleAvatarPairs(input.characterId).find(item => item.id === input.pairId);
    if (!pair) return null;
    const session = createOrGetSession(input.characterId);
    const message = pushChatMessage({
        sessionId: session.id,
        role: "user",
        content: "",
        mediaType: "image",
        mediaUrl: pair.userAvatar,
        mediaData: { label: pair.label || "情头" },
    });
    const notice = applyCoupleAvatarIfUserSentPair({
        sessionId: session.id,
        characterId: input.characterId,
        userImage: pair.userAvatar,
        characterName: input.characterName,
    });
    if (isBrowser()) {
        kvSet(PENDING_REPLY_PREFIX + session.id, "1");
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    }
    return { sessionId: session.id, message, notice };
}
