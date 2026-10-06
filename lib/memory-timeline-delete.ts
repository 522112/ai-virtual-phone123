import { deleteChatMessagesByIds, loadChatSessions } from "./chat-storage";
import { deleteMomentPost } from "./moments-storage";
import {
  deleteListenTogetherMessage,
  loadListenTogetherSessions,
} from "./listen-together-storage";
import type { NativeTimelineEntry } from "./short-term-assembler";

export type TimelineDeleteResult = {
  deletedMessages: number;
  deletedPosts: number;
  skipped: number;
};

function deleteListenMessageById(characterId: string, id: string): boolean {
  for (const s of loadListenTogetherSessions()) {
    if (s.characterId !== characterId) continue;
    if (s.messages.some(m => m.id === id)) {
      deleteListenTogetherMessage(s.id, id);
      return true;
    }
  }
  return false;
}

/**
 * 删除时间线条目背后的源数据（聊天消息 / 朋友圈动态）。
 * 投影类（story/vn/地图等）没有可删除的源，会被跳过并计入 skipped。
 */
export function deleteNativeTimelineEntries(
  characterId: string,
  entries: NativeTimelineEntry[],
): TimelineDeleteResult {
  const result: TimelineDeleteResult = { deletedMessages: 0, deletedPosts: 0, skipped: 0 };
  const chatIdsBySession = new Map<string, string[]>();
  const sessions = loadChatSessions();
  const direct = sessions.find(s => !s.isGroup && s.contactId === characterId);

  for (const e of entries) {
    if (e.sourceApp === "moments") {
      try {
        deleteMomentPost(e.id);
        result.deletedPosts += 1;
      } catch {
        result.skipped += 1;
      }
      continue;
    }
    if (e.sourceApp === "chat") {
      const sid = e.sourceDetail === "group"
        ? (e.groupSessionId || "")
        : (e.sessionId || direct?.id || "");
      if (!sid) {
        if (deleteListenMessageById(characterId, e.id)) result.deletedMessages += 1;
        else result.skipped += 1;
        continue;
      }
      const arr = chatIdsBySession.get(sid);
      if (arr) arr.push(e.id);
      else chatIdsBySession.set(sid, [e.id]);
      continue;
    }
    if (deleteListenMessageById(characterId, e.id)) result.deletedMessages += 1;
    else result.skipped += 1;
  }

  for (const [sid, ids] of chatIdsBySession) {
    try {
      const listenIds = ids.filter(id => deleteListenMessageById(characterId, id));
      const rest = ids.filter(id => !listenIds.includes(id));
      result.deletedMessages += listenIds.length;
      if (rest.length > 0) {
        result.deletedMessages += deleteChatMessagesByIds(sid, rest);
      }
    } catch {
      result.skipped += ids.length;
    }
  }
  return result;
}

export function formatTimelineDeleteResult(result: TimelineDeleteResult): string {
  const parts: string[] = [];
  if (result.deletedMessages > 0) parts.push(`${result.deletedMessages}条消息`);
  if (result.deletedPosts > 0) parts.push(`${result.deletedPosts}条动态`);
  if (parts.length === 0) return "没有可删除的内容";
  return `已删除${parts.join("、")}${result.skipped > 0 ? `（${result.skipped}条为系统/投影记录，保留）` : ""}`;
}
