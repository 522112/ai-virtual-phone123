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
import { JOURNAL_STAMPS, type JournalDrawingSkill, type JournalStampKind } from "./journal-types";
import type { JournalBook, JournalPage, JournalSide } from "./journal-types";
import {
  addJournalAnnotation,
  formatJournalBookPlainText,
  formatJournalPagePlainText,
  formatJournalSidePlainText,
  inferJournalDrawingSkill,
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

function extractJsonRecord(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function drawingSkillHint(skill: JournalDrawingSkill): string {
  if (skill === "poor") return "你不太会画画，涂鸦可以歪、断、乱一点，不要假装画得很好。";
  if (skill === "good") return "你画画还不错，线条可以干净一些，像随手画在本子上。";
  return "你画画一般，能看出来形状，但不精致。";
}

export type JournalCharacterPageDraft = {
  text?: string;
  fontSize?: number;
  stamp?: JournalStampKind;
  stampNote?: string;
  stampX?: number;
  stampY?: number;
  doodle?: boolean;
  skill: JournalDrawingSkill;
};

function parseCharacterPageDraft(raw: string, skill: JournalDrawingSkill): JournalCharacterPageDraft {
  const parsed = extractJsonRecord(raw);
  const text = String(parsed.text ?? "").trim();
  const stampRaw = String(parsed.stamp ?? "").trim();
  const stamp = JOURNAL_STAMPS.includes(stampRaw as JournalStampKind) ? stampRaw as JournalStampKind : undefined;
  const fontSize = Number(parsed.fontSize);
  const stampX = Number(parsed.stampX);
  const stampY = Number(parsed.stampY);
  return {
    text: text || undefined,
    fontSize: Number.isFinite(fontSize) ? Math.min(22, Math.max(11, fontSize)) : undefined,
    stamp,
    stampNote: String(parsed.stampNote ?? "").trim().slice(0, 16) || undefined,
    stampX: Number.isFinite(stampX) ? Math.min(80, Math.max(0, stampX)) : undefined,
    stampY: Number.isFinite(stampY) ? Math.min(80, Math.max(0, stampY)) : undefined,
    doodle: parsed.doodle === true || String(parsed.doodle).toLowerCase() === "true",
    skill,
  };
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

export async function generateJournalCharacterPage(input: {
  characterId: string;
  book: JournalBook;
  page: JournalPage;
  mode?: "write" | "doodle";
}): Promise<JournalCharacterPageDraft> {
  const character = loadCharacters().find(item => item.id === input.characterId);
  const skill = inferJournalDrawingSkill({
    persona: character?.persona,
    personality: character?.personality,
    name: character?.name,
    id: character?.id || input.characterId,
  });
  const mode = input.mode || "write";
  const resolved = await resolveJournalGeneration(
    input.characterId,
    [
      mode === "doodle" ? "【情侣手账涂右页】" : "【情侣手账右页】",
      "这是一本打开的手账。用户写在左页，请你写在右页。",
      "用符合人设的口吻补一段完整的手账：可以写一段话、盖一个小印章，也可以决定要不要涂两笔。",
      drawingSkillHint(skill),
      mode === "doodle"
        ? "这次请以涂鸦和印章为主，正文可以很短。"
        : "这次请以文字为主，印章和涂鸦按心情决定。",
      `只输出 JSON：{"text":"40到120字","fontSize":12|14|17,"stamp":"heart|star|flower|arrow|underline|tape|none","stampNote":"不超过16字","stampX":0到80,"stampY":0到70,"doodle":true|false}`,
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
    { characterName: `手账右页:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "journal"] },
  );
  const draft = parseCharacterPageDraft(raw, skill);
  if (!draft.text && !draft.stamp && !draft.doodle) {
    const fallback = raw.replace(/```[\s\S]*?```/g, "").replace(/\{[\s\S]*\}/, "").trim();
    if (fallback) draft.text = fallback.slice(0, 160);
  }
  if (!draft.text && !draft.stamp && !draft.doodle) {
    throw new ChatEngineError("角色没有写下内容。");
  }
  if (mode === "doodle" && !draft.stamp) draft.stamp = "heart";
  if (mode === "doodle") draft.doodle = true;
  return draft;
}

export async function generateJournalCharacterWrite(input: {
  characterId: string;
  book: JournalBook;
  page: JournalPage;
}): Promise<string> {
  const draft = await generateJournalCharacterPage({ ...input, mode: "write" });
  if (draft.text) return draft.text;
  throw new ChatEngineError("角色没有写下内容。");
}

export async function generateJournalCharacterStamp(input: {
  characterId: string;
  book: JournalBook;
  page: JournalPage;
}): Promise<{ stamp: JournalStampKind; note: string; skill: JournalDrawingSkill }> {
  const draft = await generateJournalCharacterPage({ ...input, mode: "doodle" });
  return {
    stamp: draft.stamp || "heart",
    note: (draft.stampNote || "写在边上").slice(0, 16),
    skill: draft.skill,
  };
}
