// lib/reverse-watch.ts — 反查岗编排：聊天/线下累计怀疑值，达到阈值自动触发查岗

import { getInternalCapability, REVERSE_WATCH_CAPABILITY_ID } from "./internal-capability-storage";
import { pushMusicSystemNotice } from "./music-action-queue";
import {
  addSuspicion,
  getReverseWatchRecord,
  markJudged,
  setTolerance,
  REVERSE_WATCH_TRIGGER_THRESHOLD,
} from "./reverse-watch-storage";
import { generateCheckPostOpener, judgePersonaTolerance, judgeUserMessageSuspicion } from "./reverse-watch-engine";
import {
  readUserCalendar,
  readUserContacts,
  readUserMessageList,
  readUserMoments,
  readUserPeople,
  readUserOrders,
} from "./reverse-watch-read";

export const REVERSE_WATCH_TRIGGER_EVENT = "reverse-watch-trigger";
/** 每隔多久才判定一次，避免每条消息都请求模型 */
const JUDGE_COOLDOWN_MS = 15000;
const judging = new Set<string>();

export function isReverseWatchEnabled(): boolean {
  const capability = getInternalCapability(REVERSE_WATCH_CAPABILITY_ID);
  return Boolean(capability && capability.enabled && capability.mode !== "off");
}

/** 人设容忍度：没有就按人设判定一次并缓存 */
export async function ensureTolerance(characterId: string, force = false): Promise<number> {
  const record = getReverseWatchRecord(characterId);
  // 默认值 50 视为"未判定"，判定过一次后会写入不同值或直接保留一次判定日志
  if (!force && record.log.some(e => e.kind === "event" && e.reason === "人设容忍度")) return record.tolerance;
  const value = await judgePersonaTolerance(characterId);
  if (value === null) return record.tolerance;
  setTolerance(characterId, value);
  return value;
}

/** 组装一份"用户手机"摘要，用于触发时的开场白 */
export function buildCheckPostDigest(): string {
  return [
    readUserMessageList("", 12),
    readUserContacts("", 12),
    readUserPeople("", 12),
    readUserMoments(10),
    readUserCalendar(),
    readUserOrders(8),
  ].join("\n\n").slice(0, 4000);
}

/** 触发反查岗：注入系统提示 + 通知 UI 打开查岗面板 */
export function triggerCheckPost(characterId: string, characterName: string): void {
  const record = getReverseWatchRecord(characterId);
  if (record.suspicion < REVERSE_WATCH_TRIGGER_THRESHOLD) return;
  pushMusicSystemNotice(
    characterId,
    `[系统：你对{{user}}的怀疑值已经到 ${record.suspicion}，你按捺不住要去翻{{user}}的手机了。请立刻用「反查岗」工具查看{{user}}的微信消息列表/聊天记录/联系人等，找到让你起疑的地方，然后按你的人设发难——质问、讽刺、示弱都可以。]`,
    { triggerReply: true },
  );
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REVERSE_WATCH_TRIGGER_EVENT, { detail: { characterId, characterName, suspicion: record.suspicion } }));
  }
}

/** 用户发了一条消息后的怀疑值判定（节流、非阻塞） */
export async function noteUserMessage(input: {
  characterId: string;
  characterName: string;
  userText: string;
  recent?: string;
}): Promise<void> {
  if (!input.characterId) return;
  if (!isReverseWatchEnabled()) return;
  const trimmed = input.userText.trim();
  if (!trimmed) return;
  const key = input.characterId;
  if (judging.has(key)) return;
  const record = getReverseWatchRecord(input.characterId);
  const last = record.lastJudgedAt ? Date.parse(record.lastJudgedAt) : 0;
  if (Date.now() - last < JUDGE_COOLDOWN_MS) return;
  judging.add(key);
  try {
    await ensureTolerance(input.characterId);
    const result = await judgeUserMessageSuspicion(input);
    markJudged(input.characterId);
    if (result.delta === 0) return;
    const added = addSuspicion(input.characterId, result.delta, result.reason, "chat");
    if (added.triggered) triggerCheckPost(input.characterId, input.characterName);
  } catch {
    /* ignore */
  } finally {
    judging.delete(key);
  }
}

/** 线下/系统事件累计（加好友、改备注、长时间不回等） */
export function noteOfflineEvent(characterId: string, delta: number, reason: string, characterName = ""): void {
  if (!characterId || !isReverseWatchEnabled()) return;
  const added = addSuspicion(characterId, delta, reason, "offline");
  if (added.triggered) triggerCheckPost(characterId, characterName);
}
