import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { resolveUserIdentity } from "./settings-storage";
import { loadChatSessions } from "./chat-storage";

export const SUB_ACCOUNTS_UPDATED_EVENT = "sub-accounts-updated";

/** 用户小号：挂在某个面具（身份）下，角色眼里是陌生人 */
export type UserSubAccount = {
  id: string;
  /** 面具 id（UserIdentity.id；空=默认身份） */
  maskId: string;
  /** 网名（角色看到的名字） */
  name: string;
  avatar?: string | null;
  /** 人设（角色看到的你是谁） */
  persona: string;
  /** 微信号（用于加角色好友） */
  wechatId: string;
  createdAt: string;
  updatedAt: string;
};

/** 角色小号：由角色人设决定，头像优先用资源库 */
export type CharacterSubAccount = {
  id: string;
  characterId: string;
  name: string;
  avatar?: string | null;
  /** 网络上的人设 */
  persona: string;
  createdAt: string;
  updatedAt: string;
};

const USER_SUBS_KEY = "ai_phone_user_sub_accounts_v1";
const CHARACTER_SUBS_KEY = "ai_phone_character_sub_accounts_v1";
registerKvMigration(USER_SUBS_KEY);
registerKvMigration(CHARACTER_SUBS_KEY);

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function dispatchUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUB_ACCOUNTS_UPDATED_EVENT));
}

function readUserSubs(): UserSubAccount[] {
  try {
    const raw = kvGet(USER_SUBS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    return list.filter((v): v is UserSubAccount => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string");
  } catch {
    return [];
  }
}

function readCharacterSubs(): CharacterSubAccount[] {
  try {
    const raw = kvGet(CHARACTER_SUBS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    return list.filter((v): v is CharacterSubAccount => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string");
  } catch {
    return [];
  }
}

export function loadUserSubAccounts(maskId?: string): UserSubAccount[] {
  const all = readUserSubs();
  return maskId === undefined ? all : all.filter(s => (s.maskId || "") === (maskId || ""));
}

export function getUserSubAccount(id: string): UserSubAccount | null {
  return readUserSubs().find(s => s.id === id) || null;
}

export function createUserSubAccount(input: { maskId?: string; name: string; avatar?: string | null; persona?: string; wechatId?: string }): UserSubAccount {
  const now = new Date().toISOString();
  const sub: UserSubAccount = {
    id: generateId("usub"),
    maskId: input.maskId || "",
    name: input.name.trim().slice(0, 30) || "小号",
    avatar: input.avatar || null,
    persona: (input.persona || "").slice(0, 2000),
    wechatId: input.wechatId?.trim().slice(0, 40) || `x${Math.random().toString().slice(2, 12)}`,
    createdAt: now,
    updatedAt: now,
  };
  kvSet(USER_SUBS_KEY, JSON.stringify([sub, ...readUserSubs()]));
  dispatchUpdated();
  return sub;
}

export function updateUserSubAccount(id: string, patch: Partial<Pick<UserSubAccount, "name" | "avatar" | "persona" | "wechatId">>): UserSubAccount | null {
  const all = readUserSubs();
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return null;
  all[idx] = {
    ...all[idx],
    name: patch.name !== undefined ? patch.name.trim().slice(0, 30) || all[idx].name : all[idx].name,
    avatar: patch.avatar !== undefined ? patch.avatar : all[idx].avatar,
    persona: patch.persona !== undefined ? patch.persona.slice(0, 2000) : all[idx].persona,
    wechatId: patch.wechatId !== undefined ? patch.wechatId.trim().slice(0, 40) : all[idx].wechatId,
    updatedAt: new Date().toISOString(),
  };
  kvSet(USER_SUBS_KEY, JSON.stringify(all));
  dispatchUpdated();
  return all[idx];
}

export function deleteUserSubAccount(id: string): void {
  kvSet(USER_SUBS_KEY, JSON.stringify(readUserSubs().filter(s => s.id !== id)));
  dispatchUpdated();
}

/**
 * 消息气泡里的用户头像：小号会话显示小号头像，否则回退默认。
 */
export function resolveMessageUserAvatarUrl(sessionId: string | undefined, fallback: string | null): string | null {
  if (!sessionId) return fallback;
  try {
    const session = loadChatSessions().find(s => s.id === sessionId);
    if (!session?.subId) return fallback;
    const sub = getUserSubAccount(session.subId);
    return sub?.avatar || fallback;
  } catch {
    return fallback;
  }
}

/** 会话级用户身份：小号会话返回小号伪装身份（网名/头像/人设全覆盖）。 */
export function resolveSessionUserIdentity(
  session: { subId?: string } | null | undefined,
  characterId?: string,
  appId?: string,
) {
  const base = resolveUserIdentity(characterId, appId);
  if (!session?.subId) return base;
  try {
    const sub = getUserSubAccount(session.subId);
    if (!sub || !base) return base;
    // 空人设：对方在聊天中认识你。绝不能回退大号设定（那会让 AI 全知）。
    const neutralPersona = sub.persona.trim()
      ? sub.persona
      : "一个普通的网友。关于 TA 的一切只能从聊天内容里了解，不要臆测，不要假装早就认识。";
    return {
      ...base,
      name: sub.name,
      screenName: sub.name,
      avatarUrl: sub.avatar || undefined,
      customSettings: neutralPersona,
      bio: neutralPersona,
    };
  } catch {
    return base;
  }
}

export function loadCharacterSubAccounts(characterId: string): CharacterSubAccount[] {
  return readCharacterSubs().filter(s => s.characterId === characterId);
}

export function createCharacterSubAccount(input: { characterId: string; name: string; avatar?: string | null; persona?: string }): CharacterSubAccount {
  const now = new Date().toISOString();
  const sub: CharacterSubAccount = {
    id: generateId("csub"),
    characterId: input.characterId,
    name: input.name.trim().slice(0, 30) || "小号",
    avatar: input.avatar || null,
    persona: (input.persona || "").slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  };
  kvSet(CHARACTER_SUBS_KEY, JSON.stringify([sub, ...readCharacterSubs()]));
  dispatchUpdated();
  return sub;
}

export function deleteCharacterSubAccount(id: string): void {
  kvSet(CHARACTER_SUBS_KEY, JSON.stringify(readCharacterSubs().filter(s => s.id !== id)));
  dispatchUpdated();
}

export function updateCharacterSubAccount(id: string, patch: { name?: string; avatar?: string | null; persona?: string }): CharacterSubAccount | null {
  const all = readCharacterSubs();
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 30) || all[idx].name } : {}),
    ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
    ...(patch.persona !== undefined ? { persona: patch.persona.slice(0, 2000) } : {}),
    updatedAt: now,
  };
  kvSet(CHARACTER_SUBS_KEY, JSON.stringify(all));
  dispatchUpdated();
  return all[idx];
}
