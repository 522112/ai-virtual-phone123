"use client";

import type {
  NoteWallBoard,
  NoteWallComment,
  NoteWallCommentInput,
  NoteWallNote,
  NoteWallNoteInput,
  NoteWallNotePatch,
  NoteWallStyle,
} from "./notewall-types";
import { deleteNoteWallProjectionEventForComment, deleteNoteWallProjectionEventsForNote } from "./notewall-memory";

type NoteWallListResponse = {
  ok: boolean;
  board?: NoteWallBoard;
  notes?: NoteWallNote[];
  error?: string;
};

type NoteWallMutationResponse = {
  ok: boolean;
  board?: NoteWallBoard;
  note?: NoteWallNote;
  error?: string;
};

type NoteWallCommentsResponse = {
  ok: boolean;
  comments?: NoteWallComment[];
  error?: string;
};

type NoteWallCommentMutationResponse = {
  ok: boolean;
  comment?: NoteWallComment;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(input, {
      ...init,
      credentials: "include",
      signal: controller.signal,
    });
    return await readJson<T>(response);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("请求超时，请检查 Supabase 网络连接。");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchNoteWall(): Promise<{ board: NoteWallBoard; notes: NoteWallNote[] }> {
  const data = await fetchJson<NoteWallListResponse>("/api/notewall/notes", { cache: "no-store" });
  if (!data.board || !data.notes) throw new Error(data.error || "便签墙数据为空");
  return { board: data.board, notes: data.notes };
}

export async function createNoteWallNote(input: NoteWallNoteInput): Promise<NoteWallNote> {
  const data = await fetchJson<NoteWallMutationResponse>("/api/notewall/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!data.note) throw new Error(data.error || "便签创建失败");
  return data.note;
}

export async function updateNoteWallNote(input: NoteWallNotePatch): Promise<NoteWallNote> {
  const data = await fetchJson<NoteWallMutationResponse>("/api/notewall/notes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!data.note) throw new Error(data.error || "便签更新失败");
  return data.note;
}

export async function deleteNoteWallNote(id: string, actorId?: string): Promise<void> {
  await fetchJson<NoteWallMutationResponse>("/api/notewall/notes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, actorId }),
  });
  deleteNoteWallProjectionEventsForNote(id);
}

export async function fetchNoteWallComments(noteId: string): Promise<NoteWallComment[]> {
  const data = await fetchJson<NoteWallCommentsResponse>(
    `/api/notewall/comments?noteId=${encodeURIComponent(noteId)}`,
    { cache: "no-store" },
  );
  return data.comments ?? [];
}

export async function fetchMyNoteWallComments(): Promise<NoteWallComment[]> {
  const data = await fetchJson<NoteWallCommentsResponse>(
    "/api/notewall/comments?mine=1",
    { cache: "no-store" },
  );
  return data.comments ?? [];
}

export async function createNoteWallComment(input: NoteWallCommentInput): Promise<NoteWallComment> {
  const data = await fetchJson<NoteWallCommentMutationResponse>("/api/notewall/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!data.comment) throw new Error(data.error || "评论创建失败");
  return data.comment;
}

export async function deleteNoteWallComment(id: string, actorId?: string): Promise<void> {
  await fetchJson<NoteWallCommentMutationResponse>("/api/notewall/comments", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, actorId }),
  });
  deleteNoteWallProjectionEventForComment(id);
}

type NoteWallStylesResponse = {
  ok: boolean;
  styles?: NoteWallStyle[];
  error?: string;
};

type NoteWallStyleMutationResponse = {
  ok: boolean;
  style?: NoteWallStyle;
  error?: string;
};

export type NoteWallFontAssetInput = {
  id: string;
  name: string;
  note: string;
  url: string;
  format: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchNoteWallFonts(): Promise<NoteWallFontAssetInput[]> {
  const data = await fetchJson<{ ok: boolean; fonts?: NoteWallFontAssetInput[]; error?: string }>(
    "/api/notewall/fonts",
    { cache: "no-store" },
  );
  return (data.fonts ?? []).filter(item => item && typeof item.id === "string" && typeof item.url === "string");
}

export async function createNoteWallFont(form: FormData): Promise<NoteWallFontAssetInput> {
  const data = await fetchJson<{ ok: boolean; font?: NoteWallFontAssetInput; error?: string }>(
    "/api/notewall/fonts",
    { method: "POST", body: form },
  );
  if (!data.font) throw new Error(data.error || "字体上传失败");
  return data.font;
}

export async function deleteNoteWallFont(id: string): Promise<void> {
  await fetchJson<{ ok: boolean; error?: string }>(
    `/api/notewall/fonts?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

const injectedNoteWallFontIds = new Set<string>();

/** 全 App 注入云端字体（去重），便签/评论/写帖都能用 */
export function ensureNoteWallFonts(
  fonts: Array<{ id: string; url: string; format: string }>,
): void {
  if (typeof document === "undefined") return;
  const fresh = fonts.filter(font => font?.id && font?.url && !injectedNoteWallFontIds.has(font.id));
  if (fresh.length === 0) return;
  const css = fresh.map(font => {
    const family = `NoteWallCustom-${font.id}`;
    const format = font.format === "ttf" ? "truetype" : font.format === "otf" ? "opentype" : font.format;
    return `@font-face{font-family:"${family}";src:url("${font.url}") format("${format}");font-display:swap;}`;
  }).join("\n");
  const el = document.createElement("style");
  el.setAttribute("data-notewall-fonts", "1");
  el.textContent = css;
  document.head.appendChild(el);
  for (const font of fresh) injectedNoteWallFontIds.add(font.id);
}

export async function fetchNoteWallStyles(): Promise<NoteWallStyle[]> {
  const data = await fetchJson<NoteWallStylesResponse>("/api/notewall/styles", { cache: "no-store" });
  return data.styles ?? [];
}

export async function createNoteWallStyle(input: { name: string; note?: string; css: string; paper?: string }): Promise<NoteWallStyle> {
  const data = await fetchJson<NoteWallStyleMutationResponse>("/api/notewall/styles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!data.style) throw new Error(data.error || "样式创建失败");
  return data.style;
}

export async function deleteNoteWallStyle(id: string): Promise<void> {
  await fetchJson<NoteWallStyleMutationResponse>(`/api/notewall/styles?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

function getRealtimeConfig(): { url: string; anonKey: string } | null {  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function subscribeNoteWallChanges(onSignal: () => void): () => void {
  const config = getRealtimeConfig();
  if (!config || typeof window === "undefined") return () => {};

  let closed = false;
  let socket: WebSocket | null = null;
  let heartbeat: number | undefined;
  let reconnect: number | undefined;
  let ref = 1;

  const send = (event: string, topic: string, payload: unknown) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ event, topic, payload, ref: String(ref++) }));
  };

  const connect = () => {
    if (closed) return;
    const host = new URL(config.url).host;
    socket = new WebSocket(`wss://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(config.anonKey)}&vsn=1.0.0`);

    socket.addEventListener("open", () => {
      send("phx_join", "realtime:public:note_wall_notes", {
        config: {
          broadcast: { self: false },
          presence: { key: "" },
          postgres_changes: [
            {
              event: "*",
              schema: "public",
              table: "note_wall_notes",
              filter: "board_id=eq.global",
            },
            {
              event: "*",
              schema: "public",
              table: "note_wall_comments",
            },
          ],
        },
      });
      heartbeat = window.setInterval(() => {
        send("heartbeat", "phoenix", {});
      }, 25000);
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload?.event === "postgres_changes") onSignal();
      } catch {
        /* ignore malformed realtime frame */
      }
    });

    socket.addEventListener("close", () => {
      if (heartbeat) window.clearInterval(heartbeat);
      if (!closed) reconnect = window.setTimeout(connect, 5000);
    });
  };

  connect();

  return () => {
    closed = true;
    if (heartbeat) window.clearInterval(heartbeat);
    if (reconnect) window.clearTimeout(reconnect);
    socket?.close();
  };
}
