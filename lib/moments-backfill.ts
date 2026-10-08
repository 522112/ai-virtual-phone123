import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import { loadApiConfigs } from "./settings-storage";
import { getAllPosts, saveMomentPosts } from "./moments-storage";
import type { MomentPost } from "./moments-types";

export type BackfillItem = {
  content: string;
  hasImage: boolean;
  imageDesc: string;
  hoursAgo: number;
};

function parseItems(raw: unknown): BackfillItem[] {
  try {
    const text = String(raw || "").replace(/```[\s\S]*?```/g, "");
    const match = text.match(/\[[\s\S]*\]/)?.[0] || "[]";
    const parsed = JSON.parse(match) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      .map(v => ({
        content: String(v.content || "").trim().slice(0, 200),
        hasImage: v.hasImage === true,
        imageDesc: String(v.imageDesc || "").trim().slice(0, 120),
        hoursAgo: Math.max(1, Math.min(24 * 30, Number(v.hoursAgo) || 24)),
      }))
      .filter(v => v.content.length > 0)
      .slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * 联系人朋友圈首次打开：一次调用生成 5-10 条过往动态，时间自动铺开
 * （几天前到几小时前各有几条，模拟真实朋友圈可翻到的历史）。
 * 没有生图 API：有图动态只记 imageDesc，渲染时用文字图占位。
 */
export async function generateMomentsBackfill(characterId: string): Promise<MomentPost[]> {
  const character = loadCharacters().find(c => c.id === characterId);
  if (!character) throw new Error("角色不存在");
  const existing = getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId);
  if (existing.length > 0) return existing;

  const configs = loadApiConfigs();
  const apiConfig = configs.find(c => c.apiKey) || configs[0];
  if (!apiConfig) throw new Error("还没有可用的 API 配置");

  const count = 5 + Math.floor(Math.random() * 6);
  const raw = await sendLLMRequest(
    apiConfig,
    null,
    [
      { role: "system", content: `你是${character.name}。人设：${(character.persona || "").slice(0, 800)}` },
      {
        role: "user",
        content: `按你的人设编 ${count} 条你以前发过的朋友圈：日常、吃喝玩乐、情绪、碎碎念都可以混搭，其中 3-4 条带一张配图。\n只输出 JSON 数组，每条：{"content":"正文40字以内，口语化，像真人发的","hasImage":true|false,"imageDesc":"有图时写一句画面描述，无图为空","hoursAgo":这条是多久以前发的小时数，要铺开：几天前、1-2天前、十几小时前、几小时前都要有，从大到小排}。\n不要输出"刚刚"，最小 2 小时起。`,
      },
    ],
    [],
    { characterName: character.name },
    { appId: "moments-backfill", appTags: ["moments-backfill"] },
  );
  let items = parseItems(raw);
  if (items.length === 0) {
    items = [
      { content: "今天天气不错。", hasImage: false, imageDesc: "", hoursAgo: 72 },
      { content: "忙完这一阵就好了。", hasImage: true, imageDesc: "窗外的晚霞", hoursAgo: 30 },
      { content: "好吃的果然能治愈一切。", hasImage: true, imageDesc: "一桌好吃的", hoursAgo: 8 },
      { content: "早点睡，明天又是新的一天。", hasImage: false, imageDesc: "", hoursAgo: 3 },
    ];
  }
  items.sort((a, b) => b.hoursAgo - a.hoursAgo);

  const now = Date.now();
  const posts: MomentPost[] = items.map((item, i) => ({
    id: `moment_${now - i}_${Math.random().toString(36).slice(2, 7)}`,
    authorType: "character",
    authorId: characterId,
    content: item.content,
    ...(item.hasImage && item.imageDesc ? { photoDescription: item.imageDesc } : {}),
    visibility: [],
    likes: [],
    createdAt: new Date(now - item.hoursAgo * 3600_000).toISOString(),
  }));
  saveMomentPosts([...posts, ...getAllPosts()]);
  return posts;
}
