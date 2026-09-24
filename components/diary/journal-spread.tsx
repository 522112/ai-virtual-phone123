"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { JournalDoodlePad } from "./journal-doodle-pad";
import type {
  JournalAnnotation,
  JournalBlock,
  JournalBook,
  JournalFontId,
  JournalPage,
  JournalStampKind,
  JournalStroke,
} from "@/lib/journal-types";
import { JOURNAL_FONTS, JOURNAL_STAMPS, journalFontCss } from "@/lib/journal-types";

const STAMP_LABEL: Record<JournalStampKind, string> = {
  heart: "心",
  star: "星",
  flower: "花",
  arrow: "箭",
  underline: "线",
  tape: "贴",
};

function isFloated(block: JournalBlock): boolean {
  return typeof block.x === "number" && typeof block.y === "number";
}

function TextWithMarks({
  text,
  notes,
  fontSize,
  fontFamily,
  onOpen,
}: {
  text: string;
  notes: JournalAnnotation[];
  fontSize: number;
  fontFamily?: JournalFontId;
  onOpen: (note: JournalAnnotation) => void;
}) {
  const marks = notes.filter(item => item.quote && text.includes(item.quote));
  const style = {
    fontSize: `calc(${fontSize}px * var(--app-text-scale, 1))`,
    fontFamily: journalFontCss(fontFamily),
  };
  if (marks.length === 0) {
    const fallback = notes[0];
    return (
      <p className="journal-page-text" style={style}>
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
    <p className="journal-page-text" style={style}>
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

export function JournalStampMark({ stamp }: { stamp: JournalStampKind }) {
  return <span className={`journal-stamp journal-stamp-${stamp}`} aria-hidden="true" />;
}

export function JournalBlockView({
  block,
  editable,
  selected,
  notes,
  onChange,
  onRemove,
  onOpenNote,
  onSelect,
  onAnnotate,
}: {
  block: JournalBlock;
  editable: boolean;
  selected: boolean;
  notes: JournalAnnotation[];
  onChange: (block: JournalBlock) => void;
  onRemove: () => void;
  onOpenNote: (note: JournalAnnotation) => void;
  onSelect: () => void;
  onAnnotate?: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; originW: number; originH: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const floated = isFloated(block);
  const fontSize = block.fontSize || 14;
  const scale = block.scale || 1;
  const boxW = block.boxW || (floated ? 54 : undefined);
  const boxH = block.boxH;
  const canAnnotate = Boolean(editable && onAnnotate && block.author === "character" && (block.type === "text" || block.type === "clip"));

  useEffect(() => {
    const el = textRef.current;
    if (!el || floated) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [block.type === "text" ? block.text : "", fontSize, floated]);

  const parentRect = (node: HTMLElement) => node.closest(".journal-leaf-body")?.getBoundingClientRect();

  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!editable) return;
    const target = event.target as HTMLElement;
    if (target.closest("textarea, canvas, input, .journal-font-row, .journal-doodle-tools, .journal-resize-handle, .journal-user-note-btn, .journal-block-remove")) return;
    event.stopPropagation();
    const host = event.currentTarget.closest(".journal-block");
    if (host instanceof HTMLElement) host.setPointerCapture(event.pointerId);
    const rect = parentRect(event.currentTarget);
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
    onSelect();
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current) {
      const rect = parentRect(event.currentTarget);
      if (!rect) return;
      const nextW = resizeRef.current.originW + ((event.clientX - resizeRef.current.startX) / rect.width) * 100;
      const nextH = resizeRef.current.originH + ((event.clientY - resizeRef.current.startY) / rect.height) * 100;
      onChange({
        ...block,
        boxW: Math.min(96, Math.max(18, nextW)),
        boxH: Math.min(86, Math.max(12, nextH)),
        x: block.x ?? 8,
        y: block.y ?? 10,
      });
      return;
    }
    if (!dragRef.current) return;
    const rect = parentRect(event.currentTarget);
    if (!rect) return;
    onChange({
      ...block,
      x: Math.min(86, Math.max(0, dragRef.current.originX + ((event.clientX - dragRef.current.startX) / rect.width) * 100)),
      y: Math.min(86, Math.max(0, dragRef.current.originY + ((event.clientY - dragRef.current.startY) / rect.height) * 100)),
    });
  };

  const endGesture = () => {
    dragRef.current = null;
    resizeRef.current = null;
  };

  const textStyle = {
    fontSize: `calc(${fontSize}px * var(--app-text-scale, 1))`,
    fontFamily: journalFontCss(block.fontFamily),
  };

  return (
    <div
      className={`journal-block journal-block-${block.type}${block.author === "character" ? " is-char" : ""}${floated ? " is-float" : ""}${selected ? " is-selected" : ""}`}
      style={floated ? {
        left: `${block.x}%`,
        top: `${block.y}%`,
        width: boxW ? `${boxW}%` : undefined,
        height: boxH ? `${boxH}%` : undefined,
        transform: block.type === "text" || block.type === "clip" ? undefined : `scale(${scale})`,
        fontFamily: journalFontCss(block.fontFamily),
      } : { fontFamily: journalFontCss(block.fontFamily) }}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onClick={onSelect}
    >
      {editable && selected ? (
        <button type="button" className="journal-block-move" aria-label="移动" onPointerDown={beginDrag}>
          移动
        </button>
      ) : null}
      {block.type === "text" ? (
        <>
          {editable && selected ? (
            <div className="journal-font-row" onPointerDown={event => event.stopPropagation()}>
              {JOURNAL_FONTS.map(font => (
                <button
                  key={font.id}
                  type="button"
                  data-active={(block.fontFamily || "hand") === font.id ? "" : undefined}
                  onClick={() => onChange({ ...block, fontFamily: font.id, x: block.x ?? 8, y: block.y ?? 10, boxW: block.boxW ?? 58 })}
                >
                  {font.label}
                </button>
              ))}
              <input
                className="journal-font-slider"
                type="range"
                min="11"
                max="28"
                value={fontSize}
                onChange={event => onChange({ ...block, fontSize: Number(event.target.value) })}
              />
            </div>
          ) : null}
          {editable && block.author === "user" ? (
            <textarea
              ref={textRef}
              value={block.text}
              placeholder="写在这一页上"
              rows={2}
              style={textStyle}
              onChange={event => onChange({ ...block, text: event.target.value })}
              onFocus={onSelect}
            />
          ) : (
            <TextWithMarks
              text={block.text || (block.author === "character" ? "对方写在这一页" : "")}
              notes={notes}
              fontSize={fontSize}
              fontFamily={block.fontFamily}
              onOpen={onOpenNote}
            />
          )}
        </>
      ) : null}
      {block.type === "image" ? (
        <figure>
          <img src={block.src} alt="" />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      ) : null}
      {block.type === "doodle" ? (
        <JournalDoodlePad
          strokes={block.strokes}
          disabled={!editable}
          tools={editable && selected}
          onChange={strokes => {
            if (!editable || block.type !== "doodle") return;
            onChange({ ...block, strokes, x: block.x ?? 12, y: block.y ?? 28, boxW: block.boxW ?? 64, boxH: block.boxH ?? 32 });
          }}
        />
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
          <p style={textStyle}>{block.text}</p>
        </blockquote>
      ) : null}
      {canAnnotate ? (
        <button type="button" className="journal-user-note-btn" onClick={onAnnotate}>
          批注
        </button>
      ) : null}
      {editable && selected && (block.type === "text" || block.type === "doodle" || block.type === "image" || block.type === "clip") ? (
        <span
          className="journal-resize-handle"
          onPointerDown={event => {
            event.stopPropagation();
            const host = event.currentTarget.closest(".journal-block");
            if (host instanceof HTMLElement) host.setPointerCapture(event.pointerId);
            resizeRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              originW: boxW || 54,
              originH: boxH || 24,
            };
            onSelect();
          }}
        />
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
  onAnnotateBlock,
}: {
  page: JournalPage;
  annotations: JournalAnnotation[];
  editable: boolean;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
  onAnnotateBlock?: (block: JournalBlock) => void;
}) {
  const [openNote, setOpenNote] = useState<JournalAnnotation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="journal-leaf journal-leaf-single">
      <div className="journal-leaf-body">
        {page.blocks.length === 0 ? <p className="journal-empty">这一页还是空的</p> : page.blocks.map(block => (
          <JournalBlockView
            key={block.id}
            block={block}
            editable={editable}
            selected={selectedId === block.id}
            notes={annotations.filter(item => item.blockId === block.id || (!item.blockId && (block.type === "text" || block.type === "clip")))}
            onChange={onChangeBlock}
            onRemove={() => onRemoveBlock(block.id)}
            onOpenNote={setOpenNote}
            onSelect={() => setSelectedId(block.id)}
            onAnnotate={onAnnotateBlock ? () => onAnnotateBlock(block) : undefined}
          />
        ))}
        {openNote ? (
          <div className="journal-note-pop" onClick={event => event.stopPropagation()}>
            <b>{openNote.authorType === "user" ? "我的批注" : openNote.characterName}</b>
            {openNote.quote ? <small>「{openNote.quote}」</small> : null}
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
  onAnnotateBlock,
}: {
  book: JournalBook;
  page: JournalPage;
  annotations: JournalAnnotation[];
  preview?: boolean;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
  onAnnotateBlock?: (block: JournalBlock) => void;
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
          onAnnotateBlock={preview ? undefined : onAnnotateBlock}
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
          <JournalDoodlePad strokes={strokes} tools onChange={setStrokes} />
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

export function JournalEditRail({
  book,
  busy,
  open,
  onToggle,
  onAddText,
  onAddImage,
  onAddDoodle,
  onDrawOnPage,
  onAddStamp,
  onClip,
  onInviteWrite,
  onInviteDoodle,
  onAnnotateSelf,
  onAnnotateOther,
  onPrev,
  onNext,
  onNewPage,
  onPreview,
  onShare,
  onDelete,
  canPrev,
  canNext,
}: {
  book: JournalBook;
  busy: string;
  open: boolean;
  onToggle: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddDoodle: () => void;
  onDrawOnPage: () => void;
  onAddStamp: (stamp: JournalStampKind) => void;
  onClip: () => void;
  onInviteWrite: () => void;
  onInviteDoodle: () => void;
  onAnnotateSelf: () => void;
  onAnnotateOther: () => void;
  onPrev: () => void;
  onNext: () => void;
  onNewPage: () => void;
  onPreview: () => void;
  onShare: () => void;
  onDelete: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <>
      <button type="button" className="journal-rail-toggle" data-open={open ? "" : undefined} onClick={onToggle}>
        {open ? "收起" : "工具"}
      </button>
      {open ? <button type="button" className="journal-rail-backdrop" aria-label="收起工具" onClick={onToggle} /> : null}
      {open ? (
        <aside className="journal-rail" onClick={event => event.stopPropagation()}>
          <div className="journal-rail-group">
            <small>写在这一页</small>
            <button type="button" onClick={onAddText}>文字</button>
            <button type="button" onClick={onAddImage}>图片</button>
            <button type="button" onClick={onAddDoodle}>涂鸦</button>
            <button type="button" onClick={onDrawOnPage}>页上画</button>
          </div>
          <div className="journal-rail-group">
            <small>贴纸</small>
            <div className="journal-rail-stamps">
              {JOURNAL_STAMPS.map(stamp => (
                <button key={stamp} type="button" onClick={() => onAddStamp(stamp)}>{STAMP_LABEL[stamp]}</button>
              ))}
            </div>
          </div>
          {book.kind === "couple" && book.characterId ? (
            <div className="journal-rail-group">
              <small>一起做</small>
              <button type="button" onClick={onClip}>摘录</button>
              <button type="button" disabled={Boolean(busy)} onClick={onInviteWrite}>请对方来写</button>
              <button type="button" disabled={Boolean(busy)} onClick={onInviteDoodle}>请对方来画</button>
              <button type="button" onClick={onAnnotateSelf}>批注对方</button>
              <button type="button" disabled={Boolean(busy)} onClick={onAnnotateOther}>请对方批注</button>
            </div>
          ) : (
            <div className="journal-rail-group">
              <small>批注</small>
              <button type="button" onClick={onAnnotateSelf}>我来批注</button>
              <button type="button" disabled={Boolean(busy)} onClick={onAnnotateOther}>请角色批注</button>
            </div>
          )}
          <div className="journal-rail-group">
            <small>这一页</small>
            <button type="button" disabled={!canPrev} onClick={onPrev}>上一页</button>
            <button type="button" disabled={!canNext} onClick={onNext}>下一页</button>
            <button type="button" onClick={onNewPage}>新的一页</button>
            <button type="button" onClick={onPreview}>预览</button>
            <button type="button" onClick={onShare}>分享这一页</button>
            <button type="button" onClick={onDelete}>删除这一页</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
