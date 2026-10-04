// lib/reverse-watch-storage.ts — 反查岗：按角色累计"怀疑值"，人设容忍度不同，90 一定触发

import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export const REVERSE_WATCH_UPDATED_EVENT = "reverse-watch-updated";
/** 怀疑值达到这个数一定触发反查岗 */
export const REVERSE_WATCH_TRIGGER_THRESHOLD = 90;
export const REVERSE_WATCH_MAX = 100;

const STORAGE_KEY = "ai_phone_reverse_watch_v1";
registerKvMigration(STORAGE_KEY);

export type ReverseWatchLogKind = "chat" | "offline" | "decay" | "event" | "reset" | "trigger";

export type ReverseWatchLogEntry = {
  at: string;
  delta: number;
  reason: string;
  kind: ReverseWatchLogKind;
};

export type ReverseWatchRecord = {
  characterId: string;
  suspicion: number;      // 0-100
  tolerance: number;      // 0-100，人设容忍度：越高越难被激怒
  updatedAt: string;
  lastTriggeredAt?: string;
  lastJudgedAt?: string;
  log: ReverseWatchLogEntry[];
};

const DEFAULT_TOLERANCE = 50;
const MAX_LOG = 40;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function readAll(): Record<string, ReverseWatchRecord> {
  try {
    const raw = kvGet(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ReverseWatchRecord> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const item = value as Partial<ReverseWatchRecord>;
      out[key] = {
        characterId: typeof item.characterId === "string" && item.characterId ? item.characterId : key,
        suspicion: clamp(Number(item.suspicion) || 0, 0, REVERSE_WATCH_MAX),
        tolerance: clamp(Number(item.tolerance ?? DEFAULT_TOLERANCE), 0, 100),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        lastTriggeredAt: typeof item.lastTriggeredAt === "string" ? item.lastTriggeredAt : undefined,
        lastJudgedAt: typeof item.lastJudgedAt === "string" ? item.lastJudgedAt : undefined,
        log: Array.isArray(item.log) ? (item.log as ReverseWatchLogEntry[]).filter(e => e && typeof e === "object").slice(-MAX_LOG) : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ReverseWatchRecord>): void {
  try {
    kvSet(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
  dispatchUpdated(null);
}

function dispatchUpdated(characterId: string | null, triggered = false): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REVERSE_WATCH_UPDATED_EVENT, { detail: { characterId, triggered } }));
}

export function getReverseWatchRecord(characterId: string): ReverseWatchRecord {
  if (!characterId) {
    return { characterId: "", suspicion: 0, tolerance: DEFAULT_TOLERANCE, updatedAt: new Date().toISOString(), log: [] };
  }
  const found = readAll()[characterId];
  if (found) return found;
  return { characterId, suspicion: 0, tolerance: DEFAULT_TOLERANCE, updatedAt: new Date().toISOString(), log: [] };
}

export function getSuspicion(characterId: string): number {
  return getReverseWatchRecord(characterId).suspicion;
}

export function getTolerance(characterId: string): number {
  return getReverseWatchRecord(characterId).tolerance;
}

/** 人设容忍度：由 LLM 依据人设判定一次后缓存。0=一点就炸，100=几乎不怀疑 */
export function setTolerance(characterId: string, tolerance: number): ReverseWatchRecord {
  const map = readAll();
  const current = map[characterId] || { characterId, suspicion: 0, tolerance: DEFAULT_TOLERANCE, updatedAt: new Date().toISOString(), log: [] };
  const next: ReverseWatchRecord = {
    ...current,
    tolerance: clamp(tolerance, 0, 100),
    updatedAt: new Date().toISOString(),
    log: current.log.some(e => e.reason === "人设容忍度")
      ? current.log
      : [...current.log, { at: new Date().toISOString(), delta: 0, reason: "人设容忍度", kind: "event" as ReverseWatchLogKind }].slice(-MAX_LOG),
  };
  map[characterId] = next;
  writeAll(map);
  return next;
}

/** 容忍度越高，同样的言行涨得越慢 */
function toleranceMultiplier(tolerance: number): number {
  // tolerance 0 → 1.6x，50 → 1.0x，100 → 0.4x
  return clamp(1 + (DEFAULT_TOLERANCE - tolerance) / 83, 0.4, 1.6);
}

export type AddSuspicionResult = {
  record: ReverseWatchRecord;
  delta: number;
  triggered: boolean;
};

/**
 * 累计怀疑值。达到阈值且不在冷却期时触发反查岗。
 * kind: chat=聊天判定，offline=线下行为，event=系统事件，decay=随时间回落。
 */
export function addSuspicion(
  characterId: string,
  rawDelta: number,
  reason: string,
  kind: ReverseWatchLogKind = "chat",
): AddSuspicionResult {
  const map = readAll();
  const current = map[characterId] || { characterId, suspicion: 0, tolerance: DEFAULT_TOLERANCE, updatedAt: new Date().toISOString(), log: [] };
  const scaled = rawDelta > 0 ? rawDelta * toleranceMultiplier(current.tolerance) : rawDelta;
  const suspicion = clamp(current.suspicion + scaled, 0, REVERSE_WATCH_MAX);
  const entry: ReverseWatchLogEntry = {
    at: new Date().toISOString(),
    delta: Math.round(scaled * 10) / 10,
    reason: String(reason || "").slice(0, 120),
    kind,
  };
  const log = [...current.log, entry].slice(-MAX_LOG);
  const triggered = suspicion >= REVERSE_WATCH_TRIGGER_THRESHOLD && kind !== "reset";
  const next: ReverseWatchRecord = {
    ...current,
    suspicion,
    updatedAt: new Date().toISOString(),
    lastTriggeredAt: triggered ? new Date().toISOString() : current.lastTriggeredAt,
    log: triggered ? [...log, { at: new Date().toISOString(), delta: 0, reason: "怀疑值达到阈值，触发反查岗", kind: "trigger" as ReverseWatchLogKind }].slice(-MAX_LOG) : log,
  };
  map[characterId] = next;
  writeAll(map);
  dispatchUpdated(characterId, triggered);
  return { record: next, delta: Math.round(scaled * 10) / 10, triggered };
}

export function markJudged(characterId: string): void {
  const map = readAll();
  const current = map[characterId];
  if (!current) return;
  map[characterId] = { ...current, lastJudgedAt: new Date().toISOString() };
  writeAll(map);
}

export function resetSuspicion(characterId: string): ReverseWatchRecord {
  const map = readAll();
  const current = map[characterId] || { characterId, suspicion: 0, tolerance: DEFAULT_TOLERANCE, updatedAt: new Date().toISOString(), log: [] };
  const next: ReverseWatchRecord = {
    ...current,
    suspicion: 0,
    updatedAt: new Date().toISOString(),
    log: [...current.log, { at: new Date().toISOString(), delta: 0, reason: "怀疑值归零", kind: "reset" }].slice(-MAX_LOG),
  };
  map[characterId] = next;
  writeAll(map);
  return next;
}

export function loadAllReverseWatch(): ReverseWatchRecord[] {
  return Object.values(readAll()).sort((a, b) => b.suspicion - a.suspicion);
}
