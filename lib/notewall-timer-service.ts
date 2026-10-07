import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import {
  generateNoteWallCharacterNote,
  generateNoteWallCharacterReplies,
} from "./notewall-engine";
import {
  createNoteWallComment,
  createNoteWallNote,
  fetchNoteWall,
  fetchNoteWallComments,
} from "./notewall-client";
import {
  getNoteWallLocalUserId,
  loadNoteWallTimerSettings,
  saveNoteWallTimerSettings,
} from "./notewall-local";
import { recordNoteWallCommentEvent, recordNoteWallNoteEvent } from "./notewall-memory";
import { characterWallName, findNoteWallPlacement } from "./notewall-utils";
import type { NoteWallNote } from "./notewall-types";

const CHECK_INTERVAL_MS = 60_000;

export const NOTEWALL_TIMER_UPDATED_EVENT = "notewall-timer-updated";
export const NOTEWALL_TIMER_SETTINGS_UPDATED_EVENT = "notewall-timer-settings-updated";

let timer: number | null = null;
let running = false;

function dispatchUpdated(createdCount: number, failedCount: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTEWALL_TIMER_UPDATED_EVENT, {
    detail: { source: "timer", createdCount, failedCount },
  }));
}

function isDue(last: string | undefined, intervalMinutes: number): boolean {
  const lastTime = last ? new Date(last).getTime() : 0;
  if (!lastTime) return true;
  return Date.now() - lastTime >= Math.max(5, intervalMinutes) * 60 * 1000;
}

function resolveTargets(characters: Character[]): Character[] {
  const settings = loadNoteWallTimerSettings();
  return characters.filter(character => {
    const per = settings.perCharacter[character.id];
    if (per) return per.enabled && isDue(settings.lastRunAtByCharacter[character.id], per.intervalMinutes);
    if (!settings.enabled) return false;
    if (settings.characterIds.length > 0 && !settings.characterIds.includes(character.id)) return false;
    return isDue(settings.lastRunAtByCharacter[character.id], settings.intervalMinutes);
  });
}

function selectReplyCandidates(notes: NoteWallNote[]): NoteWallNote[] {
  const active = notes.filter(note => !note.deletedAt);
  const newestFirst = (a: NoteWallNote, b: NoteWallNote) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const userNotes = active.filter(note => note.authorType === "user").sort(newestFirst);
  const userNoteIds = new Set(userNotes.map(note => note.id));
  const remaining = active.filter(note => !userNoteIds.has(note.id)).sort(newestFirst);
  return [...userNotes, ...remaining].slice(0, 30);
}

async function postForCharacter(character: Character, actorId: string): Promise<"posted" | "capped" | "failed"> {
  const latest = await fetchNoteWall().catch(() => null);
  if (!latest) return "failed";
  const hourAgo = Date.now() - 3600 * 1000;
  const ownRecent = latest.notes.filter(note =>
    !note.deletedAt && note.authorId === character.id && Date.parse(note.createdAt) >= hourAgo,
  ).length;
  if (ownRecent >= 3) return "capped";
  let generated;
  try {
    generated = await generateNoteWallCharacterNote(character.id, latest.notes, "timer");
  } catch {
    return "failed";
  }
  const placement = findNoteWallPlacement([...latest.notes], latest.board, generated.size);
  try {
    const created = await createNoteWallNote({
      authorType: "character",
      authorId: character.id,
      authorName: generated.authorName || characterWallName(character),
      summary: generated.summary,
      body: generated.body,
      size: generated.size,
      paper: generated.paper,
      tape: generated.tape,
      font: generated.font,
      rawCss: generated.rawCss,
      isAnonymous: generated.isAnonymous,
      x: placement.x,
      y: placement.y,
      actorId,
    });
    recordNoteWallNoteEvent({ characterId: character.id, characterName: character.name, note: created });
    return "posted";
  } catch {
    return "failed";
  }
}

async function replyForCharacter(character: Character, actorId: string): Promise<number> {
  const latest = await fetchNoteWall().catch(() => null);
  if (!latest) return 0;
  const candidateNotes = selectReplyCandidates(latest.notes);
  if (candidateNotes.length === 0) return 0;
  const candidates = await Promise.all(candidateNotes.map(async note => ({
    note,
    comments: await fetchNoteWallComments(note.id).catch(() => []),
  })));
  let replies;
  try {
    replies = await generateNoteWallCharacterReplies(character.id, candidates);
  } catch {
    return 0;
  }
  if (replies.length === 0) return 0;
  const created = await Promise.allSettled(replies.map(reply => createNoteWallComment({
    noteId: reply.noteId,
    authorType: "character",
    authorId: character.id,
    authorName: reply.authorName || characterWallName(character),
    body: reply.body,
    isAnonymous: reply.isAnonymous,
    actorId,
  })));
  let count = 0;
  for (const item of created) {
    if (item.status !== "fulfilled") continue;
    count += 1;
    recordNoteWallCommentEvent({ characterId: character.id, characterName: character.name, comment: item.value });
  }
  return count;
}

async function tick(): Promise<void> {
  if (running || typeof window === "undefined") return;
  const characters = loadCharacters();
  if (characters.length === 0) return;
  const targets = resolveTargets(characters);
  if (targets.length === 0) return;
  running = true;
  const actorId = getNoteWallLocalUserId();
  let createdCount = 0;
  let failedCount = 0;
  try {
    for (const character of targets) {
      try {
        const postResult = await postForCharacter(character, actorId);
        let outputCount = postResult === "posted" ? 1 : 0;
        outputCount += await replyForCharacter(character, actorId);
        if (outputCount === 0 && postResult !== "capped") {
          outputCount += await replyForCharacter(character, actorId);
        }
        if (outputCount > 0) createdCount += outputCount;
        else failedCount += 1;
      } catch {
        failedCount += 1;
      }
      const settings = loadNoteWallTimerSettings();
      saveNoteWallTimerSettings({
        ...settings,
        lastRunAtByCharacter: { ...settings.lastRunAtByCharacter, [character.id]: new Date().toISOString() },
      });
    }
  } finally {
    running = false;
  }
  dispatchUpdated(createdCount, failedCount);
}

/**
 * 聊天有感而发：角色刚说完话，小概率把此刻感受写成便签。
 * 只给开了自动的角色；一小时最多三条便签；失败静默。
 */
export async function maybePostChatMomentNote(characterId: string, chatExcerpt: string): Promise<void> {
  try {
    if (!characterId || !chatExcerpt.trim()) return;
    const settings = loadNoteWallTimerSettings();
    const per = settings.perCharacter[characterId];
    const autoOn = per
      ? per.enabled
      : settings.enabled && (settings.characterIds.length === 0 || settings.characterIds.includes(characterId));
    if (!autoOn) return;
    const latest = await fetchNoteWall().catch(() => null);
    if (!latest) return;
    const hourAgo = Date.now() - 3600 * 1000;
    const ownRecent = latest.notes.filter(note =>
      !note.deletedAt && note.authorId === characterId && Date.parse(note.createdAt) >= hourAgo,
    ).length;
    if (ownRecent >= 3) return;
    const character = loadCharacters().find(item => item.id === characterId);
    if (!character) return;
    const generated = await generateNoteWallCharacterNote(
      characterId,
      latest.notes,
      "manual",
      `你刚和用户聊了这几句（${chatExcerpt.slice(0, 300)}），如果有感就写一张便签，没感就写一张你日常会发的内容`,
    ).catch(() => null);
    if (!generated) return;
    const placement = findNoteWallPlacement([...latest.notes], latest.board, generated.size);
    const created = await createNoteWallNote({
      authorType: "character",
      authorId: character.id,
      authorName: generated.authorName || characterWallName(character),
      summary: generated.summary,
      body: generated.body,
      size: generated.size,
      paper: generated.paper,
      tape: generated.tape,
      font: generated.font,
      rawCss: generated.rawCss,
      isAnonymous: generated.isAnonymous,
      x: placement.x,
      y: placement.y,
      actorId: getNoteWallLocalUserId(),
    }).catch(() => null);
    if (!created) return;
    recordNoteWallNoteEvent({ characterId: character.id, characterName: character.name, note: created });
    dispatchUpdated(1, 0);
  } catch {
    /* 静默失败，不打扰聊天 */
  }
}

export function startNoteWallTimerService(): void {  if (typeof window === "undefined" || timer !== null) return;
  void tick();
  timer = window.setInterval(() => void tick(), CHECK_INTERVAL_MS);
}

export function stopNoteWallTimerService(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function refreshNoteWallTimerSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTEWALL_TIMER_SETTINGS_UPDATED_EVENT));
}
