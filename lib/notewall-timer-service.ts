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
import type { NoteWallBoard, NoteWallNote } from "./notewall-types";

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

function resolvePostConfig(settings: ReturnType<typeof loadNoteWallTimerSettings>, characterId: string): { enabled: boolean; intervalMinutes: number } {
  const per = settings.perCharacter[characterId];
  if (per) return { enabled: per.postEnabled, intervalMinutes: per.postIntervalMinutes };
  if (!settings.enabled) return { enabled: false, intervalMinutes: settings.intervalMinutes };
  if (settings.characterIds.length > 0 && !settings.characterIds.includes(characterId)) {
    return { enabled: false, intervalMinutes: settings.intervalMinutes };
  }
  return { enabled: true, intervalMinutes: settings.intervalMinutes };
}

function resolveReplyConfig(settings: ReturnType<typeof loadNoteWallTimerSettings>, characterId: string): { enabled: boolean; intervalMinutes: number } {
  const per = settings.perCharacter[characterId];
  if (per) return { enabled: per.replyEnabled, intervalMinutes: per.replyIntervalMinutes };
  if (!settings.enabled) return { enabled: false, intervalMinutes: settings.intervalMinutes };
  if (settings.characterIds.length > 0 && !settings.characterIds.includes(characterId)) {
    return { enabled: false, intervalMinutes: settings.intervalMinutes };
  }
  return { enabled: true, intervalMinutes: settings.intervalMinutes };
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

async function postForCharacter(
  character: Character,
  actorId: string,
  latest: { board: NoteWallBoard; notes: NoteWallNote[] },
  postIntervalMinutes: number,
): Promise<"posted" | "capped" | "failed"> {
  const now = Date.now();
  const hourAgo = now - 3600 * 1000;
  const ownRecent = latest.notes.filter(note =>
    !note.deletedAt && note.authorId === character.id && Date.parse(note.createdAt) >= hourAgo,
  ).length;
  if (ownRecent >= 3) return "capped";
  // 云端排重：另一台设备刚发过就不再发
  const intervalAgo = now - Math.max(5, postIntervalMinutes) * 60 * 1000;
  const ownWithinInterval = latest.notes.some(note =>
    !note.deletedAt && note.authorId === character.id && Date.parse(note.createdAt) >= intervalAgo,
  );
  if (ownWithinInterval) return "capped";
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

async function replyForCharacter(
  character: Character,
  actorId: string,
  notes: NoteWallNote[],
  replyIntervalMinutes: number,
): Promise<number> {
  const candidateNotes = selectReplyCandidates(notes);
  if (candidateNotes.length === 0) return 0;
  const candidates = await Promise.all(candidateNotes.map(async note => ({
    note,
    comments: await fetchNoteWallComments(note.id).catch(() => []),
  })));
  // 只回没回过的：过滤掉自己已评论的帖子
  const unreplied = candidates.filter(item =>
    !item.comments.some(comment => !comment.deletedAt && comment.authorId === character.id),
  );
  if (unreplied.length === 0) return 0;
  // 云端排重：这个间隔内自己已回过就不再回
  const intervalAgo = Date.now() - Math.max(5, replyIntervalMinutes) * 60 * 1000;
  const repliedWithinInterval = candidates.some(item =>
    item.comments.some(comment =>
      !comment.deletedAt && comment.authorId === character.id && Date.parse(comment.createdAt) >= intervalAgo,
    ),
  );
  if (repliedWithinInterval) return 0;
  let replies;
  try {
    replies = await generateNoteWallCharacterReplies(character.id, unreplied);
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
  const settings = loadNoteWallTimerSettings();
  const targets = characters.filter(character => {
    const post = resolvePostConfig(settings, character.id);
    const reply = resolveReplyConfig(settings, character.id);
    return post.enabled || reply.enabled;
  });
  if (targets.length === 0) return;
  running = true;
  const actorId = getNoteWallLocalUserId();
  let createdCount = 0;
  let failedCount = 0;
  try {
    for (const character of targets) {
      try {
        const latest = await fetchNoteWall().catch(() => null);
        if (!latest) { failedCount += 1; continue; }
        const live = loadNoteWallTimerSettings();
        const post = resolvePostConfig(live, character.id);
        const reply = resolveReplyConfig(live, character.id);
        let outputCount = 0;
        // 兴趣门控：发帖不是必须的，约六成概率才写；回帖看模型自己有没有话说
        if (post.enabled && Math.random() < 0.6 && isDue(live.lastPostAtByCharacter[character.id] ?? live.lastRunAtByCharacter[character.id], post.intervalMinutes)) {
          const result = await postForCharacter(character, actorId, latest, post.intervalMinutes);
          if (result === "posted") outputCount += 1;
          else if (result === "failed") failedCount += 1;
          stampRun(character.id, "post");
        }
        if (reply.enabled && isDue(live.lastReplyAtByCharacter[character.id] ?? live.lastRunAtByCharacter[character.id], reply.intervalMinutes)) {
          const count = await replyForCharacter(character, actorId, latest.notes, reply.intervalMinutes);
          outputCount += count;
          stampRun(character.id, "reply");
        }
        createdCount += outputCount;
      } catch {
        failedCount += 1;
      }
    }
  } finally {
    running = false;
  }
  dispatchUpdated(createdCount, failedCount);
}

function stampRun(characterId: string, kind: "post" | "reply"): void {
  const settings = loadNoteWallTimerSettings();
  const stamp = new Date().toISOString();
  saveNoteWallTimerSettings({
    ...settings,
    lastRunAtByCharacter: { ...settings.lastRunAtByCharacter, [characterId]: stamp },
    ...(kind === "post"
      ? { lastPostAtByCharacter: { ...settings.lastPostAtByCharacter, [characterId]: stamp } }
      : { lastReplyAtByCharacter: { ...settings.lastReplyAtByCharacter, [characterId]: stamp } }),
  });
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
