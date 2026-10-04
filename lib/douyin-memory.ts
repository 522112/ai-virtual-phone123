import { kvGet, kvKeysWithPrefix, kvRemove, kvSet, registerDynamicPrefix } from "./kv-db";
import { formatChatTimestamp } from "./llm-prompt-assembler";
import type { DouyinLiveRoom, DouyinVideo } from "./douyin-types";

const DOUYIN_EVENT_PREFIX = "ai_phone_douyin_events_";
const MAX_EVENTS_PER_CHARACTER = 120;

registerDynamicPrefix(DOUYIN_EVENT_PREFIX);

export type DouyinProjectionEntry = {
  id: string;
  timestamp: string;
  content: string;
  videoId?: string;
  liveId?: string;
};

function storageKey(characterId: string): string {
  return `${DOUYIN_EVENT_PREFIX}${characterId}`;
}

function cleanEventText(value: unknown, maxLength: number): string {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function loadEventsByKey(key: string): DouyinProjectionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = kvGet(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is DouyinProjectionEntry =>
        Boolean(entry
          && typeof entry.id === "string"
          && typeof entry.timestamp === "string"
          && typeof entry.content === "string")
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

function saveEventsByKey(key: string, events: DouyinProjectionEntry[]): void {
  if (typeof window === "undefined") return;
  const compacted = [...events]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-MAX_EVENTS_PER_CHARACTER);
  kvSet(key, JSON.stringify(compacted));
}

function loadEvents(characterId: string): DouyinProjectionEntry[] {
  return loadEventsByKey(storageKey(characterId));
}

function saveEvents(characterId: string, events: DouyinProjectionEntry[]): void {
  saveEventsByKey(storageKey(characterId), events);
}

function upsertEvent(characterId: string, entry: DouyinProjectionEntry): void {
  const events = loadEvents(characterId);
  const next = events.filter(item => item.id !== entry.id);
  next.push(entry);
  saveEvents(characterId, next);
}

export function recordDouyinPublishEvent(input: {
  characterId: string;
  characterName: string;
  video: DouyinVideo;
}): void {
  const timestamp = input.video.createdAt || new Date().toISOString();
  const time = formatChatTimestamp(timestamp);
  const name = cleanEventText(input.characterName, 80) || "角色";
  const caption = cleanEventText(input.video.caption, 240);
  upsertEvent(input.characterId, {
    id: `douyin_publish_${input.video.id}`,
    videoId: input.video.id,
    timestamp,
    content: `[抖音 ${time}] ${name}在抖音发布了一条短视频：“${caption}”。点赞 ${input.video.likeCount}，评论 ${input.video.commentCount}，分享 ${input.video.shareCount}。`,
  });
}

export function recordDouyinLiveHostEvent(input: {
  characterId: string;
  characterName: string;
  room: DouyinLiveRoom;
}): void {
  const timestamp = input.room.startedAt || new Date().toISOString();
  const time = formatChatTimestamp(timestamp);
  const name = cleanEventText(input.characterName, 80) || "角色";
  upsertEvent(input.characterId, {
    id: `douyin_live_host_${input.room.id}`,
    liveId: input.room.id,
    timestamp,
    content: `[抖音 ${time}] ${name}开启了抖音直播「${cleanEventText(input.room.title, 80)}」，人设：“${cleanEventText(input.room.persona || "日常直播", 160)}”。`,
  });
}

export function recordDouyinLiveInteractEvent(input: {
  characterId: string;
  characterName: string;
  room: DouyinLiveRoom;
  speak?: string;
  danmaku?: string;
  giftCoins?: number;
  giftLabel?: string;
  pkTopic?: string;
}): void {
  const timestamp = new Date().toISOString();
  const time = formatChatTimestamp(timestamp);
  const name = cleanEventText(input.characterName, 80) || "角色";
  const parts: string[] = [];
  if (input.speak?.trim()) parts.push(`讲话：“${cleanEventText(input.speak, 160)}”`);
  if (input.danmaku?.trim()) parts.push(`弹幕：“${cleanEventText(input.danmaku, 80)}”`);
  if ((input.giftCoins || 0) > 0) {
    parts.push(`刷了礼物「${cleanEventText(input.giftLabel || "礼物", 24)}」×${input.giftCoins}`);
  }
  if (input.pkTopic?.trim()) parts.push(`参与 PK「${cleanEventText(input.pkTopic, 40)}」`);
  if (parts.length === 0) return;
  upsertEvent(input.characterId, {
    id: `douyin_live_interact_${input.room.id}_${Date.now()}`,
    liveId: input.room.id,
    timestamp,
    content: `[抖音 ${time}] ${name}在「${cleanEventText(input.room.hostName, 40)}」的直播间里：${parts.join("；")}。`,
  });
}

export function recordDouyinLiveEndEvent(input: {
  characterId: string;
  characterName: string;
  room: DouyinLiveRoom;
  giftIncome?: number;
}): void {
  const timestamp = new Date().toISOString();
  const time = formatChatTimestamp(timestamp);
  const name = cleanEventText(input.characterName, 80) || "角色";
  const income = Math.max(0, input.giftIncome ?? (input.room.giftCoins - (input.room.settledGiftCoins || 0)));
  upsertEvent(input.characterId, {
    id: `douyin_live_end_${input.room.id}`,
    liveId: input.room.id,
    timestamp,
    content: `[抖音 ${time}] ${name}结束了直播「${cleanEventText(input.room.title, 80)}」，本场礼物折合入账 ${income}。`,
  });
}

export function loadDouyinProjectionEntries(
  characterId: string,
  options?: { afterTimestamp?: string },
): DouyinProjectionEntry[] {
  const events = loadEvents(characterId);
  if (!options?.afterTimestamp) return events;
  return events.filter(entry => entry.timestamp > options.afterTimestamp!);
}

export function clearDouyinProjectionEvents(): void {
  if (typeof window === "undefined") return;
  for (const key of kvKeysWithPrefix(DOUYIN_EVENT_PREFIX)) {
    kvRemove(key);
  }
}
