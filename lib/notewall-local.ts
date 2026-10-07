"use client";

import type { NoteWallTimerSettings } from "./notewall-types";

const TIMER_KEY = "ai_phone_note_wall_timer_settings_v1";
const LOCAL_USER_KEY = "ai_phone_note_wall_local_user_v1";

export const DEFAULT_NOTE_WALL_TIMER_SETTINGS: NoteWallTimerSettings = {
  enabled: false,
  intervalMinutes: 360,
  characterIds: [],
  lastRunAtByCharacter: {},
  perCharacter: {},
  lastPostAtByCharacter: {},
  lastReplyAtByCharacter: {},
};

export function loadNoteWallTimerSettings(): NoteWallTimerSettings {
  if (typeof window === "undefined") return DEFAULT_NOTE_WALL_TIMER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(TIMER_KEY);
    if (!raw) return DEFAULT_NOTE_WALL_TIMER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NoteWallTimerSettings> & {
      replyEnabled?: unknown;
      replyIntervalMinutes?: unknown;
      replyLastRunAtByCharacter?: Record<string, unknown>;
    };
    const lastRunAtByCharacter = parsed.lastRunAtByCharacter && typeof parsed.lastRunAtByCharacter === "object"
      ? Object.fromEntries(Object.entries(parsed.lastRunAtByCharacter).map(([key, value]) => [key, String(value)]))
      : {};
    const legacyReplyLastRunAtByCharacter = parsed.replyLastRunAtByCharacter && typeof parsed.replyLastRunAtByCharacter === "object"
      ? Object.fromEntries(Object.entries(parsed.replyLastRunAtByCharacter).map(([key, value]) => [key, String(value)]))
      : {};
    const perCharacter: NoteWallTimerSettings["perCharacter"] = {};
    if (parsed.perCharacter && typeof parsed.perCharacter === "object") {
      for (const [key, value] of Object.entries(parsed.perCharacter)) {
        if (!value || typeof value !== "object") continue;
        const entry = value as {
          enabled?: unknown; intervalMinutes?: unknown;
          postEnabled?: unknown; postIntervalMinutes?: unknown;
          replyEnabled?: unknown; replyIntervalMinutes?: unknown;
        };
        const enabled = Boolean(entry.enabled);
        const intervalMinutes = Math.max(5, Math.min(10080, Number(entry.intervalMinutes) || 360));
        perCharacter[String(key)] = {
          enabled,
          intervalMinutes,
          postEnabled: typeof entry.postEnabled === "boolean" ? entry.postEnabled : enabled,
          postIntervalMinutes: Math.max(5, Math.min(10080, Number(entry.postIntervalMinutes) || intervalMinutes)),
          replyEnabled: typeof entry.replyEnabled === "boolean" ? entry.replyEnabled : enabled,
          replyIntervalMinutes: Math.max(5, Math.min(10080, Number(entry.replyIntervalMinutes) || intervalMinutes)),
        };
      }
    }
    const asTimeMap = (value: unknown): Record<string, string> => {
      if (!value || typeof value !== "object") return {};
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, String(val)]));
    };
    return {
      enabled: Boolean(parsed.enabled || parsed.replyEnabled),
      intervalMinutes: Math.max(5, Math.min(10080, Number(parsed.intervalMinutes ?? parsed.replyIntervalMinutes) || 360)),
      characterIds: Array.isArray(parsed.characterIds)
        ? parsed.characterIds.map(String).filter(Boolean)
        : [],
      lastRunAtByCharacter: { ...legacyReplyLastRunAtByCharacter, ...lastRunAtByCharacter },
      perCharacter,
      lastPostAtByCharacter: asTimeMap((parsed as { lastPostAtByCharacter?: unknown }).lastPostAtByCharacter),
      lastReplyAtByCharacter: asTimeMap((parsed as { lastReplyAtByCharacter?: unknown }).lastReplyAtByCharacter),
    };
  } catch {
    return DEFAULT_NOTE_WALL_TIMER_SETTINGS;
  }
}

export function saveNoteWallTimerSettings(settings: NoteWallTimerSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TIMER_KEY, JSON.stringify(settings));
}

export function getNoteWallLocalUserId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(LOCAL_USER_KEY);
  if (existing) return existing;
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(LOCAL_USER_KEY, id);
  return id;
}
