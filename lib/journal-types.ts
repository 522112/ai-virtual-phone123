export type JournalBookKind = "personal" | "couple";

export type JournalSide = "left" | "right";

export type JournalStampKind = "heart" | "star" | "flower" | "arrow" | "underline" | "tape";

export type JournalBrushKind = "pen" | "marker" | "pencil" | "highlighter" | "watercolor";

export type JournalFontId = "hand" | "soft" | "serif" | "sans" | "mono";

export type JournalStrokePoint = { x: number; y: number };

export type JournalStroke = {
  points: JournalStrokePoint[];
  color: string;
  width: number;
  brush?: JournalBrushKind;
};

export type JournalBlockAuthor = "user" | "character";

export type JournalDrawingSkill = "poor" | "ok" | "good";

type JournalBlockBase = {
  id: string;
  author: JournalBlockAuthor;
  characterId?: string;
  side: JournalSide;
  fontSize?: number;
  fontFamily?: JournalFontId;
  x?: number;
  y?: number;
  scale?: number;
  boxW?: number;
  boxH?: number;
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
  quote?: string;
  stamp?: JournalStampKind;
  x?: number;
  y?: number;
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

export const JOURNAL_BRUSHES: JournalBrushKind[] = [
  "pen",
  "marker",
  "pencil",
  "highlighter",
  "watercolor",
];

export const JOURNAL_BRUSH_LABEL: Record<JournalBrushKind, string> = {
  pen: "钢笔",
  marker: "马克笔",
  pencil: "铅笔",
  highlighter: "荧光笔",
  watercolor: "水彩",
};

export const JOURNAL_FONTS: Array<{ id: JournalFontId; label: string; css: string }> = [
  { id: "hand", label: "手写", css: '"NoteWall Xiaozhitiao", "NoteWall Ximai", cursive' },
  { id: "soft", label: "软笔", css: '"NoteWall Huiwen", "NoteWall Xiaozhitiao", cursive' },
  { id: "serif", label: "宋体", css: '"Songti SC", "Noto Serif SC", Georgia, serif' },
  { id: "sans", label: "黑体", css: '"PingFang SC", "Noto Sans SC", sans-serif' },
  { id: "mono", label: "打字", css: 'ui-monospace, "Courier New", monospace' },
];

export function journalFontCss(id?: JournalFontId): string | undefined {
  return JOURNAL_FONTS.find(item => item.id === id)?.css;
}
