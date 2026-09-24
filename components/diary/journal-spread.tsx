"use client";

import { useMemo, useState } from "react";
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

export function JournalStampMark({ stamp }: { stamp: JournalStampKind }) {
  return <span className={`journal-stamp journal-stamp-${stamp}`} aria-hidden="true" />;
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
  return (
    <div className={`journal-block journal-block-${block.type}${block.author === "character" ? " is-char" : ""}`}>
      {block.type === "text" ? (
        <textarea
          value={block.text}
          readOnly={!editable}
          placeholder={block.author === "character" ? "对方写在这一页" : "写在这一页上"}
          onChange={event => {
            if (!editable || block.type !== "text") return;
            onChange({ ...block, text: event.target.value });
          }}
        />
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
  label,
  page,
  annotations,
  active,
  editable,
  onActivate,
  onChangeBlock,
  onRemoveBlock,
}: {
  side: JournalSide;
  label: string;
  page: JournalPage;
  annotations: JournalAnnotation[];
  active: boolean;
  editable: boolean;
  onActivate: () => void;
  onChangeBlock: (block: JournalBlock) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  const blocks = blocksOnSide(page, side);
  const notes = annotations.filter(item => !item.side || item.side === side);
  return (
    <div
      className={`journal-leaf journal-leaf-${side}${active ? " is-active" : ""}`}
      onClick={onActivate}
    >
      <div className="journal-leaf-label">{label}</div>
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
          <p key={item.id} className={`journal-annotation${item.authorType === "user" ? " is-user" : ""}`}>
            <b>{item.characterName}</b>
            {item.text}
          </p>
        ))}
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
  const leftLabel = book.kind === "couple" ? "我" : "左页";
  const rightLabel = book.kind === "couple"
    ? (book.characterId ? "对方" : "右页")
    : "右页";
  return (
    <div className={`journal-spread-stage${preview ? " is-preview" : ""}`}>
      <div className="journal-spread">
        <JournalLeaf
          side="left"
          label={leftLabel}
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
          label={rightLabel}
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
  annotations,
  onClose,
}: {
  book: JournalBook;
  annotations: JournalAnnotation[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const page = book.pages[index] || null;
  const canPrev = index > 0;
  const canNext = index < book.pages.length - 1;
  const pageNotes = useMemo(
    () => (page ? annotations.filter(item => item.pageId === page.id) : []),
    [annotations, page],
  );

  const turn = (dir: "next" | "prev") => {
    if (turning) return;
    if (dir === "next" && !canNext) return;
    if (dir === "prev" && !canPrev) return;
    setTurning(dir);
    window.setTimeout(() => {
      setIndex(current => current + (dir === "next" ? 1 : -1));
      setTurning(null);
    }, 420);
  };

  return (
    <div className="journal-flip-overlay" onClick={onClose}>
      <div className="journal-flip-sheet" onClick={event => event.stopPropagation()}>
        <div className="journal-flip-head">
          <span>{book.title}</span>
          <button type="button" onClick={onClose}>合上</button>
        </div>
        {page ? (
          <div className={`journal-flip-book${turning ? ` is-${turning}` : ""}`}>
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
        <div className="journal-flip-nav">
          <button type="button" disabled={!canPrev || Boolean(turning)} onClick={() => turn("prev")}>上一摊</button>
          <span>{book.pages.length === 0 ? "0 / 0" : `${index + 1} / ${book.pages.length}`}</span>
          <button type="button" disabled={!canNext || Boolean(turning)} onClick={() => turn("next")}>下一摊</button>
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
          <button type="button" disabled={Boolean(busy)} onClick={onInviteWrite}>请对方写右页</button>
          <button type="button" disabled={Boolean(busy)} onClick={onInviteDoodle}>请对方涂右页</button>
        </>
      ) : null}
    </div>
  );
}
