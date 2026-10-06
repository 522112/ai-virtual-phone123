import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export const RESOURCE_LIBRARY_SHARED_SCOPE = "shared";

export type ResourceKind = "image" | "video" | "audio";

export type ResourceItem = {
  id: string;
  /** 角色 id，或 "shared"（共享分区） */
  scope: string;
  kind: ResourceKind;
  /** dataURL（图片上传时已压缩） */
  dataUrl: string;
  /** 用户备注：内容说明 / 用途 */
  note: string;
  /** 分类：头像 / 情侣头像 / 聊天图片 / 视频 / 语音 / 歌单封面 / NPC头像 / 其他 */
  category: string;
  createdAt: string;
};

export const RESOURCE_CATEGORIES = [
  "头像",
  "情侣头像",
  "聊天图片",
  "视频",
  "语音",
  "歌单封面",
  "NPC头像",
  "其他",
] as const;

const RESOURCE_KEY = "ai_phone_resource_library_v1";

registerKvMigration(RESOURCE_KEY);

function readAll(): ResourceItem[] {
  try {
    const raw = kvGet(RESOURCE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as unknown[];
    return items.filter(isResourceItem);
  } catch {
    return [];
  }
}

function isResourceItem(value: unknown): value is ResourceItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ResourceItem>;
  return (
    typeof item.id === "string" &&
    typeof item.scope === "string" &&
    (item.kind === "image" || item.kind === "video" || item.kind === "audio") &&
    typeof item.dataUrl === "string" &&
    typeof item.createdAt === "string"
  );
}

function writeAll(items: ResourceItem[]): void {
  kvSet(RESOURCE_KEY, JSON.stringify(items));
}

function generateId(): string {
  return `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listResources(scope: string): ResourceItem[] {
  return readAll()
    .filter(item => item.scope === scope)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listResourceScopes(): string[] {
  const scopes = new Set<string>();
  for (const item of readAll()) scopes.add(item.scope);
  return [...scopes];
}

export function getResource(id: string): ResourceItem | null {
  return readAll().find(item => item.id === id) || null;
}

export function addResource(input: {
  scope: string;
  kind: ResourceKind;
  dataUrl: string;
  note?: string;
  category?: string;
}): ResourceItem {
  const item: ResourceItem = {
    id: generateId(),
    scope: input.scope,
    kind: input.kind,
    dataUrl: input.dataUrl,
    note: input.note?.trim() || "",
    category: input.category?.trim() || "其他",
    createdAt: new Date().toISOString(),
  };
  writeAll([item, ...readAll()]);
  return item;
}

export function updateResource(
  id: string,
  patch: Partial<Pick<ResourceItem, "note" | "category">>,
): ResourceItem | null {
  const items = readAll();
  const idx = items.findIndex(item => item.id === id);
  if (idx === -1) return null;
  const updated: ResourceItem = {
    ...items[idx],
    note: typeof patch.note === "string" ? patch.note.trim() : items[idx].note,
    category: typeof patch.category === "string" && patch.category.trim()
      ? patch.category.trim()
      : items[idx].category,
  };
  items[idx] = updated;
  writeAll(items);
  return updated;
}

export function deleteResource(id: string): void {
  const items = readAll();
  const next = items.filter(item => item.id !== id);
  if (next.length !== items.length) writeAll(next);
}

/** 按分类取资源（NPC头像 / 小号头像等场景用） */
export function listResourcesByCategory(scope: string, category: string): ResourceItem[] {
  return listResources(scope).filter(item => item.category === category);
}

/**
 * 给 AI 读的资源摘要：备注 + 分类，供聊天/漫卷等场景精准使用。
 * 只给元信息（id/种类/分类/备注），不塞 dataURL 进 prompt。
 */
export function describeResourcesForPrompt(scope: string): string {
  const mine = listResources(scope);
  const shared = scope === RESOURCE_LIBRARY_SHARED_SCOPE ? [] : listResources(RESOURCE_LIBRARY_SHARED_SCOPE);
  const all = [...mine, ...shared];
  if (all.length === 0) return "";
  const lines = all.slice(0, 40).map(item => {
    const where = item.scope === RESOURCE_LIBRARY_SHARED_SCOPE ? "共享" : "该角色";
    return `- [${item.id}] ${item.kind}｜分类：${item.category}｜${where}｜备注：${item.note || "（无备注）"}`;
  });
  return `资源库（可用素材，按备注和分类精准使用；需要发送时用资源发送工具并给出资源id）：\n${lines.join("\n")}`;
}

/** 取头像类资源 dataURL（NPC生成 / 小号头像自动套用） */
export function pickAvatarResource(scope: string, category = "NPC头像"): string | null {
  const hit = listResourcesByCategory(scope, category)[0]
    || listResourcesByCategory(RESOURCE_LIBRARY_SHARED_SCOPE, category)[0]
    || listResourcesByCategory(scope, "头像")[0]
    || listResourcesByCategory(RESOURCE_LIBRARY_SHARED_SCOPE, "头像")[0];
  return hit?.dataUrl || null;
}
