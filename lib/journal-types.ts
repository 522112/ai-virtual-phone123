export type JournalBookKind = "personal" | "couple";

export type JournalSide = "left" | "right";

export type JournalStampKind = "heart" | "star" | "flower" | "arrow" | "underline" | "tape";

export type JournalStrokePoint = { x: number; y: number };

export type JournalStroke = {
  points: JournalStrokePoint[];
  color: string;
  width: number;
};

export type JournalBlockAuthor = "user" | "character";

export type JournalDrawingSkill = "poor" | "ok" | "good";

type JournalBlockBase = {
  id: string;
  author: JournalBlockAuthor;
  characterId?: string;
  side: JournalSide;
  fontSize?: number;
  x?: number;
  y?: number;
  scale?: number;
};

export type JournalBlock =
  | (JournalBlockBase & { type: "text"; text: string })
  | (JournalBlockBase & { type: "image"; src: string; caption?: string })
  | (JournalBlockBase & { type: "doodle"; strokes: JournalStroke[] })
  | (JournalBlockBase & { type: "stamp"; stamp: JournalStampKind; note?: string })
  | (JournalBlockBase & { type: "clip"; source: "chat" | "offline" | "memory"; text: string; sourceLabel?: string });

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
  side?: JournalSide;
  blockId?: string;
  authorType: "user" | "character";
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
