import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type { ChatSession } from "./chat-storage";

const SETTINGS_KEY = "ai_phone_offline_output_settings_v1";
export const OFFLINE_OUTPUT_SETTINGS_UPDATED_EVENT = "offline-output-settings-updated";

registerKvMigration(SETTINGS_KEY);

export type OfflineOutputSettings = {
  offlineOutputMinChars?: number;
  offlineOutputMaxChars?: number;
  offlineWritingStyleId?: string;
  offlineWritingStyleCustom?: string;
};

function readAll(): Record<string, OfflineOutputSettings> {
  const raw = kvGet(SETTINGS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, OfflineOutputSettings>;
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, OfflineOutputSettings>): void {
  kvSet(SETTINGS_KEY, JSON.stringify(value));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_OUTPUT_SETTINGS_UPDATED_EVENT));
  }
}

function normalizeStored(value: unknown): OfflineOutputSettings {
  if (!value || typeof value !== "object") return {};
  const item = value as Partial<OfflineOutputSettings>;
  const next: OfflineOutputSettings = {};
  if (typeof item.offlineOutputMinChars === "number" && item.offlineOutputMinChars >= 1) {
    next.offlineOutputMinChars = Math.floor(item.offlineOutputMinChars);
  }
  if (typeof item.offlineOutputMaxChars === "number" && item.offlineOutputMaxChars >= 1) {
    next.offlineOutputMaxChars = Math.floor(item.offlineOutputMaxChars);
  }
  if (typeof item.offlineWritingStyleId === "string" && item.offlineWritingStyleId.trim()) {
    next.offlineWritingStyleId = item.offlineWritingStyleId.trim();
  }
  if (typeof item.offlineWritingStyleCustom === "string") {
    next.offlineWritingStyleCustom = item.offlineWritingStyleCustom;
  }
  return next;
}

export function hasOfflineOutputSettings(settings?: OfflineOutputSettings | null): boolean {
  if (!settings) return false;
  return settings.offlineOutputMinChars != null
    || settings.offlineOutputMaxChars != null
    || Boolean(settings.offlineWritingStyleId && settings.offlineWritingStyleId !== "none")
    || Boolean(settings.offlineWritingStyleCustom?.trim());
}

export function loadOfflineOutputSettings(characterId: string): OfflineOutputSettings {
  if (!characterId) return {};
  return normalizeStored(readAll()[characterId]);
}

export function saveOfflineOutputSettingsForCharacter(
  characterId: string,
  settings: OfflineOutputSettings,
): OfflineOutputSettings {
  if (!characterId) return settings;
  const next = { ...readAll(), [characterId]: normalizeStored(settings) };
  writeAll(next);
  return next[characterId];
}

export function sessionOfflineOutputSettings(session?: Pick<
  ChatSession,
  "offlineOutputMinChars" | "offlineOutputMaxChars" | "offlineWritingStyleId" | "offlineWritingStyleCustom"
> | null): OfflineOutputSettings {
  if (!session) return {};
  return normalizeStored({
    offlineOutputMinChars: session.offlineOutputMinChars,
    offlineOutputMaxChars: session.offlineOutputMaxChars,
    offlineWritingStyleId: session.offlineWritingStyleId,
    offlineWritingStyleCustom: session.offlineWritingStyleCustom,
  });
}

export function resolveOfflineOutputSettings(
  characterId?: string | null,
  session?: Pick<
    ChatSession,
    "offlineOutputMinChars" | "offlineOutputMaxChars" | "offlineWritingStyleId" | "offlineWritingStyleCustom"
  > | null,
): OfflineOutputSettings {
  const stored = characterId ? loadOfflineOutputSettings(characterId) : {};
  if (hasOfflineOutputSettings(stored)) return stored;
  return sessionOfflineOutputSettings(session);
}

export function countOfflineContentChars(text: string): number {
  return Array.from((text || "").replace(/\s+/g, "")).length;
}

export function getOfflineOutputRange(settings: OfflineOutputSettings): { min?: number; max?: number } | null {
  let min = settings.offlineOutputMinChars;
  let max = settings.offlineOutputMaxChars;
  if (min != null && max != null && min > max) {
    const swapped = min;
    min = max;
    max = swapped;
  }
  if (min == null && max == null) return null;
  return { min, max };
}

export function isOfflineContentInRange(text: string, settings: OfflineOutputSettings): boolean {
  const range = getOfflineOutputRange(settings);
  if (!range) return true;
  const count = countOfflineContentChars(text);
  if (range.min != null && count < range.min) return false;
  if (range.max != null && count > range.max) return false;
  return true;
}
