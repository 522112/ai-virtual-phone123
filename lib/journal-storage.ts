import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type {
  JournalAnnotation,
  JournalBlock,
  JournalBook,
  JournalBookKind,
  JournalPage,
  JournalStampKind,
  JournalStroke,
} from "./journal-types";
import { JOURNAL_COVER_COLORS, JOURNAL_STAMPS } from "./journal-types";

const BOOKS_KEY = "ai_phone_journal_books_v1";
const ANNOTATIONS_KEY = "ai_phone_journal_annotations_v1";
export const JOURNAL_UPDATED_EVENT = "journal-books-updated";

registerKvMigration(BOOKS_KEY);
registerKvMigration(ANNOTATIONS_KEY);

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function dispatchUpdated(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(JOURNAL_UPDATED_EVENT));
}

function readJson<T>(key: string, fallback: T): T {
  const raw = kvGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  kvSet(key, JSON.stringify(value));
  dispatchUpdated();
}

function isStamp(value: unknown): value is JournalStampKind {
  return typeof value === "string" && JOURNAL_STAMPS.includes(value as JournalStampKind);
}

function normalizeStroke(value: unknown): JournalStroke | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<JournalStroke>;
  if (!Array.isArray(item.points) || typeof item.color !== "string") return null;
  const points = item.points
    .map(point => {
      if (!point || typeof point !== "object") return null;
      const x = Number((point as { x?: unknown }).x);
      const y = Number((point as { y?: unknown }).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    })
    .filter((point): point is { x: number; y: number } => Boolean(point));
  if (points.length < 2) return null;
  const width = Number(item.width);
  return {
    points,
    color: item.color.trim() || "#2b2b31",
    width: Number.isFinite(width) && width > 0 ? width : 2.4,
  };
}

function normalizeBlock(value: unknown): JournalBlock | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<JournalBlock> & { id?: string; type?: string };
  if (typeof item.id !== "string" || !item.type) return null;
  const author = item.author === "character" ? "character" : "user";
  const characterId = typeof item.characterId === "string" ? item.characterId : undefined;
  if (item.type === "text" && typeof item.text === "string") {
    return { id: item.id, type: "text", text: item.text, author, characterId };
  }
  if (item.type === "image" && typeof item.src === "string" && item.src.trim()) {
    return {
      id: item.id,
      type: "image",
      src: item.src,
      caption: typeof item.caption === "string" ? item.caption : undefined,
      author,
      characterId,
    };
  }
  if (item.type === "doodle") {
    const strokes = Array.isArray(item.strokes) ? item.strokes.map(normalizeStroke).filter(Boolean) as JournalStroke[] : [];
    return { id: item.id, type: "doodle", strokes, author, characterId };
  }
  if (item.type === "stamp" && isStamp(item.stamp)) {
    return {
      id: item.id,
      type: "stamp",
      stamp: item.stamp,
      note: typeof item.note === "string" ? item.note : undefined,
      author,
      characterId,
    };
  }
  if (item.type === "clip" && typeof item.text === "string") {
    const source = item.source === "offline" || item.source === "memory" ? item.source : "chat";
    return {
      id: item.id,
      type: "clip",
      source,
      text: item.text,
      sourceLabel: typeof item.sourceLabel === "string" ? item.sourceLabel : undefined,
      author,
      characterId,
    };
  }
  return null;
}

function normalizePage(value: unknown): JournalPage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<JournalPage>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  return {
    id: item.id,
    title: item.title,
    dateLabel: typeof item.dateLabel === "string" ? item.dateLabel : "",
    blocks: Array.isArray(item.blocks) ? item.blocks.map(normalizeBlock).filter(Boolean) as JournalBlock[] : [],
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
  };
}

function normalizeBook(value: unknown): JournalBook | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<JournalBook>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  const kind: JournalBookKind = item.kind === "couple" ? "couple" : "personal";
  const coverColor = typeof item.coverColor === "string" && item.coverColor.trim()
    ? item.coverColor
    : JOURNAL_COVER_COLORS[0];
  return {
    id: item.id,
    kind,
    title: item.title,
    coverColor,
    coverImage: typeof item.coverImage === "string" && item.coverImage.trim() ? item.coverImage : undefined,
    characterId: typeof item.characterId === "string" ? item.characterId : undefined,
    pages: Array.isArray(item.pages) ? item.pages.map(normalizePage).filter(Boolean) as JournalPage[] : [],
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
  };
}

function normalizeAnnotation(value: unknown): JournalAnnotation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<JournalAnnotation>;
  if (typeof item.id !== "string" || typeof item.bookId !== "string") return null;
  if (typeof item.characterId !== "string" || typeof item.text !== "string") return null;
  return {
    id: item.id,
    bookId: item.bookId,
    pageId: typeof item.pageId === "string" ? item.pageId : undefined,
    characterId: item.characterId,
    characterName: typeof item.characterName === "string" ? item.characterName : "对方",
    text: item.text,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
}

export function loadJournalBooks(kind?: JournalBookKind): JournalBook[] {
  const books = readJson<unknown[]>(BOOKS_KEY, []);
  const normalized = Array.isArray(books) ? books.map(normalizeBook).filter(Boolean) as JournalBook[] : [];
  return kind ? normalized.filter(book => book.kind === kind) : normalized;
}

function saveJournalBooks(books: JournalBook[]): void {
  writeJson(BOOKS_KEY, books);
}

export function loadJournalAnnotations(bookId?: string, pageId?: string): JournalAnnotation[] {
  const items = readJson<unknown[]>(ANNOTATIONS_KEY, []);
  const normalized = Array.isArray(items) ? items.map(normalizeAnnotation).filter(Boolean) as JournalAnnotation[] : [];
  return normalized.filter(item => {
    if (bookId && item.bookId !== bookId) return false;
    if (pageId === undefined) return true;
    return item.pageId === pageId;
  });
}

function saveJournalAnnotations(items: JournalAnnotation[]): void {
  writeJson(ANNOTATIONS_KEY, items);
}

export function createJournalBook(input: {
  kind: JournalBookKind;
  title: string;
  characterId?: string;
  coverColor?: string;
}): JournalBook {
  const now = new Date().toISOString();
  const book: JournalBook = {
    id: generateId("jbook"),
    kind: input.kind,
    title: input.title.trim() || (input.kind === "couple" ? "情侣手账" : "我的手账"),
    coverColor: input.coverColor || JOURNAL_COVER_COLORS[loadJournalBooks().length % JOURNAL_COVER_COLORS.length],
    characterId: input.characterId,
    pages: [],
    createdAt: now,
    updatedAt: now,
  };
  saveJournalBooks([book, ...loadJournalBooks()]);
  return book;
}

export function updateJournalBook(bookId: string, patch: Partial<Pick<JournalBook, "title" | "coverColor" | "coverImage" | "pages">>): JournalBook | null {
  const books = loadJournalBooks();
  let updated: JournalBook | null = null;
  const next = books.map(book => {
    if (book.id !== bookId) return book;
    updated = {
      ...book,
      ...patch,
      title: patch.title?.trim() || book.title,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (updated) saveJournalBooks(next);
  return updated;
}

export function deleteJournalBook(bookId: string): void {
  saveJournalBooks(loadJournalBooks().filter(book => book.id !== bookId));
  saveJournalAnnotations(loadJournalAnnotations().filter(item => item.bookId !== bookId));
}

export function getJournalBook(bookId: string): JournalBook | null {
  return loadJournalBooks().find(book => book.id === bookId) || null;
}

export function createJournalPage(bookId: string, title?: string): JournalPage | null {
  const book = getJournalBook(bookId);
  if (!book) return null;
  const now = new Date();
  const page: JournalPage = {
    id: generateId("jpage"),
    title: title?.trim() || `第 ${book.pages.length + 1} 页`,
    dateLabel: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`,
    blocks: [{ id: generateId("jblk"), type: "text", text: "", author: "user" }],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  updateJournalBook(bookId, { pages: [...book.pages, page] });
  return page;
}

export function updateJournalPage(bookId: string, pageId: string, patch: Partial<Pick<JournalPage, "title" | "dateLabel" | "blocks">>): JournalPage | null {
  const book = getJournalBook(bookId);
  if (!book) return null;
  let updated: JournalPage | null = null;
  const pages = book.pages.map(page => {
    if (page.id !== pageId) return page;
    updated = { ...page, ...patch, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;
  updateJournalBook(bookId, { pages });
  return updated;
}

export function deleteJournalPage(bookId: string, pageId: string): void {
  const book = getJournalBook(bookId);
  if (!book) return;
  updateJournalBook(bookId, { pages: book.pages.filter(page => page.id !== pageId) });
  saveJournalAnnotations(loadJournalAnnotations().filter(item => !(item.bookId === bookId && item.pageId === pageId)));
}

export function addJournalAnnotation(input: Omit<JournalAnnotation, "id" | "createdAt">): JournalAnnotation {
  const item: JournalAnnotation = {
    ...input,
    id: generateId("jnote"),
    createdAt: new Date().toISOString(),
  };
  saveJournalAnnotations([item, ...loadJournalAnnotations()]);
  return item;
}

export function createJournalBlockId(): string {
  return generateId("jblk");
}

function strokeFromPoints(points: Array<[number, number]>, color: string, width = 2.1): JournalStroke {
  return {
    color,
    width,
    points: points.map(([x, y]) => ({ x, y })),
  };
}

export function createCharacterDoodleStrokes(stamp: JournalStampKind, color = "#8a5a4a"): JournalStroke[] {
  if (stamp === "heart") {
    return [strokeFromPoints([
      [0.50, 0.72], [0.28, 0.48], [0.24, 0.32], [0.36, 0.22], [0.50, 0.30],
      [0.64, 0.22], [0.76, 0.32], [0.72, 0.48], [0.50, 0.72],
    ], color)];
  }
  if (stamp === "star") {
    return [strokeFromPoints([
      [0.50, 0.16], [0.58, 0.40], [0.82, 0.40], [0.62, 0.56], [0.70, 0.80],
      [0.50, 0.64], [0.30, 0.80], [0.38, 0.56], [0.18, 0.40], [0.42, 0.40], [0.50, 0.16],
    ], color, 1.8)];
  }
  if (stamp === "flower") {
    return [
      strokeFromPoints([[0.50, 0.28], [0.42, 0.18], [0.50, 0.12], [0.58, 0.18], [0.50, 0.28]], color, 1.7),
      strokeFromPoints([[0.50, 0.28], [0.64, 0.24], [0.74, 0.32], [0.64, 0.38], [0.50, 0.28]], color, 1.7),
      strokeFromPoints([[0.50, 0.28], [0.36, 0.24], [0.26, 0.32], [0.36, 0.38], [0.50, 0.28]], color, 1.7),
      strokeFromPoints([[0.50, 0.28], [0.50, 0.78]], color, 1.6),
    ];
  }
  if (stamp === "arrow") {
    return [strokeFromPoints([[0.18, 0.62], [0.72, 0.28], [0.58, 0.28], [0.72, 0.28], [0.72, 0.42]], color, 2)];
  }
  if (stamp === "underline") {
    return [strokeFromPoints([[0.16, 0.62], [0.34, 0.70], [0.58, 0.60], [0.84, 0.68]], color, 2.4)];
  }
  return [
    strokeFromPoints([[0.22, 0.28], [0.78, 0.22], [0.74, 0.70], [0.26, 0.76], [0.22, 0.28]], color, 2.2),
    strokeFromPoints([[0.30, 0.36], [0.70, 0.32]], color, 1.4),
  ];
}

export function formatJournalPagePlainText(page: JournalPage): string {
  const lines = [page.title, page.dateLabel].filter(Boolean);
  for (const block of page.blocks) {
    if (block.type === "text" && block.text.trim()) lines.push(block.text.trim());
    else if (block.type === "image") lines.push(block.caption?.trim() || "[手账图片]");
    else if (block.type === "doodle") lines.push("[手账涂鸦]");
    else if (block.type === "stamp") lines.push(block.note?.trim() || "[手账印章]");
    else if (block.type === "clip" && block.text.trim()) {
      lines.push(`${block.sourceLabel || "摘录"}：${block.text.trim()}`);
    }
  }
  return lines.join("\n");
}

export function formatJournalBookPlainText(book: JournalBook): string {
  const head = [`《${book.title}》`, book.kind === "couple" ? "情侣手账" : "个人手账"];
  const pages = book.pages.map((page, index) => `第${index + 1}页 ${formatJournalPagePlainText(page)}`);
  return [...head, ...pages].join("\n\n");
}

export async function imageFileToJournalDataUrl(file: File, maxSize = 720): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
  if (typeof document === "undefined") return source;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = source;
  });
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}
