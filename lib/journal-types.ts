export type JournalBookKind = "personal" | "couple";

export type JournalStampKind = "heart" | "star" | "flower" | "arrow" | "underline" | "tape";

export type JournalStrokePoint = { x: number; y: number };

export type JournalStroke = {
  points: JournalStrokePoint[];
  color: string;
  width: number;
};

export type JournalBlock =
  | { id: string; type: "text"; text: string; author: "user" | "character"; characterId?: string }
  | { id: string; type: "image"; src: string; caption?: string; author: "user" | "character"; characterId?: string }
  | { id: string; type: "doodle"; strokes: JournalStroke[]; author: "user" | "character"; characterId?: string }
  | { id: string; type: "stamp"; stamp: JournalStampKind; note?: string; author: "user" | "character"; characterId?: string }
  | { id: string; type: "clip"; source: "chat" | "offline" | "memory"; text: string; sourceLabel?: string; author: "user" | "character"; characterId?: string };

export type JournalPage = {
  id: string;
  title: string;
  dateLabel: string;
  blocks: JournalBlock[];
  createdAt: string;
  updatedAt: string;
};

export type JournalBook = {
  id: string;
  kind: JournalBookKind;
  title: string;
  coverColor: string;
  coverImage?: string;
  characterId?: string;
  pages: JournalPage[];
  createdAt: string;
  updatedAt: string;
};

export type JournalAnnotation = {
  id: string;
  bookId: string;
  pageId?: string;
  characterId: string;
  characterName: string;
  text: string;
  createdAt: string;
};

export type JournalClipCandidate = {
  id: string;
  source: "chat" | "offline" | "memory";
  sourceLabel: string;
  text: string;
  createdAt: string;
};

export const JOURNAL_COVER_COLORS = [
  "#f4efe6",
  "#efe4d6",
  "#e8eee6",
  "#e7eaf3",
  "#f3e6ea",
  "#ece7f3",
] as const;

export const JOURNAL_STAMPS: JournalStampKind[] = [
  "heart",
  "star",
  "flower",
  "arrow",
  "underline",
  "tape",
];
