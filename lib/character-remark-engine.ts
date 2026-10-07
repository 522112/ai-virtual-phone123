import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import { loadChatMessages, loadChatSessions } from "./chat-storage";
import { getCharacterRemark, setCharacterRemark } from "./contact-remarks";
import { loadApiConfigs, resolveUserIdentity } from "./settings-storage";

const inflight = new Set<string>();

/**
 * 对方给我的备注：初始为空时按人设+最近聊天生成一个（2-8字），
 * 后续对方可通过 [改备注] 随时改，名片自动更新、聊天里系统提示。
 */
export async function ensureInitialCharacterRemark(characterId: string): Promise<void> {
  if (!characterId || getCharacterRemark(characterId) || inflight.has(characterId)) return;
  inflight.add(characterId);
  try {
    const character = loadCharacters().find(c => c.id === characterId);
    if (!character) return;
    const configs = loadApiConfigs();
    const apiConfig = configs.find(c => c.apiKey) || configs[0];
    if (!apiConfig) return;
    const userName = resolveUserIdentity(characterId, "chat")?.name || "对方";
    const session = loadChatSessions().find(s => s.contactId === characterId && !s.isGroup);
    const recent = session
      ? loadChatMessages(session.id).slice(-8).map(m => `${m.role === "user" ? userName : character.name}：${String(m.content || "").slice(0, 120)}`).join("\n")
      : "";
    const raw = await sendLLMRequest(
      apiConfig,
      null,
      [
        { role: "system", content: `你是${character.name}。人设：${(character.persona || "").slice(0, 800)}` },
        {
          role: "user",
          content: `你手机通讯录里给${userName}的备注名叫什么？按你的人设和你们的关系起一个2-8字的备注（可以是昵称、外号、亲密称呼或冷淡代号）。\n${recent ? `最近聊天：\n${recent.slice(0, 1500)}` : ""}\n只输出备注本身，不要解释。`,
        },
      ],
      [],
      { characterName: character.name, userName },
      { appId: "contact-remark", appTags: ["contact-remark"] },
    );
    const remark = String(raw || "").replace(/["「」『』【】\[\]]/g, "").trim().slice(0, 12);
    if (remark) setCharacterRemark(characterId, remark, "character");
  } catch {
    /* ignore */
  } finally {
    inflight.delete(characterId);
  }
}
