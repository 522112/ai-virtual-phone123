import { kvGet } from "./kv-db";
import { loadBindingConfig, resolveUserIdentity } from "./settings-storage";

/**
 * 当前激活面具：消息列表/主页长按切换后写入 active_mask_id。
 * 面具=身份（UserIdentity），绑定=世界观系统（API/预设/世界书/正则）全跟身份走。
 */
export function getActiveMaskId(): string {
  try {
    const stored = kvGet("active_mask_id") || "";
    if (stored) return stored;
    return resolveUserIdentity()?.id || "";
  } catch {
    return "";
  }
}

/**
 * 该角色归属哪个面具：角色绑定 > 全局默认。
 * 没绑过的角色跟随全局默认面具（老数据零迁移）。
 */
export function getCharacterMaskId(characterId: string, appId = "chat"): string {
  try {
    const binding = loadBindingConfig();
    const global = binding.globalDefaults?.userIdentityId || "";
    const charBinding = binding.characterBindings.find(b => b.characterId === characterId);
    const slot = (appId && charBinding?.appOverrides[appId]) || charBinding?.defaults;
    return slot?.userIdentityId || global || getActiveMaskId();
  } catch {
    return getActiveMaskId();
  }
}

/** 该角色是否属于当前面具（聊天列表/朋友圈过滤用） */
export function isCharacterInActiveMask(characterId: string, appId = "chat"): boolean {
  const active = getActiveMaskId();
  if (!active) return true;
  return getCharacterMaskId(characterId, appId) === active;
}
