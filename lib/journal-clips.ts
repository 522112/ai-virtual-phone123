import { loadChatMessages, loadChatSessions } from "./chat-storage";
import { loadChatOfflineTurns } from "./chat-offline-storage";
import { loadMemoryEntries } from "./memory-storage";
import type { JournalClipCandidate } from "./journal-types";

function clipText(value: string, max = 180): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function collectJournalClips(characterId: string): Promise<JournalClipCandidate[]> {
  const session = loadChatSessions().find(item => item.contactId === characterId && !item.isGroup);
  const items: JournalClipCandidate[] = [];

  if (session) {
    const messages = loadChatMessages(session.id).slice(-20).reverse();
    for (const message of messages) {
      const text = clipText(message.content || "");
      if (!text) continue;
      items.push({
        id: `chat_${message.id}`,
        source: "chat",
        sourceLabel: message.role === "user" ? "线上聊天 · 我" : "线上聊天 · 对方",
        text,
        createdAt: message.createdAt,
      });
    }
    const turns = loadChatOfflineTurns(session.id).slice(-12).reverse();
    for (const turn of turns) {
      const text = clipText(turn.summary || turn.assistantContent || turn.userContent);
      if (!text) continue;
      items.push({
        id: `offline_${turn.id}`,
        source: "offline",
        sourceLabel: "线下剧情",
        text,
        createdAt: turn.createdAt,
      });
    }
  }

  const memories = await loadMemoryEntries(characterId).catch(() => []);
  for (const memory of memories.slice(-12).reverse()) {
    const text = clipText(memory.content);
    if (!text) continue;
    items.push({
      id: `memory_${memory.id}`,
      source: "memory",
      sourceLabel: memory.type === "core" ? "核心记忆" : "记忆库",
      text,
      createdAt: memory.createdAt,
    });
  }

  return items.slice(0, 30);
}
