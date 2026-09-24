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
import { JOURNAL_STAMPS, type JournalAnnotation, type JournalBlock, type JournalDrawingSkill, type JournalStampKind } from "./journal-types";
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
  doodleHint?: string;
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
  const doodleHint = String(parsed.doodleHint ?? parsed.subject ?? "").trim();
  return {
    text: text ? text.slice(0, 180) : undefined,
    fontSize: Number.isFinite(fontSize) ? Math.min(28, Math.max(11, fontSize)) : undefined,
    stamp,
    stampNote: String(parsed.stampNote ?? "").trim().slice(0, 16) || undefined,
    stampX: Number.isFinite(stampX) ? Math.min(80, Math.max(0, stampX)) : undefined,
    stampY: Number.isFinite(stampY) ? Math.min(80, Math.max(0, stampY)) : undefined,
    doodle: parsed.doodle === true || String(parsed.doodle).toLowerCase() === "true",
    doodleHint: doodleHint ? doodleHint.slice(0, 24) : undefined,
    skill,
  };
}

function pickQuoteFromPage(page?: JournalPage, preferred?: string): string | undefined {
  const wanted = preferred?.trim();
  if (wanted) return wanted.slice(0, 48);
  const written = page?.blocks.find((block): block is Extract<JournalBlock, { type: "text" }> => (
    block.type === "text" && Boolean(block.text.trim())
  ));
  const text = written?.text.trim() || "";
  if (!text) return undefined;
  const slice = text.slice(0, 16).trim();
  return slice || undefined;
}

function parseAnnotationDraft(raw: string, page?: JournalPage): {
  text: string;
  quote?: string;
  blockId?: string;
} {
  const parsed = extractJsonRecord(raw);
  const text = String(parsed.text ?? "").trim()
    || raw.replace(/```[\s\S]*?```/g, "").replace(/\{[\s\S]*\}/, "").trim();
  const quote = pickQuoteFromPage(page, String(parsed.quote ?? ""));
  const blockId = String(parsed.blockId ?? "").trim() || page?.blocks.find(block => (
    block.type === "text" && quote && block.text.includes(quote)
  ))?.id;
  return { text, quote, blockId };
}

export async function generateJournalAnnotation(input: {
  characterId: string;
  book: JournalBook;
  page?: JournalPage;
  side?: JournalSide;
  annotations?: JournalAnnotation[];
}): Promise<string> {
  if (input.book.kind === "couple" && input.book.characterId !== input.characterId) {
    throw new ChatEngineError("情侣手账只能由对方批注。");
  }
  const target = input.page
    ? (input.side
      ? formatJournalSidePlainText(input.page, input.side, input.annotations)
      : formatJournalPagePlainText(input.page, input.annotations))
    : formatJournalBookPlainText(input.book);
  const resolved = await resolveJournalGeneration(
    input.characterId,
    [
      "【手账划线批注】",
      "用户把这一页手账给你看。用户已经写过的字、画和批注你都看得见，按人设接下去。",
      "若某一句让你有感，就划出那几个字，再写你的批注。",
      "不要改原页上的字和画，也不要复述整页。字数随心情，一两句即可。",
      "只输出 JSON：{\"quote\":\"从原文里原样摘出的短句\",\"text\":\"你的感悟\"}",
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
  const draft = parseAnnotationDraft(raw, input.page);
  if (!draft.text) throw new ChatEngineError("角色没有写出批注。");
  addJournalAnnotation({
    bookId: input.book.id,
    pageId: input.page?.id,
    side: input.side,
    blockId: draft.blockId,
    authorType: "character",
    characterId: resolved.character.id,
    characterName: resolved.character.name,
    text: draft.text,
    quote: draft.quote,
  });
  return draft.text;
}

export async function generateJournalCharacterPage(input: {
  characterId: string;
  book: JournalBook;
  page: JournalPage;
  mode?: "write" | "doodle" | "together";
  annotations?: JournalAnnotation[];
}): Promise<JournalCharacterPageDraft> {
  const character = loadCharacters().find(item => item.id === input.characterId);
  const skill = inferJournalDrawingSkill({
    persona: character?.persona,
    personality: character?.personality,
    name: character?.name,
    id: character?.id || input.characterId,
  });
  const mode = input.mode || "together";
  const modeHint = mode === "doodle"
    ? "这次请画画。根据这一页已经写了什么来联想：写到吃的就画那碗东西，写到天气就画天气，不要只会画爱心星星。可以顺手写一句。"
    : mode === "write"
      ? "这次以写为主。先看用户写了什么，再按人设接上：可以回应、补充、吐槽。若人设里你也爱画，可以一起画相关的东西。"
      : "写和画都可以一起做。用户先写了你也能看见。按人设和当下心情决定：可以只写、只画，也可以又写又画。";
  const resolved = await resolveJournalGeneration(
    input.characterId,
    [
      mode === "doodle" ? "【情侣手账来画】" : "【情侣手账接着写】",
      "这是你们一起做的一页手账。用户已经写在上面的字、画和批注你都看得见，不要装作没看见。",
      "请接着写或画在同一页上，不要另开左右页。",
      "这一页能放下多少写多少，字不要太多。写不下就少写一点，后面还可以再写下一页。",
      "画画时请联想具体事物，尽量画得像一点，而不是随便两笔符号。",
      drawingSkillHint(skill),
      modeHint,
      "只输出 JSON：{\"text\":\"这一页放得下的几句，也可空\",\"fontSize\":12|14|17,\"stamp\":\"heart|star|flower|arrow|underline|tape|none\",\"stampNote\":\"不超过16字\",\"doodle\":true|false,\"doodleHint\":\"你想画的东西，一两个词，如麻辣烫、雨天、小猫\"}",
      "",
      "这一页现有的内容：",
      formatJournalPagePlainText(input.page, input.annotations),
    ].join("\n"),
  );
  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `手账这一页:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "journal"] },
  );
  const draft = parseCharacterPageDraft(raw, skill);
  if (!draft.text && !draft.stamp && !draft.doodle) {
    const fallback = raw.replace(/```[\s\S]*?```/g, "").replace(/\{[\s\S]*\}/, "").trim();
    if (fallback) draft.text = fallback.slice(0, 400);
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
  const draft = await generateJournalCharacterPage({ ...input, mode: "together" });
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
