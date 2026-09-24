import { loadCharacters } from "./character-storage";
import { ChatEngineError, sendLLMRequest } from "./chat-engine";
import { assemblePromptPayload, type LLMMessage } from "./llm-prompt-assembler";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import {
  loadApiConfigs,
  loadBindingConfig,
  loadPresets,
  loadRegexes,
  loadWorldBooks,
  resolveBinding,
  resolveUserIdentity,
} from "./settings-storage";
import type { ApiConfig, PresetConfig, RegexConfig, WorldBookConfig } from "./settings-types";
import { prepareShortTermContext } from "./short-term-assembler";
import type { Character } from "./character-types";
import { JOURNAL_STAMPS, type JournalStampKind } from "./journal-types";
import type { JournalBook, JournalPage, JournalSide } from "./journal-types";
import {
  addJournalAnnotation,
  formatJournalBookPlainText,
  formatJournalPagePlainText,
  formatJournalSidePlainText,
} from "./journal-storage";

type ResolvedJournalGeneration = {
  character: Character;
  apiConfig: ApiConfig;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  messages: LLMMessage[];
  userName: string;
};

async function resolveJournalGeneration(
  characterId: string,
  extraSystem: string,
): Promise<ResolvedJournalGeneration> {
  const character = loadCharacters().find(item => item.id === characterId);
  if (!character) throw new ChatEngineError("找不到要批注的角色。");

  const bindings = loadBindingConfig();
  const slot = resolveBinding(bindings, character.id, "diary");
  if (!slot.apiConfigId) {
    throw new ChatEngineError(`未给「手记」绑定 ${character.name} 的 API 配置。`);
  }
  const apiConfig = loadApiConfigs().find(item => item.id === slot.apiConfigId);
  if (!apiConfig) throw new ChatEngineError(`找不到 ${character.name} 的 API 配置。`);

  const presets = loadPresets();
  let preset = slot.presetId ? presets.find(item => item.id === slot.presetId) ?? null : null;
  if (!preset) preset = presets.find(item => item.builtIn) ?? null;

  const allWorldBooks = loadWorldBooks();
  const worldBooks = (slot.worldBookIds || [])
    .map(id => allWorldBooks.find(item => item.id === id))
    .filter(Boolean) as WorldBookConfig[];
  const allRegexes = loadRegexes();
  const regexes = (slot.regexIds || [])
    .map(id => allRegexes.find(item => item.id === id))
    .filter(Boolean) as RegexConfig[];

  const userIdentity = resolveUserIdentity(character.id, "diary");
  const prepared = prepareShortTermContext(character.id, "diary", { history: [] });
  const memConfig = loadMemoryConfig();
  const [memories, coreMemories] = await Promise.all([
    retrieveMemoriesForPrompt(character.id, prepared.wbActivationContext, memConfig).catch(() => []),
    retrieveCoreMemoriesForPrompt(character.id, memConfig).catch(() => []),
  ]);

  const messages = assemblePromptPayload({
    character,
    history: [],
    preset,
    worldBooks,
    regexes,
    userIdentity,
    appId: "diary",
    appTags: ["diary", "journal"],
    longTermMemories: formatLongTermMemories(memories),
    coreMemories: formatCoreMemories(coreMemories),
    worldBookActivationContext: prepared.wbActivationContext,
    recentBlocks: prepared.recentBlocks,
    unifiedRecentItems: prepared.unifiedRecentItems,
  });
  messages.push({ role: "system", content: extraSystem });

  return {
    character,
    apiConfig,
    preset,
    regexes,
    messages,
    userName: userIdentity?.name ?? "用户",
  };
}

function extractJsonObject(raw: string): Record<string, string> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? "").trim()]),
    );
  } catch {
    return {};
  }
}

export async function generateJournalAnnotation(input: {
  characterId: string;
  book: JournalBook;
  page?: JournalPage;
  side?: JournalSide;
}): Promise<string> {
  const target = input.page
    ? (input.side ? formatJournalSidePlainText(input.page, input.side) : formatJournalPagePlainText(input.page))
    : formatJournalBookPlainText(input.book);
  const resolved = await resolveJournalGeneration(
    input.characterId,
    [
      "【手账批注】",
      "用户把一篇手账给你看，请用符合人设的口吻写一段短批注。",
      "只写批注正文，不要标题、不要解释、不要用方括号指令。",
      "控制在 40 到 90 个汉字，像写在页边的字。",
      "",
      "手账内容：",
      target,
    ].join("\n"),
  );
  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `手账批注:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "journal"] },
  );
  const text = raw.replace(/```[\s\S]*?```/g, "").trim();
  if (!text) throw new ChatEngineError("角色没有写出批注。");
  addJournalAnnotation({
    bookId: input.book.id,
    pageId: input.page?.id,
    side: input.side,
    authorType: "character",
    characterId: resolved.character.id,
    characterName: resolved.character.name,
    text,
  });
  return text;
}

export async function generateJournalCharacterWrite(input: {
  characterId: string;
  book: JournalBook;
  page: JournalPage;
}): Promise<string> {
  const resolved = await resolveJournalGeneration(
    input.characterId,
    [
      "【情侣手账共写】",
      "这是一本打开的手账。用户写在左页，请你写在右页。",
      "用符合人设的口吻补写一段，像亲手写在本子上。",
      "只写正文，不要标题，不要指令。30 到 80 个汉字。",
      "",
      "左页（用户）：",
      formatJournalSidePlainText(input.page, "left"),
      "",
      "右页（你这边现有的内容）：",
      formatJournalSidePlainText(input.page, "right"),
    ].join("\n"),
  );
  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `手账共写:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "journal"] },
  );
  const text = raw.replace(/```[\s\S]*?```/g, "").trim();
  if (!text) throw new ChatEngineError("角色没有写下内容。");
  return text;
}

export async function generateJournalCharacterStamp(input: {
  characterId: string;
  book: JournalBook;
  page: JournalPage;
}): Promise<{ stamp: JournalStampKind; note: string }> {
  const resolved = await resolveJournalGeneration(
    input.characterId,
    [
      "【情侣手账涂鸦】",
      "请给这页手账盖一个小印章并写一句很短的边注。",
      `只输出 JSON：{"stamp":"heart|star|flower|arrow|underline|tape","note":"不超过16字"}`,
      "",
      "当前页：",
      formatJournalPagePlainText(input.page),
    ].join("\n"),
  );
  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `手账涂鸦:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "journal"] },
  );
  const parsed = extractJsonObject(raw);
  const stamp = JOURNAL_STAMPS.includes(parsed.stamp as JournalStampKind)
    ? parsed.stamp as JournalStampKind
    : "heart";
  return { stamp, note: (parsed.note || "写在边上").slice(0, 16) };
}
