"use client";

import { useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { JournalDoodlePad } from "./journal-doodle-pad";
import type { JournalAnnotation, JournalBlock, JournalBook, JournalPage, JournalSide, JournalStampKind } from "@/lib/journal-types";
import { JOURNAL_STAMPS } from "@/lib/journal-types";
import { blocksOnSide } from "@/lib/journal-storage";

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

export function JournalBlockView({
  block,
  editable,
  onChange,
  onRemove,
}: {
  block: JournalBlock;
  editable: boolean;
  onChange: (block: JournalBlock) => void;
  onRemove: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const floated = isFloated(block);
  const fontSize = block.fontSize || 14;
  const scale = block.scale || 1;

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || (block.type !== "image" && block.type !== "stamp")) return;
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

  const endDrag = () => {
    dragRef.current = null;
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
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {block.type === "text" ? (
        <>
          {editable ? (
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
          <textarea
            value={block.text}
            readOnly={!editable}
            placeholder={block.author === "character" ? "对方写在这一页" : "写在这一页上"}
            style={{ fontSize: `calc(${fontSize}px * var(--app-text-scale, 1))` }}
            onChange={event => {
              if (!editable || block.type !== "text") return;
              onChange({ ...block, text: event.target.value });
            }}
          />
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
        <JournalDoodlePad
          strokes={block.strokes}
          disabled={!editable}
          onChange={strokes => {
            if (!editable || block.type !== "doodle") return;
            onChange({ ...block, strokes });
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
  side,
  page,
  annotations,
  active,
  editable,
  onActivate,
  onChangeBlock,
  onRemoveBlock,
}: {
  side: JournalSide;
  page: JournalPage;
  annotations: JournalAnnotation[];
  active: boolean;
  editable: boolean;
  onActivate: () => void;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const blocks = blocksOnSide(page, side);
  const notes = annotations.filter(item => !item.side || item.side === side);
  const openNote = notes.find(item => item.id === openNoteId) || null;
  return (
    <div
      className={`journal-leaf journal-leaf-${side}${active ? " is-active" : ""}`}
      onClick={onActivate}
    >
      <div className="journal-leaf-body">
        {blocks.length === 0 ? <p className="journal-empty">这一页还是空的</p> : blocks.map(block => (
          <JournalBlockView
            key={block.id}
            block={block}
            editable={editable}
            onChange={onChangeBlock}
            onRemove={() => onRemoveBlock(block.id)}
          />
        ))}
        {notes.map(item => (
          <button
            key={item.id}
            type="button"
            className={`journal-note-sticker${openNoteId === item.id ? " is-open" : ""}`}
            style={{ left: `${item.x ?? (side === "right" ? 64 : 18)}%`, top: `${item.y ?? 16}%` }}
            onClick={event => {
              event.stopPropagation();
              setOpenNoteId(current => current === item.id ? null : item.id);
            }}
            aria-label="查看批注"
          >
            <JournalStampMark stamp={item.stamp || "heart"} />
          </button>
        ))}
        {openNote ? (
          <div className="journal-note-pop" onClick={event => event.stopPropagation()}>
            <p>{openNote.text}</p>
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
  activeSide,
  preview,
  onActivateSide,
  onChangeBlock,
  onRemoveBlock,
}: {
  book: JournalBook;
  page: JournalPage;
  annotations: JournalAnnotation[];
  activeSide: JournalSide;
  preview?: boolean;
  onActivateSide: (side: JournalSide) => void;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  return (
    <div className={`journal-spread-stage${preview ? " is-preview" : ""}`}>
      <div className="journal-spread">
        <JournalLeaf
          side="left"
          page={page}
          annotations={annotations}
          active={!preview && activeSide === "left"}
          editable={!preview}
          onActivate={() => onActivateSide("left")}
          onChangeBlock={onChangeBlock}
          onRemoveBlock={onRemoveBlock}
        />
        <span className="journal-spread-gutter" aria-hidden="true" />
        <JournalLeaf
          side="right"
          page={page}
          annotations={annotations}
          active={!preview && activeSide === "right"}
          editable={!preview && book.kind === "personal"}
          onActivate={() => onActivateSide("right")}
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
  const page = useMemo(() => {
    if (pageId) return book.pages.find(item => item.id === pageId) || book.pages[0] || null;
    return book.pages[0] || null;
  }, [book.pages, pageId]);
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
              activeSide="left"
              preview
              onActivateSide={() => undefined}
              onChangeBlock={() => undefined}
              onRemoveBlock={() => undefined}
            />
          </div>
        ) : (
          <p className="journal-empty">这一册还是空的</p>
        )}
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
