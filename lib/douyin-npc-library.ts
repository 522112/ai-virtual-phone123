import { saveThemeAssetFromBlob, deleteThemeAsset, getThemeAssetMap } from "./theme-storage";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type { DouyinNpcPortrait } from "./douyin-types";

export const DOUYIN_NPC_PORTRAITS_KEY = "ai_phone_douyin_npc_portraits_v1";
export const DOUYIN_NPC_LIBRARY_UPDATED_EVENT = "douyin-npc-library-updated";

registerKvMigration(DOUYIN_NPC_PORTRAITS_KEY);

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function dispatchUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOUYIN_NPC_LIBRARY_UPDATED_EVENT));
}

function readPortraits(): DouyinNpcPortrait[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = kvGet(DOUYIN_NPC_PORTRAITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is DouyinNpcPortrait => Boolean(item && typeof item === "object" && typeof (item as DouyinNpcPortrait).id === "string"))
      .map(item => ({
        id: item.id,
        name: cleanText(item.name, 40) || "未命名立绘",
        assetId: cleanText(item.assetId, 120),
        tags: Array.isArray(item.tags) ? item.tags.map(tag => cleanText(tag, 24)).filter(Boolean) : [],
        createdAt: cleanText(item.createdAt, 40) || nowIso(),
      }))
      .filter(item => item.assetId);
  } catch {
    return [];
  }
}

function writePortraits(portraits: DouyinNpcPortrait[]): void {
  if (typeof window === "undefined") return;
  kvSet(DOUYIN_NPC_PORTRAITS_KEY, JSON.stringify(portraits));
  dispatchUpdated();
}

export function loadDouyinNpcPortraits(): DouyinNpcPortrait[] {
  return readPortraits();
}

export async function addDouyinNpcPortrait(name: string, blob: Blob, tags: string[] = []): Promise<DouyinNpcPortrait> {
  const assetId = await saveThemeAssetFromBlob(blob, "douyin_npc");
  const portrait: DouyinNpcPortrait = {
    id: makeId("dy_npc"),
    name: cleanText(name, 40) || "未命名立绘",
    assetId,
    tags: tags.map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 8),
    createdAt: nowIso(),
  };
  const next = [...readPortraits(), portrait];
  writePortraits(next);
  return portrait;
}

export async function deleteDouyinNpcPortrait(id: string): Promise<void> {
  const portraits = readPortraits();
  const idx = portraits.findIndex(item => item.id === id);
  if (idx === -1) return;
  const [removed] = portraits.splice(idx, 1);
  writePortraits(portraits);
  if (removed?.assetId) await deleteThemeAsset(removed.assetId);
}

export function renameDouyinNpcPortrait(id: string, name: string): DouyinNpcPortrait | null {
  const portraits = readPortraits();
  const idx = portraits.findIndex(item => item.id === id);
  if (idx === -1) return null;
  portraits[idx] = { ...portraits[idx], name: cleanText(name, 40) || portraits[idx].name };
  writePortraits(portraits);
  return portraits[idx];
}

export function pickRandomDouyinNpcPortraits(count: number): DouyinNpcPortrait[] {
  const all = readPortraits();
  if (all.length === 0 || count <= 0) return [];
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export async function resolveDouyinNpcPortraitUrls(
  portraits: DouyinNpcPortrait[],
): Promise<Record<string, string>> {
  if (portraits.length === 0) return {};
  const map = await getThemeAssetMap(portraits.map(item => item.assetId));
  const result: Record<string, string> = {};
  for (const portrait of portraits) {
    const url = map[portrait.assetId];
    if (url) result[portrait.id] = url;
  }
  return result;
}

export async function resolveDouyinSpriteUrl(assetId?: string | null): Promise<string | null> {
  if (!assetId) return null;
  const map = await getThemeAssetMap([assetId]);
  return map[assetId] || null;
}
