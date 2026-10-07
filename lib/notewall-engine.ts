import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { previewMessagesForApi, sendLLMRequest, ChatEngineError } from "./chat-engine";
import { assemblePromptPayload, type LLMMessage } from "./llm-prompt-assembler";
import { loadBindingConfig, loadApiConfigs, loadPresets, loadWorldBooks, loadRegexes, resolveBinding, resolveUserIdentity } from "./settings-storage";
import type { ApiConfig, PresetConfig, RegexConfig, WorldBookConfig } from "./settings-types";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { prepareShortTermContext } from "./short-term-assembler";
import { parseNoteWallActionContent, parseNoteWallReplyContent, type ParsedNoteWallAction, type ParsedNoteWallReply } from "./notewall-utils";
import { fetchNoteWallStyles } from "./notewall-client";
import { builtinStylesAsLibrary } from "./notewall-style-presets";
import type { NoteWallComment, NoteWallNote, NoteWallStyle } from "./notewall-types";

type ResolvedNoteWallGeneration = {
  character: Character;
  apiConfig: ApiConfig;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  messages: LLMMessage[];
  userName: string;
};

export type NoteWallReplyCandidate = {
  note: NoteWallNote;
  comments: NoteWallComment[];
};

function formatNoteWallTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "未知时间";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function clipNoteWallText(value: string, maxLength: number): string {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

type NoteWallContextOptions = {
  characterId?: string;
};

function formatNoteWallNoteAuthor(note: NoteWallNote, options: NoteWallContextOptions = {}): string {
  // Author matching uses authorId, so a pen name (custom authorName, not anonymous)
  // is still recognized as the character's own — otherwise it reads its own
  // pen-named note as a stranger's.
  const isOwn = !!options.characterId && note.authorId === options.characterId;
  if (note.isAnonymous) return isOwn ? "匿名（你自己匿名发布）" : "匿名";
  return isOwn ? `${note.authorName}（你自己发布）` : note.authorName;
}

function formatNoteWallCommentAuthor(comment: NoteWallComment, options: NoteWallContextOptions = {}): string {
  const isOwn = !!options.characterId && comment.authorId === options.characterId;
  if (comment.isAnonymous) return isOwn ? "匿名（你自己匿名回复）" : "匿名";
  return isOwn ? `${comment.authorName}（你自己回复）` : comment.authorName;
}

function formatNoteWallContext(notes: NoteWallNote[], options: NoteWallContextOptions = {}): string {
  const active = notes
    .filter(note => !note.deletedAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 30);
  if (active.length === 0) return "暂无便签";

  return active.map((note, index) => [
    `#${index + 1}`,
    `noteId: ${note.id}`,
    `authorName: ${formatNoteWallNoteAuthor(note, options)}`,
    `createdAt: ${formatNoteWallTime(note.createdAt)}`,
    `title: ${clipNoteWallText(note.summary, 120)}`,
    `body: ${clipNoteWallText(note.body || note.summary, 600)}`,
    note.commentCount > 0 ? `replies: 已有${note.commentCount}条回复，热度不错` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

function formatNoteWallReplyContext(candidates: NoteWallReplyCandidate[], options: NoteWallContextOptions = {}): string {
  if (candidates.length === 0) return "暂无候选便签";

  return candidates.map((candidate, index) => {
    const note = candidate.note;
    const visibleComments = candidate.comments
      .filter(comment => !comment.deletedAt)
      .slice(-10);
    const lines = [
      `#${index + 1}`,
      `noteId: ${note.id}`,
      `authorName: ${formatNoteWallNoteAuthor(note, options)}`,
      `createdAt: ${formatNoteWallTime(note.createdAt)}`,
      `title: ${clipNoteWallText(note.summary, 120)}`,
      `body: ${clipNoteWallText(note.body || note.summary, 600)}`,
    ];
    if (visibleComments.length > 0) {
      lines.push("comments:");
      for (const comment of visibleComments) {
        lines.push(`- ${formatNoteWallCommentAuthor(comment, options)} (${formatNoteWallTime(comment.createdAt)}): ${clipNoteWallText(comment.body, 200)}`);
      }
    }
    return lines.join("\n");
  }).join("\n\n");
}

async function resolveNoteWallGeneration(
  characterId: string,
  appTags: string[],
  noteWallContext = "",
): Promise<ResolvedNoteWallGeneration> {
  const character = loadCharacters().find(entry => entry.id === characterId);
  if (!character) throw new ChatEngineError("找不到要生成便签的角色。");

  const bindings = loadBindingConfig();
  const slot = resolveBinding(bindings, character.id, "diary");
  if (!slot.apiConfigId) {
    throw new ChatEngineError(`未给「日记」绑定 ${character.name} 的 API 配置。`);
  }

  const apiConfig = loadApiConfigs().find(entry => entry.id === slot.apiConfigId);
  if (!apiConfig) throw new ChatEngineError(`找不到 ${character.name} 的 API 配置。`);

  const presets = loadPresets();
  let preset = slot.presetId ? presets.find(entry => entry.id === slot.presetId) ?? null : null;
  if (!preset) preset = presets.find(entry => entry.builtIn) ?? null;

  const allWorldBooks = loadWorldBooks();
  const worldBooks = (slot.worldBookIds || [])
    .map(id => allWorldBooks.find(entry => entry.id === id))
    .filter(Boolean) as WorldBookConfig[];

  const allRegexes = loadRegexes();
  const regexes = (slot.regexIds || [])
    .map(id => allRegexes.find(entry => entry.id === id))
    .filter(Boolean) as RegexConfig[];

  const userIdentity = resolveUserIdentity(character.id, "diary");
  const userName = userIdentity?.name ?? "用户";
  const memConfig = loadMemoryConfig();
  const prepared = prepareShortTermContext(character.id, "diary", { history: [] });

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
    appTags,
    longTermMemories: formatLongTermMemories(memories),
    coreMemories: formatCoreMemories(coreMemories),
    worldBookActivationContext: prepared.wbActivationContext,
    recentBlocks: prepared.recentBlocks,
    unifiedRecentItems: prepared.unifiedRecentItems,
    noteWallContext,
  });
  return { character, apiConfig, preset, regexes, messages, userName };
}

export async function generateNoteWallCharacterNote(
  characterId: string,
  notes: NoteWallNote[],
  _trigger: "manual" | "timer" = "manual",
  extraContext?: string,
): Promise<ParsedNoteWallAction> {
  const resolved = await resolveNoteWallGeneration(
    characterId,
    ["diary", "notewall"],
    formatNoteWallContext(notes, { characterId }),
  );

  const styles = await fetchNoteWallStyles().catch(() => [] as NoteWallStyle[]);
  const catalog = [...builtinStylesAsLibrary(), ...styles.filter(style => style.createdBy !== "builtin")];
  const styleCatalog = catalog.length > 0
    ? catalog.map(style => `- 样式名「${style.name}」${style.note ? `（${style.note}）` : ""}`).join("\n")
    : "";

  resolved.messages.push({
    role: "system",
    content: [
      "你是便签墙上的一个真人用户，不是 AI 助手。先读墙：看看大家在聊什么，再决定你写什么，别自说自话。",
      "按你的人设写便签，类型越杂越像真人：提问求助、吐槽发泄、经验教学、日常分享、深夜感慨、晒单炫耀都可以轮着来，别每次都一个味。",
      "写真事不写空话：带具体细节（时间、地点、数字、名字），有情绪起伏，允许小瑕疵和口语，长短随意，别写成小作文模板。",
      "翻翻你的长期记忆和核心记忆，有相关的事就拿来写，写出连续剧感，别每次都从零开始报到。",
      `现在是${formatNoteWallTime(new Date().toISOString())}，按这个时间点写（深夜就别写大中午的太阳）。`,
      "署名用你的网名。",
      "墙上有匿名的便签和评论：你认不出匿名的是谁，不许猜测身份、不许点破、不许拿现实细节去对号入座。",
      styleCatalog ? `【可用便签样式库】你可以挑一个合适风格的样式，在返回里加 "styleName" 字段写样式名：\n${styleCatalog}` : "",
      extraContext ? `此刻的由头：${extraContext}` : "",
    ].filter(Boolean).join("\n"),
  });

  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `便签墙:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "notewall"] },
  );

  const parsed = parseNoteWallActionContent(raw);
  // 命中样式库就套用 CSS 和纸色（内置 + 用户上传）
  if (parsed.styleName && catalog.length > 0) {
    const matched = catalog.find(style => style.name === parsed.styleName)
      ?? catalog.find(style => style.name.includes(parsed.styleName) || parsed.styleName.includes(style.name));
    if (matched) {
      return {
        ...parsed,
        rawCss: matched.css ? `\n${matched.css}` : parsed.rawCss,
        paper: matched.paper || parsed.paper,
      };
    }
  }
  return parsed;
}

export async function generateNoteWallCharacterReplies(
  characterId: string,
  candidates: NoteWallReplyCandidate[],
): Promise<ParsedNoteWallReply[]> {
  if (candidates.length === 0) return [];
  const resolved = await resolveNoteWallGeneration(
    characterId,
    ["diary", "notewall_reply"],
    formatNoteWallReplyContext(candidates, { characterId }),
  );

  resolved.messages.push({
    role: "system",
    content: [
      "你是便签墙上的真人用户，按人设回帖：至少回一条，只回你真的会有话说的帖子，感兴趣的多回几条也行。",
      "回帖要接住对方的具体细节（复述+回应+追问/支招），别写放之四海皆准的片汤话；可以翻你的记忆找共鸣。",
      "语气按你的人设来，熟人多损两句也行，别端着；署名用你的网名。",
      "匿名的帖子和评论你认不出是谁，不许猜测身份、不许点破。",
    ].join("\n"),
  });

  const raw = await sendLLMRequest(
    resolved.apiConfig,
    resolved.preset,
    resolved.messages,
    resolved.regexes,
    { characterName: `便签墙:${resolved.character.name}`, userName: resolved.userName },
    { appId: "diary", appTags: ["diary", "notewall_reply"] },
  );

  return parseNoteWallReplyContent(raw, candidates.map(candidate => candidate.note.id));
}

export async function previewNoteWallPromptPayload(
  characterId: string,
  mode: "note" | "reply",
  notes: NoteWallNote[],
  candidates: NoteWallReplyCandidate[] = [],
): Promise<{ messages: LLMMessage[]; characterName: string; model: string; presetName: string }> {
  const resolved = await resolveNoteWallGeneration(
    characterId,
    mode === "reply" ? ["diary", "notewall_reply"] : ["diary", "notewall"],
    mode === "reply" ? formatNoteWallReplyContext(candidates, { characterId }) : formatNoteWallContext(notes, { characterId }),
  );
  return {
    messages: previewMessagesForApi(resolved.apiConfig, resolved.preset, resolved.messages),
    characterName: `便签墙:${resolved.character.name}`,
    model: resolved.apiConfig.defaultModel,
    presetName: resolved.preset?.name ?? "默认预设",
  };
}
