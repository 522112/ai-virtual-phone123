"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { JournalDoodlePad } from "./journal-doodle-pad";
import type { JournalAnnotation, JournalBlock, JournalBook, JournalPage, JournalStampKind, JournalStroke } from "@/lib/journal-types";
import { JOURNAL_STAMPS } from "@/lib/journal-types";

const STAMP_LABEL: Record<JournalStampKind, string> = {
  heart: "心",
  star: "星",
  flower: "花",
  arrow: "箭",
  underline: "线",
  tape: "贴",
};

const FONT_SIZES = [12, 14, 17] as const;
const FONT_SIZE_LABEL: Record<number, string> = { 12: "小", 14: "中", 17: "大" };

export function JournalStampMark({ stamp }: { stamp: JournalStampKind }) {
  return <span className={`journal-stamp journal-stamp-${stamp}`} aria-hidden="true" />;
}

function isFloated(block: JournalBlock): boolean {
  return typeof block.x === "number" && typeof block.y === "number";
}

function TextWithMarks({
  text,
  notes,
  fontSize,
  onOpen,
}: {
  text: string;
  notes: JournalAnnotation[];
  fontSize: number;
  onOpen: (note: JournalAnnotation) => void;
}) {
  const marks = notes.filter(item => item.quote && text.includes(item.quote));
  if (marks.length === 0) {
    const fallback = notes[0];
    return (
      <p className="journal-page-text" style={{ fontSize: `calc(${fontSize}px * var(--app-text-scale, 1))` }}>
        {fallback ? (
          <button type="button" className="journal-mark" onClick={() => onOpen(fallback)}>
            {text}
          </button>
        ) : text}
      </p>
    );
  }
  const parts: Array<{ text: string; note?: JournalAnnotation }> = [];
  let rest = text;
  for (const note of marks) {
    const quote = note.quote || "";
    const index = rest.indexOf(quote);
    if (index < 0) continue;
    if (index > 0) parts.push({ text: rest.slice(0, index) });
    parts.push({ text: quote, note });
    rest = rest.slice(index + quote.length);
  }
  if (rest) parts.push({ text: rest });
  return (
    <p className="journal-page-text" style={{ fontSize: `calc(${fontSize}px * var(--app-text-scale, 1))` }}>
      {parts.map((part, index) => (
        part.note ? (
          <button
            key={`${part.note.id}-${index}`}
            type="button"
            className="journal-mark"
            onClick={() => onOpen(part.note!)}
          >
            {part.text}
          </button>
        ) : <span key={`t-${index}`}>{part.text}</span>
      ))}
    </p>
  );
}

export function JournalBlockView({
  block,
  editable,
  notes,
  onChange,
  onRemove,
  onOpenNote,
}: {
  block: JournalBlock;
  editable: boolean;
  notes: JournalAnnotation[];
  onChange: (block: JournalBlock) => void;
  onRemove: () => void;
  onOpenNote: (note: JournalAnnotation) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const floated = isFloated(block);
  const fontSize = block.fontSize || 14;
  const scale = block.scale || 1;

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [block.type === "text" ? block.text : "", fontSize]);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || (block.type !== "image" && block.type !== "stamp" && block.type !== "doodle")) return;
    if (block.type === "doodle" && !floated) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const parent = event.currentTarget.closest(".journal-leaf-body");
    const rect = parent?.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: typeof block.x === "number" ? block.x : rect
        ? ((event.currentTarget.getBoundingClientRect().left - rect.left) / rect.width) * 100
        : 8,
      originY: typeof block.y === "number" ? block.y : rect
        ? ((event.currentTarget.getBoundingClientRect().top - rect.top) / rect.height) * 100
        : 8,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const parent = event.currentTarget.closest(".journal-leaf-body");
    const rect = parent?.getBoundingClientRect();
    if (!rect) return;
    const nextX = dragRef.current.originX + ((event.clientX - dragRef.current.startX) / rect.width) * 100;
    const nextY = dragRef.current.originY + ((event.clientY - dragRef.current.startY) / rect.height) * 100;
    onChange({
      ...block,
      x: Math.min(86, Math.max(0, nextX)),
      y: Math.min(86, Math.max(0, nextY)),
    });
  };

  return (
    <div
      className={`journal-block journal-block-${block.type}${block.author === "character" ? " is-char" : ""}${floated ? " is-float" : ""}`}
      style={floated ? {
        left: `${block.x}%`,
        top: `${block.y}%`,
        transform: `scale(${scale})`,
      } : undefined}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => { dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
    >
      {block.type === "text" ? (
        <>
          {editable && block.author === "user" ? (
            <div className="journal-font-row" onPointerDown={event => event.stopPropagation()}>
              {FONT_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  data-active={fontSize === size ? "" : undefined}
                  onClick={() => onChange({ ...block, fontSize: size })}
                >
                  {FONT_SIZE_LABEL[size]}
                </button>
              ))}
            </div>
          ) : null}
          {editable && block.author === "user" ? (
            <textarea
              ref={textRef}
              value={block.text}
              placeholder="写在这一页上"
              rows={2}
              style={{ fontSize: `calc(${fontSize}px * var(--app-text-scale, 1))` }}
              onChange={event => onChange({ ...block, text: event.target.value })}
            />
          ) : (
            <TextWithMarks
              text={block.text || "对方写在这一页"}
              notes={notes}
              fontSize={fontSize}
              onOpen={onOpenNote}
            />
          )}
        </>
      ) : null}
      {block.type === "image" ? (
        <figure>
          <img src={block.src} alt="" />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
          {editable ? (
            <div className="journal-font-row" onPointerDown={event => event.stopPropagation()}>
              {[0.75, 1, 1.25].map(value => (
                <button
                  key={value}
                  type="button"
                  data-active={(block.scale || 1) === value ? "" : undefined}
                  onClick={() => onChange({ ...block, scale: value })}
                >
                  {value === 0.75 ? "小" : value === 1 ? "中" : "大"}
                </button>
              ))}
            </div>
          ) : null}
        </figure>
      ) : null}
      {block.type === "doodle" ? (
        <>
          <JournalDoodlePad
            strokes={block.strokes}
            disabled={!editable}
            onChange={strokes => {
              if (!editable || block.type !== "doodle") return;
              onChange({ ...block, strokes });
            }}
          />
          {editable ? (
            <div className="journal-font-row" onPointerDown={event => event.stopPropagation()}>
              {[0.75, 1, 1.25].map(value => (
                <button
                  key={value}
                  type="button"
                  data-active={(block.scale || 1) === value ? "" : undefined}
                  onClick={() => onChange({ ...block, scale: value, x: block.x ?? 18, y: block.y ?? 28 })}
                >
                  {value === 0.75 ? "小" : value === 1 ? "中" : "大"}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {block.type === "stamp" ? (
        <div className="journal-stamp-row">
          <JournalStampMark stamp={block.stamp} />
          <span>{block.note || STAMP_LABEL[block.stamp]}</span>
        </div>
      ) : null}
      {block.type === "clip" ? (
        <blockquote>
          <small>{block.sourceLabel || "摘录"}</small>
          <p>{block.text}</p>
        </blockquote>
      ) : null}
      {editable ? (
        <button type="button" className="journal-block-remove" onClick={onRemove} aria-label="删除这块">
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

function JournalLeaf({
  page,
  annotations,
  editable,
  onChangeBlock,
  onRemoveBlock,
}: {
  page: JournalPage;
  annotations: JournalAnnotation[];
  editable: boolean;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  const [openNote, setOpenNote] = useState<JournalAnnotation | null>(null);
  return (
    <div className="journal-leaf journal-leaf-single">
      <div className="journal-leaf-body">
        {page.blocks.length === 0 ? <p className="journal-empty">这一页还是空的</p> : page.blocks.map(block => (
          <JournalBlockView
            key={block.id}
            block={block}
            editable={editable}
            notes={annotations.filter(item => item.blockId === block.id || (!item.blockId && (block.type === "text" || block.type === "clip")))}
            onChange={onChangeBlock}
            onRemove={() => onRemoveBlock(block.id)}
            onOpenNote={setOpenNote}
          />
        ))}
        {openNote ? (
          <div className="journal-note-pop" onClick={event => event.stopPropagation()}>
            <p>{openNote.text}</p>
            <button type="button" onClick={() => setOpenNote(null)}>收起</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function JournalOpenBook({
  book,
  page,
  annotations,
  preview,
  onChangeBlock,
  onRemoveBlock,
}: {
  book: JournalBook;
  page: JournalPage;
  annotations: JournalAnnotation[];
  preview?: boolean;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  return (
    <div className={`journal-spread-stage is-single${preview ? " is-preview" : ""}`}>
      <div className="journal-spread is-single">
        <JournalLeaf
          page={page}
          annotations={annotations}
          editable={!preview}
          onChangeBlock={onChangeBlock}
          onRemoveBlock={onRemoveBlock}
        />
      </div>
    </div>
  );
}

export function JournalFlipPreview({
  book,
  pageId,
  annotations,
  onClose,
}: {
  book: JournalBook;
  pageId?: string;
  annotations: JournalAnnotation[];
  onClose: () => void;
}) {
  const start = Math.max(0, book.pages.findIndex(item => item.id === pageId));
  const [index, setIndex] = useState(start < 0 ? 0 : start);
  const page = book.pages[index] || null;
  const pageNotes = useMemo(
    () => (page ? annotations.filter(item => item.pageId === page.id) : []),
    [annotations, page],
  );

  return (
    <div className="journal-flip-overlay" onClick={onClose}>
      <div className="journal-flip-sheet" onClick={event => event.stopPropagation()}>
        <div className="journal-flip-head">
          <span>{page?.title || book.title}</span>
          <button type="button" onClick={onClose}>合上</button>
        </div>
        {page ? (
          <div className="journal-flip-book">
            <JournalOpenBook
              book={book}
              page={page}
              annotations={pageNotes}
              preview
              onChangeBlock={() => undefined}
              onRemoveBlock={() => undefined}
            />
          </div>
        ) : (
          <p className="journal-empty">这一册还是空的</p>
        )}
        {book.pages.length > 0 ? (
          <div className="journal-flip-nav">
            <button type="button" disabled={index <= 0} onClick={() => setIndex(current => Math.max(0, current - 1))}>上一页</button>
            <span>{index + 1} / {book.pages.length}</span>
            <button type="button" disabled={index >= book.pages.length - 1} onClick={() => setIndex(current => Math.min(book.pages.length - 1, current + 1))}>下一页</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function JournalDoodleSheet({
  onApply,
  onClose,
}: {
  onApply: (strokes: JournalStroke[]) => void;
  onClose: () => void;
}) {
  const [strokes, setStrokes] = useState<JournalStroke[]>([]);
  return (
    <div className="journal-sheet-overlay journal-doodle-sheet" onClick={onClose}>
      <div className="journal-doodle-sheet-inner" onClick={event => event.stopPropagation()}>
        <div className="journal-sheet-title">在画布上涂两笔，再贴回这一页</div>
        <div className="journal-doodle-sheet-pad">
          <JournalDoodlePad strokes={strokes} onChange={setStrokes} />
        </div>
        <div className="journal-doodle-sheet-actions">
          <button type="button" className="journal-sheet-cancel" onClick={onClose}>取消</button>
          <button
            type="button"
            className="ui-btn ui-btn-success"
            onClick={() => {
              if (strokes.length === 0) return;
              onApply(strokes);
            }}
          >
            贴上
          </button>
        </div>
      </div>
    </div>
  );
}

export function JournalEditBar({
  book,
  busy,
  onAddText,
  onAddImage,
  onAddDoodle,
  onDrawOnPage,
  onAddStamp,
  onClip,
  onInviteWrite,
  onInviteDoodle,
}: {
  book: JournalBook;
  busy: string;
  onAddText: () => void;
  onAddImage: () => void;
  onAddDoodle: () => void;
  onDrawOnPage: () => void;
  onAddStamp: (stamp: JournalStampKind) => void;
  onClip: () => void;
  onInviteWrite: () => void;
  onInviteDoodle: () => void;
}) {
  return (
    <div className="journal-edit-bar">
      <button type="button" onClick={onAddText}>文字</button>
      <button type="button" onClick={onAddImage}>图片</button>
      <button type="button" onClick={onAddDoodle}>涂鸦</button>
      <button type="button" onClick={onDrawOnPage}>页上画</button>
      {JOURNAL_STAMPS.map(stamp => (
        <button key={stamp} type="button" onClick={() => onAddStamp(stamp)}>{STAMP_LABEL[stamp]}</button>
      ))}
      {book.kind === "couple" && book.characterId ? (
        <>
          <button type="button" onClick={onClip}>摘录</button>
          <button type="button" disabled={Boolean(busy)} onClick={onInviteWrite}>请对方来写</button>
          <button type="button" disabled={Boolean(busy)} onClick={onInviteDoodle}>请对方来画</button>
        </>
      ) : null}
    </div>
  );
}
