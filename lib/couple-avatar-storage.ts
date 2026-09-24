import type { UserIdentity } from "@/components/settings/user-identity";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadCharacters, saveCharacters } from "./character-storage";
import {
    resolveUserIdentity,
    loadUserIdentities,
    saveUserIdentities,
} from "./settings-storage";
import { createOrGetSession, pushChatMessage, type ChatMessage } from "./chat-storage";
import { getChatImageFromIndexedDB } from "./chat-asset-storage";
import { isMediaStoreRef, loadMediaBlob } from "./media-cache-storage";

const PENDING_REPLY_PREFIX = "pending_friend_reply_";

const STORAGE_KEY = "ai_phone_couple_avatars_v1";
const WEAR_STORAGE_KEY = "ai_phone_couple_avatar_wear_v1";
export const COUPLE_AVATARS_UPDATED_EVENT = "couple-avatars-updated";

registerKvMigration(STORAGE_KEY);
registerKvMigration(WEAR_STORAGE_KEY);

export type CoupleAvatarPair = {
    id: string;
    characterId: string;
    userAvatar: string;
    characterAvatar: string;
    label?: string;
    createdAt: string;
};

/** 按角色佩戴的情头；不写共用 UserIdentity / 不必改 Character.avatar。 */
export type CoupleAvatarWear = {
    characterId: string;
    userAvatar?: string;
    characterAvatar?: string;
    originalCharacterAvatar?: string | null;
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

function isValidWear(value: unknown): value is CoupleAvatarWear {
    if (!value || typeof value !== "object") return false;
    const wear = value as CoupleAvatarWear;
    return typeof wear.characterId === "string" && wear.characterId.trim().length > 0;
}

function loadAllWear(): CoupleAvatarWear[] {
    if (!isBrowser()) return [];
    try {
        const raw = kvGet(WEAR_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter(isValidWear) : [];
    } catch {
        return [];
    }
}

function saveAllWear(items: CoupleAvatarWear[]): void {
    if (!isBrowser()) return;
    kvSet(WEAR_STORAGE_KEY, JSON.stringify(items));
}

export function loadCoupleAvatarWear(characterId: string): CoupleAvatarWear | null {
    if (!characterId) return null;
    return loadAllWear().find(item => item.characterId === characterId) || null;
}

export function setCoupleAvatarWear(
    characterId: string,
    patch: Partial<Omit<CoupleAvatarWear, "characterId">>,
): CoupleAvatarWear | null {
    if (!characterId) return null;
    const all = loadAllWear();
    const index = all.findIndex(item => item.characterId === characterId);
    const current = index >= 0 ? all[index] : { characterId };
    const next: CoupleAvatarWear = { ...current, ...patch, characterId };
    const hasAny = Boolean(next.userAvatar?.trim() || next.characterAvatar?.trim());
    if (index >= 0) {
        if (hasAny) all[index] = next;
        else all.splice(index, 1);
    } else if (hasAny) {
        all.unshift(next);
    }
    saveAllWear(all);
    dispatchUpdated(characterId);
    return next;
}

export function wearUserCoupleAvatar(characterId: string, avatar: string): void {
    const trimmed = avatar.trim();
    if (!characterId || !trimmed) return;
    setCoupleAvatarWear(characterId, { userAvatar: trimmed });
}

export function wearCharacterCoupleAvatar(characterId: string, avatar: string): void {
    const trimmed = avatar.trim();
    if (!characterId || !trimmed) return;
    const current = loadCoupleAvatarWear(characterId);
    const character = loadCharacters().find(item => item.id === characterId);
    const original = current && "originalCharacterAvatar" in current
        ? current.originalCharacterAvatar
        : (character?.avatar ?? null);
    setCoupleAvatarWear(characterId, {
        characterAvatar: trimmed,
        originalCharacterAvatar: original ?? null,
    });
}

export function resolveCharacterDisplayAvatar(
    character: { id: string; avatar?: string | null } | null | undefined,
): string | null {
    if (!character) return null;
    const worn = loadCoupleAvatarWear(character.id)?.characterAvatar?.trim();
    if (worn) return worn;
    return character.avatar || null;
}

export function resolveUserDisplayAvatar(
    characterId?: string | null,
    appId = "chat",
): string | null {
    if (characterId) {
        const worn = loadCoupleAvatarWear(characterId)?.userAvatar?.trim();
        if (worn) return worn;
    }
    return resolveUserIdentity(characterId || undefined, appId)?.avatarUrl || null;
}

export function overlayCharacterForDisplay<T extends { id: string; avatar?: string | null }>(character: T): T {
    const avatar = resolveCharacterDisplayAvatar(character);
    if (avatar === (character.avatar || null)) return character;
    return { ...character, avatar };
}

export function overlayUserIdentityForDisplay(
    characterId: string | undefined,
    identity: UserIdentity | null,
    appId = "chat",
): UserIdentity | null {
    if (!identity) return identity;
    if (!characterId) return identity;
    const avatarUrl = resolveUserDisplayAvatar(characterId, appId);
    if ((avatarUrl || null) === (identity.avatarUrl || null)) return identity;
    return { ...identity, avatarUrl: avatarUrl || identity.avatarUrl };
}

export function loadCharacterForDisplay(characterId: string): ReturnType<typeof loadCharacters>[number] | null {
    const character = loadCharacters().find(item => item.id === characterId) || null;
    return character ? overlayCharacterForDisplay(character) : null;
}

export function loadUserIdentityForDisplay(characterId?: string, appId = "chat"): UserIdentity | null {
    return overlayUserIdentityForDisplay(characterId, resolveUserIdentity(characterId, appId), appId);
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

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
        reader.readAsDataURL(blob);
    });
}

export async function resolveChatImageToDataUrl(ref: string | null | undefined): Promise<string | null> {
    const raw = (ref || "").trim();
    if (!raw) return null;
    if (raw.startsWith("data:")) return raw;
    if (isMediaStoreRef(raw)) {
        const media = await loadMediaBlob(raw).catch(() => null);
        if (!media?.blob) return null;
        return blobToDataUrl(media.blob);
    }
    const assetId = raw.startsWith("asset://") ? raw.slice("asset://".length) : raw;
    return getChatImageFromIndexedDB(assetId).catch(() => null);
}

export async function imageSourceToAvatarDataUrl(source: string): Promise<string> {
    if (typeof document === "undefined") return source;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片解码失败"));
        img.src = source;
    });
    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return source;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.82);
}

type ChatImageLike = {
    role?: string;
    mediaType?: string;
    mediaUrl?: string;
    content?: string;
    mediaData?: { fileType?: string; label?: string };
};

function isUserChatImage(msg: ChatImageLike): boolean {
    if (msg.role !== "user" || !msg.mediaUrl) return false;
    if (msg.mediaType === "image") return true;
    return msg.mediaType === "media_file" && msg.mediaData?.fileType === "image";
}

function chatImageLabel(msg: ChatImageLike): string {
    return (msg.mediaData?.label || msg.content || "").trim();
}

export function findLatestUserChatImage(messages: ChatImageLike[]): string | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (isUserChatImage(msg)) return msg.mediaUrl || null;
    }
    return null;
}

export function looksLikeCoupleAvatarLabel(label?: string | null): boolean {
    const text = (label || "").trim();
    return /情头|情侣头像|配对头像|配套头像/.test(text);
}

/** 用户自己那半张，不应被设成角色聊天头像。 */
export function looksLikeUserCoupleAvatarLabel(label?: string | null): boolean {
    const text = (label || "").trim();
    return /^(我的头像|我的情头)$/.test(text);
}

export function looksLikeCharacterCoupleAvatarLabel(label?: string | null): boolean {
    return looksLikeCoupleAvatarLabel(label) && !looksLikeUserCoupleAvatarLabel(label);
}

/** 换上情头时优先用对方那张；没有标记则退回最近一张用户照片。 */
export function findLatestWearableCoupleAvatarImage(messages: ChatImageLike[]): string | null {
    let latestImage: string | null = null;
    let latestNonUserHalf: string | null = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (!isUserChatImage(msg) || !msg.mediaUrl) continue;
        if (!latestImage) latestImage = msg.mediaUrl;
        const label = chatImageLabel(msg);
        if (looksLikeCharacterCoupleAvatarLabel(label)) return msg.mediaUrl;
        if (!latestNonUserHalf && !looksLikeUserCoupleAvatarLabel(label)) {
            latestNonUserHalf = msg.mediaUrl;
        }
    }
    return latestNonUserHalf || latestImage;
}

export function getCoupleAvatarPromptHint(messages?: ChatImageLike[]): { hasRecentUserImage: boolean; label?: string } {
    if (!messages?.length) return { hasRecentUserImage: false };
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (!isUserChatImage(msg)) continue;
        return { hasRecentUserImage: true, label: chatImageLabel(msg) || undefined };
    }
    return { hasRecentUserImage: false };
}

export async function applyCharacterAvatarFromChatImage(
    characterId: string,
    imageRef: string | null | undefined,
): Promise<boolean> {
    const resolved = await resolveChatImageToDataUrl(imageRef);
    if (!resolved) return false;
    const pair = findCouplePairByUserAvatar(characterId, resolved)
        || findCouplePairByCharacterAvatar(characterId, resolved);
    const avatar = pair
        ? pair.characterAvatar
        : await imageSourceToAvatarDataUrl(resolved).catch(() => resolved);
    const already = avatarsMatch(loadCoupleAvatarWear(characterId)?.characterAvatar, avatar);
    if (already) return true;
    wearCharacterCoupleAvatar(characterId, avatar);
    return true;
}

export async function applyUserAvatarFromChatImage(
    characterId: string,
    imageRef: string | null | undefined,
): Promise<boolean> {
    const resolved = await resolveChatImageToDataUrl(imageRef);
    if (!resolved) return false;
    const avatar = await imageSourceToAvatarDataUrl(resolved).catch(() => resolved);
    wearUserCoupleAvatar(characterId, avatar);
    return true;
}

export function buildCoupleAvatarInstruction(
    isGroup?: boolean,
    hint?: { hasRecentUserImage?: boolean; label?: string | null } | null,
): string {
    if (isGroup) return "";
    const lines = [
        "【情头】",
        "对方可能在聊天里发来情头或配套头像，也可能只是普通照片。没有单独的情头按钮，请直接看图判断。",
        "按人设决定要不要换上头像。想戴就输出 [换上情头]，系统收到标记后才会更换你这边的头像。只口头说换了、却不输出标记，头像不会变。",
        "不想戴就输出 [拒绝换头像]，并写一句符合人设的理由（可自拟当下的原因）。",
        "如果照片标记是「我的头像」或「我的情头」，那是对方自己戴的，不要输出 [换上情头] 或 [拒绝换头像]。",
    ];
    if (hint?.hasRecentUserImage) {
        const label = (hint.label || "").trim();
        if (looksLikeCharacterCoupleAvatarLabel(label)) {
            lines.push("对方刚刚发来的照片是想给你换的情头。按人设决定：想戴输出 [换上情头]，不想戴输出 [拒绝换头像] 并说明理由。");
        } else if (looksLikeUserCoupleAvatarLabel(label)) {
            lines.push("对方刚刚发来的是自己那张头像，不要换你的聊天头像。");
        } else {
            lines.push("对方刚刚发来一张照片。请看图判断是不是给你换的情头。是的话按人设决定戴或拒绝，并输出对应标记。");
        }
    }
    return lines.join("\n");
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

export function findCouplePairByCharacterAvatar(characterId: string, characterAvatar: string | null | undefined): CoupleAvatarPair | null {
    if (!characterAvatar) return null;
    return loadCoupleAvatarPairs(characterId).find(pair => avatarsMatch(pair.characterAvatar, characterAvatar)) || null;
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

/** 在联系人页更换「我」的头像：只戴这个角色下的用户情头，不改共用身份。 */
export function setContactUserAvatar(characterId: string, avatarUrl: string): CoupleAvatarPair | null {
    wearUserCoupleAvatar(characterId, avatarUrl);
    return findCouplePairByUserAvatar(characterId, avatarUrl);
}

export function setContactCharacterAvatar(characterId: string, avatarUrl: string): void {
    wearCharacterCoupleAvatar(characterId, avatarUrl);
}

function requestCharacterWearInChat(input: {
    characterId: string;
    pair: CoupleAvatarPair;
}): { sessionId: string; message: ChatMessage } {
    const session = createOrGetSession(input.characterId);
    const message = pushChatMessage({
        sessionId: session.id,
        role: "user",
        content: "",
        mediaType: "image",
        mediaUrl: input.pair.characterAvatar,
        mediaData: { label: input.pair.label || "情头" },
    });
    if (isBrowser()) {
        kvSet(PENDING_REPLY_PREFIX + session.id, "1");
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    }
    return { sessionId: session.id, message };
}

/** 只戴用户那一半；角色那一半发进聊天，由人设决定接不接。 */
export function applyCoupleAvatarPair(characterId: string, pairId: string): {
    pair: CoupleAvatarPair;
    sessionId: string;
    message: ChatMessage;
} | null {
    const pair = loadCoupleAvatarPairs(characterId).find(item => item.id === pairId) || null;
    if (!pair) return null;
    wearUserCoupleAvatar(characterId, pair.userAvatar);
    const sent = requestCharacterWearInChat({ characterId, pair });
    return { pair, ...sent };
}

export function sendCoupleAvatarToChat(input: {
    characterId: string;
    pairId: string;
    characterName?: string;
}): { sessionId: string; message: ChatMessage; notice: ChatMessage | null } | null {
    const pair = loadCoupleAvatarPairs(input.characterId).find(item => item.id === input.pairId);
    if (!pair) return null;
    const sent = requestCharacterWearInChat({ characterId: input.characterId, pair });
    return { ...sent, notice: null };
}
