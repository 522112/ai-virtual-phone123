import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import { loadApiConfigs } from "./settings-storage";

export const GOD_VIEW_UPDATED_EVENT = "god-view-updated";

export type GodViewMessage = {
  speaker: "a" | "b";
  name: string;
  text: string;
};

export type GodViewRecord = {
  id: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  topic: string;
  messages: GodViewMessage[];
  createdAt: string;
  updatedAt: string;
};

const GOD_VIEW_KEY = "ai_phone_god_view_records_v1";
registerKvMigration(GOD_VIEW_KEY);

function readAll(): GodViewRecord[] {
  try {
    const raw = kvGet(GOD_VIEW_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    return list.filter((v): v is GodViewRecord => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string");
  } catch {
    return [];
  }
}

export function loadGodViewRecords(): GodViewRecord[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveAll(records: GodViewRecord[]): void {
  kvSet(GOD_VIEW_KEY, JSON.stringify(records.slice(0, 30)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GOD_VIEW_UPDATED_EVENT));
    window.dispatchEvent(new CustomEvent("global-notice", { detail: "上帝视角有新动态：两个角色的聊天已更新" }));
  }
}

/**
 * 上帝视角：两个角色之间的聊天。双方都不知道被围观，
 * 对话里不出现用户，纯按双方人设推进。
 */
export async function generateGodViewDialog(aId: string, bId: string, topic: string): Promise<GodViewRecord> {
  const a = loadCharacters().find(c => c.id === aId);
  const b = loadCharacters().find(c => c.id === bId);
  if (!a || !b) throw new Error("角色不存在");
  const configs = loadApiConfigs();
  const apiConfig = configs.find(c => c.apiKey) || configs[0];
  if (!apiConfig) throw new Error("还没有可用的 API 配置");

  const history: string[] = [];
  const messages: GodViewMessage[] = [];
  const rounds = 3;
  for (let i = 0; i < rounds; i++) {
    for (const side of [{ id: aId, me: a, peer: b, key: "a" as const }, { id: bId, me: b, peer: a, key: "b" as const }]) {
      const raw = await sendLLMRequest(
        apiConfig,
        null,
        [
          { role: "system", content: `你是${side.me.name}。人设：${(side.me.persona || "").slice(0, 1000)}\n你正在和${side.peer.name}私聊（人设：${(side.peer.persona || "").slice(0, 500)}）。不知道有第三个人在看。按人设说话，每轮一到三句。` },
          {
            role: "user",
            content: `${i === 0 && side.key === "a" ? `开场话题：${topic.slice(0, 200)}\n` : ""}${history.length === 0 ? "你先开口。" : `目前的聊天：\n${history.slice(-8).join("\n")}\n轮到你回${side.peer.name}。`}只输出你说的话。`,
          },
        ],
        [],
        { characterName: side.me.name, userName: side.peer.name },
        { appId: "god-view", appTags: ["god-view"] },
      );
      const text = String(raw || "").trim().slice(0, 300);
      if (!text) continue;
      history.push(`${side.me.name}：${text}`);
      messages.push({ speaker: side.key, name: side.me.name, text });
    }
  }
  if (messages.length === 0) throw new Error("对话生成失败");
  const now = new Date().toISOString();
  const record: GodViewRecord = {
    id: `god_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    aId, bId, aName: a.name, bName: b.name,
    topic: topic.slice(0, 100),
    messages,
    createdAt: now,
    updatedAt: now,
  };
  saveAll([record, ...readAll()]);
  return record;
}

export function deleteGodViewRecord(id: string): void {
  kvSet(GOD_VIEW_KEY, JSON.stringify(readAll().filter(r => r.id !== id)));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GOD_VIEW_UPDATED_EVENT));
}
