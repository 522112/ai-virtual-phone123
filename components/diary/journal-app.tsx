"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modal";

import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import { JournalDoodleSheet, JournalEditRail, JournalFlipPreview, JournalOpenBook } from "./journal-spread";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { collectJournalClips } from "@/lib/journal-clips";
import {
  generateJournalAnnotation,
  generateJournalCharacterPage,
  type JournalCharacterPageDraft,
} from "@/lib/journal-engine";
import { sendJournalShareToCharacter } from "@/lib/journal-share";
import {
  createCharacterDoodleStrokes,
  createJournalBlockId,
  inferJournalDrawingSkill,
  createJournalBook,
  createJournalPage,
  deleteJournalBook,
  deleteJournalPage,
  getJournalBook,
  isJournalPageFull,
  imageFileToJournalDataUrl,
  JOURNAL_UPDATED_EVENT,
  addJournalAnnotation,
  loadJournalAnnotations,
  loadJournalBooks,
  updateJournalBook,
  updateJournalPage,
} from "@/lib/journal-storage";
import type { JournalAnnotation, JournalBlock, JournalBook, JournalBookKind, JournalClipCandidate, JournalPage } from "@/lib/journal-types";
import { JOURNAL_COVER_COLORS } from "@/lib/journal-types";
import { loadRelationshipBindings } from "@/lib/relationship-storage";
import { usePhoneBack } from "@/lib/phone-navigation";

type JournalAppProps = {
  onBack: () => void;
  onNotice?: (message: string) => void;
};

type JournalView =
  | { name: "home" }
  | { name: "books"; kind: JournalBookKind }
  | { name: "book"; bookId: string }
  | { name: "page"; bookId: string; pageId: string };

type JournalDeleteConfirm =
  | { kind: "book"; bookId: string; title: string }
  | { kind: "page"; bookId: string; pageId: string; title: string }
  | { kind: "block"; bookId: string; pageId: string; blockId: string };

function CharacterPicker({
  characters,
  onPick,
  onClose,
  title,
}: {
  characters: Character[];
  onPick: (characterId: string) => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="journal-sheet-overlay" onClick={onClose}>
      <div className="journal-sheet" onClick={event => event.stopPropagation()}>
        <div className="journal-sheet-title">{title}</div>
        <div className="journal-char-list">
          {characters.length === 0 ? <p className="journal-empty">还没有可选择的角色</p> : characters.map(character => (
            <button key={character.id} type="button" className="journal-char-row" onClick={() => onPick(character.id)}>
              <span className="journal-char-avatar">
                {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
              </span>
              <span>{character.name}</span>
            </button>
          ))}
        </div>
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

export function JournalApp({ onBack, onNotice }: JournalAppProps) {
  const [view, setView] = useState<JournalView>({ name: "home" });
  const [books, setBooks] = useState<JournalBook[]>(() => loadJournalBooks());
  const [annotations, setAnnotations] = useState<JournalAnnotation[]>(() => loadJournalAnnotations());
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());
  const [renameBookId, setRenameBookId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [shareTarget, setShareTarget] = useState<{ bookId: string; pageId?: string } | null>(null);
  const [annotateTarget, setAnnotateTarget] = useState<{ bookId: string; pageId?: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ bookId: string; pageId?: string } | null>(null);
  const [doodleOpen, setDoodleOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [userNote, setUserNote] = useState<{ bookId: string; pageId: string; blockId?: string; quote?: string } | null>(null);
  const [userNoteText, setUserNoteText] = useState("");
  const [userNoteQuote, setUserNoteQuote] = useState("");
  const [busy, setBusy] = useState("");
  const [clips, setClips] = useState<JournalClipCandidate[]>([]);
  const [clipOpen, setClipOpen] = useState(false);
  const [createCoupleOpen, setCreateCoupleOpen] = useState(false);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<JournalDeleteConfirm | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverBookIdRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    setBooks(loadJournalBooks());
    setAnnotations(loadJournalAnnotations());
    setCharacters(loadCharacters());
  }, []);

  useEffect(() => {
    window.addEventListener(JOURNAL_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(JOURNAL_UPDATED_EVENT, refresh);
  }, [refresh]);

  const notify = (message: string) => onNotice?.(message);
  const currentBook = view.name === "book" || view.name === "page" ? getJournalBook(view.bookId) : null;
  const currentPage = view.name === "page" && currentBook
    ? currentBook.pages.find(page => page.id === view.pageId) || null
    : null;

  usePhoneBack(() => {
    if (deleteConfirm) { setDeleteConfirm(null); return true; }
    if (userNote) { setUserNote(null); return true; }
    if (doodleOpen) { setDoodleOpen(false); return true; }
    if (previewTarget) { setPreviewTarget(null); return true; }
    if (shareTarget) { setShareTarget(null); return true; }
    if (annotateTarget) { setAnnotateTarget(null); return true; }
    if (createCoupleOpen) { setCreateCoupleOpen(false); return true; }
    if (railOpen) { setRailOpen(false); return true; }
    if (view.name === "page" && currentBook) {
      setView({ name: "book", bookId: currentBook.id });
      return true;
    }
    if (view.name === "book" && currentBook) {
      setView({ name: "books", kind: currentBook.kind });
      return true;
    }
    if (view.name === "books") {
      setView({ name: "home" });
      return true;
    }
    return false;
  }, 30);

  const pageAnnotations = useMemo(() => {
    if (view.name !== "page") return [];
    return annotations.filter(item => item.bookId === view.bookId && item.pageId === view.pageId);
  }, [annotations, view]);

  const coupleCandidates = useMemo(() => {
    const activeIds = new Set(
      loadRelationshipBindings().filter(item => item.status === "active").map(item => item.characterId),
    );
    const related = characters.filter(item => activeIds.has(item.id));
    return related.length > 0 ? related : characters;
  }, [characters]);

  const updatePageBlocks = (blocks: JournalBlock[]) => {
    if (view.name !== "page") return;
    updateJournalPage(view.bookId, view.pageId, { blocks });
    refresh();
  };

  const handleShare = (characterId: string) => {
    if (!shareTarget) return;
    const book = getJournalBook(shareTarget.bookId);
    if (!book) return;
    const page = shareTarget.pageId ? book.pages.find(item => item.id === shareTarget.pageId) : undefined;
    sendJournalShareToCharacter({ characterId, book, page });
    setShareTarget(null);
    notify(page ? "已把这页手账发给对方" : "已把这册手账发给对方");
  };

  const handleAnnotate = async (characterId: string, target?: { bookId: string; pageId?: string }) => {
    const next = target || annotateTarget;
    if (!next) return;
    const book = getJournalBook(next.bookId);
    if (!book) return;
    if (book.kind === "couple" && book.characterId !== characterId) {
      notify("情侣手账只能由对方批注");
      return;
    }
    const page = next.pageId ? book.pages.find(item => item.id === next.pageId) : undefined;
    setAnnotateTarget(null);
    setBusy("正在生成");
    await new Promise(resolve => window.setTimeout(resolve, 80));
    try {
      await generateJournalAnnotation({
        characterId,
        book,
        page,
        annotations: page ? loadJournalAnnotations().filter(item => item.bookId === book.id && item.pageId === page.id) : undefined,
      });
      refresh();
      notify("对方在有感的句子下划了线");
    } catch (error) {
      notify(error instanceof Error ? error.message : "批注失败");
    } finally {
      setBusy("");
    }
  };

  const addBlock = (block: JournalBlock) => {
    if (!currentPage) return;
    updatePageBlocks([...currentPage.blocks, block]);
  };

  const addSideBlock = (block: JournalBlock) => {
    addBlock({ ...block, side: block.side || "left" });
  };

  const applyCharacterDraft = (book: JournalBook, page: JournalPage, characterId: string, draft: JournalCharacterPageDraft, drew: boolean) => {
    const nextBlocks = [...page.blocks, ...blocksFromCharacterDraft(characterId, draft, page)];
    if (isJournalPageFull(page) && page.blocks.length > 0) {
      const created = createJournalPage(book.id);
      if (created) {
        updateJournalPage(book.id, created.id, { blocks: nextBlocks.filter(block => !page.blocks.some(item => item.id === block.id)) });
        refresh();
        setView({ name: "page", bookId: book.id, pageId: created.id });
        notify(drew ? "这一页满了，对方画在下一页" : "这一页满了，对方写在下一页");
        return;
      }
    }
    updatePageBlocks(nextBlocks);
    notify(drew ? "对方接着画在这一页" : "对方接着写在这一页");
  };

  const blocksFromCharacterDraft = (characterId: string, draft: JournalCharacterPageDraft, page?: JournalPage): JournalBlock[] => {
    const skill = draft.skill || inferJournalDrawingSkill({ id: characterId });
    const userWrote = Boolean(page?.blocks.some(block => block.author === "user" && ((block.type === "text" && block.text.trim()) || block.type === "clip")));
    const written = page?.blocks.find((block): block is Extract<JournalBlock, { type: "text" }> => (
      block.type === "text" && Boolean(block.text.trim())
    ));
    const hint = draft.doodleHint || written?.text || draft.text || "";
    const blocks: JournalBlock[] = [];
    if (draft.text?.trim()) {
      blocks.push({
        id: createJournalBlockId(),
        type: "text",
        text: draft.text.trim(),
        author: "character",
        characterId,
        side: "left",
        fontSize: draft.fontSize,
        fontFamily: "hand",
        x: 10,
        y: userWrote ? 48 : 14,
        boxW: 72,
        boxH: 24,
      });
    }
    if (draft.stamp) {
      blocks.push({
        id: createJournalBlockId(),
        type: "stamp",
        stamp: draft.stamp,
        note: draft.stampNote,
        author: "character",
        characterId,
        side: "left",
        x: draft.stampX ?? 62,
        y: draft.stampY ?? 10,
      });
    }
    if (draft.doodle) {
      blocks.push({
        id: createJournalBlockId(),
        type: "doodle",
        strokes: createCharacterDoodleStrokes(draft.stamp || "heart", {
          skill,
          seed: `${characterId}:${Date.now()}`,
          hint,
        }),
        author: "character",
        characterId,
        side: "left",
        x: 16,
        y: draft.text ? 68 : 36,
        boxW: 62,
        boxH: 28,
        scale: 1,
      });
    }
    return blocks;
  };

  const openUserNote = (book: JournalBook, page: JournalPage, block?: JournalBlock) => {
    const quote = block?.type === "image"
      ? (block.caption?.trim().slice(0, 24) || "这张图")
      : block && (block.type === "text" || block.type === "clip")
        ? block.text.trim().slice(0, 24)
        : "";
    setUserNote({ bookId: book.id, pageId: page.id, blockId: block?.id, quote });
    setUserNoteQuote(quote);
    setUserNoteText("");
  };

  const saveUserNote = () => {
    if (!userNote || !userNoteText.trim()) return;
    addJournalAnnotation({
      bookId: userNote.bookId,
      pageId: userNote.pageId,
      blockId: userNote.blockId,
      authorType: "user",
      characterId: "user",
      characterName: "我",
      text: userNoteText.trim(),
      quote: userNoteQuote.trim() || userNote.quote,
    });
    setUserNote(null);
    setUserNoteText("");
    setUserNoteQuote("");
    refresh();
    notify("批注已写在这一页，对方再来时能看见");
  };

  const renderHome = () => (
    <main className="journal-home">
      <button type="button" className="journal-entry-card" onClick={() => setView({ name: "books", kind: "personal" })}>
        <strong>我的手账</strong>
        <em>自己写的日记册，可以贴图、涂鸦，再装订成册</em>
      </button>
      <button type="button" className="journal-entry-card journal-entry-card-couple" onClick={() => setView({ name: "books", kind: "couple" })}>
        <strong>情侣手账</strong>
        <em>和角色一起写，能从聊天、线下和记忆里摘进来</em>
      </button>
    </main>
  );

  const renderBooks = (kind: JournalBookKind) => {
    const list = books.filter(book => book.kind === kind);
    return (
      <main className="journal-book-list">
        <button
          type="button"
          className="journal-new-book"
          onClick={() => {
            if (kind === "couple") {
              setCreateCoupleOpen(true);
              return;
            }
            const book = createJournalBook({ kind, title: "未命名手账" });
            refresh();
            setView({ name: "book", bookId: book.id });
          }}
        >
          <Plus size={16} />
          {kind === "couple" ? "新建情侣手账" : "新建一册"}
        </button>
        {list.length === 0 ? <p className="journal-empty">还没有手账册</p> : list.map(book => (
          <article key={book.id} className="journal-book-row">
            <button type="button" className="journal-book-cover" style={{ background: book.coverColor }} onClick={() => setView({ name: "book", bookId: book.id })}>
              {book.coverImage ? <img src={book.coverImage} alt="" /> : <span className="journal-book-spine" />}
            </button>
            <div className="journal-book-meta">
              <button type="button" className="journal-book-title" onClick={() => setView({ name: "book", bookId: book.id })}>
                {book.title}
              </button>
              <p>{book.pages.length} 页{book.characterId ? ` · ${characters.find(item => item.id === book.characterId)?.name || ""}` : ""}</p>
              <div className="journal-book-actions">
                <button type="button" onClick={() => { setRenameBookId(book.id); setRenameValue(book.title); }}>重命名</button>
                <button type="button" onClick={() => { coverBookIdRef.current = book.id; coverInputRef.current?.click(); }}>换封面</button>
                <button type="button" onClick={() => setShareTarget({ bookId: book.id })}>分享</button>
                <button type="button" onClick={() => setDeleteConfirm({ kind: "book", bookId: book.id, title: book.title })}>删除</button>
              </div>
            </div>
          </article>
        ))}
      </main>
    );
  };

  const renderBook = (book: JournalBook) => (
    <main className="journal-page-list">
      <div className="journal-book-hero" style={{ background: book.coverColor }}>
        {book.coverImage ? <img src={book.coverImage} alt="" /> : <span className="journal-book-spine" />}
        <div>
          <h2>{book.title}</h2>
          <p>
            {book.kind === "couple" ? "一起写下的册子" : "自己的册子"}
            {book.characterId ? ` · ${characters.find(item => item.id === book.characterId)?.name || ""}` : ""}
            {" · "}
            {book.pages.length} 页
          </p>
        </div>
      </div>
      <div className="journal-toolbar">
        <button type="button" onClick={() => {
          const page = createJournalPage(book.id);
          refresh();
          if (page) setView({ name: "page", bookId: book.id, pageId: page.id });
        }}>新的一页</button>
        <button type="button" onClick={() => { setRenameBookId(book.id); setRenameValue(book.title); }}>重命名</button>
        <button type="button" onClick={() => { coverBookIdRef.current = book.id; coverInputRef.current?.click(); }}>换封面</button>
        <button type="button" onClick={() => setShareTarget({ bookId: book.id })}>分享整册</button>
        <button type="button" onClick={() => setPreviewTarget({ bookId: book.id, pageId: book.pages[0]?.id })}>预览</button>
      </div>
      {book.pages.length === 0 ? <p className="journal-empty">这一册还是空的</p> : book.pages.map(page => (
        <button key={page.id} type="button" className="journal-page-row" onClick={() => setView({ name: "page", bookId: book.id, pageId: page.id })}>
          <strong>{page.title}</strong>
          <span>{page.dateLabel}</span>
        </button>
      ))}
    </main>
  );

  const renderPage = (book: JournalBook, page: JournalPage) => {
    const pageIndex = book.pages.findIndex(item => item.id === page.id);
    const invite = async (mode: "together" | "doodle") => {
      if (!book.characterId) return;
      setBusy("正在生成");
      await new Promise(resolve => window.setTimeout(resolve, 80));
      try {
        const draft = await generateJournalCharacterPage({
          characterId: book.characterId,
          book,
          page,
          mode,
          annotations: pageAnnotations,
        });
        applyCharacterDraft(book, page, book.characterId, draft, mode === "doodle" || Boolean(draft.doodle));
      } catch (error) {
        notify(error instanceof Error ? error.message : (mode === "doodle" ? "对方没有画成" : "对方没有写下来"));
      } finally {
        setBusy("");
      }
    };
    return (
    <main className="journal-editor">
      <div className="journal-editor-canvas">
        <div className="journal-editor-head">
          <input
            className="journal-title-input"
            value={page.title}
            onChange={event => {
              updateJournalPage(book.id, page.id, { title: event.target.value });
              refresh();
            }}
          />
          <span>{page.dateLabel}</span>
        </div>
        <JournalOpenBook
          book={book}
          page={page}
          annotations={pageAnnotations}
          focusBlockId={focusBlockId}
          onFocusConsumed={() => setFocusBlockId(null)}
          onChangeBlock={block => {
            updatePageBlocks(page.blocks.map(item => item.id === block.id ? block : item));
          }}
          onRemoveBlock={blockId => setDeleteConfirm({ kind: "block", bookId: book.id, pageId: page.id, blockId })}
          onAnnotateBlock={block => openUserNote(book, page, block)}
        />
      </div>
      <JournalEditRail
        book={book}
        busy={busy}
        open={railOpen}
        onToggle={() => setRailOpen(current => !current)}
        onAddText={() => {
          const id = createJournalBlockId();
          addSideBlock({
            id,
            type: "text",
            text: "",
            author: "user",
            side: "left",
            fontFamily: "hand",
            fontSize: 14,
            x: 8,
            y: 12,
            boxW: 72,
            boxH: 26,
          });
          setFocusBlockId(id);
          setRailOpen(false);
        }}
        onAddImage={() => {
          setRailOpen(false);
          imageInputRef.current?.click();
        }}
        onAddDoodle={() => {
          setRailOpen(false);
          setDoodleOpen(true);
        }}
        onDrawOnPage={() => {
          const id = createJournalBlockId();
          addSideBlock({
            id,
            type: "doodle",
            strokes: [],
            author: "user",
            side: "left",
            x: 12,
            y: 30,
            boxW: 70,
            boxH: 32,
          });
          setFocusBlockId(id);
          setRailOpen(false);
        }}
        onAddStamp={stamp => {
          addSideBlock({
            id: createJournalBlockId(),
            type: "stamp",
            stamp,
            author: "user",
            side: "left",
            x: 60,
            y: 10,
          });
          setRailOpen(false);
        }}
        onClip={async () => {
          if (!book.characterId) return;
          setRailOpen(false);
          setClipOpen(true);
          setClips(await collectJournalClips(book.characterId));
        }}
        onInviteWrite={() => { void invite("together"); }}
        onInviteDoodle={() => { void invite("doodle"); }}
        onAnnotateSelf={() => {
          setRailOpen(false);
          openUserNote(book, page);
        }}
        onAnnotateOther={() => {
          if (book.kind === "couple") {
            if (!book.characterId) return;
            void handleAnnotate(book.characterId, { bookId: book.id, pageId: page.id });
            return;
          }
          setAnnotateTarget({ bookId: book.id, pageId: page.id });
        }}
        onPrev={() => {
          const prev = book.pages[pageIndex - 1];
          if (prev) setView({ name: "page", bookId: book.id, pageId: prev.id });
        }}
        onNext={() => {
          const next = book.pages[pageIndex + 1];
          if (next) setView({ name: "page", bookId: book.id, pageId: next.id });
        }}
        onNewPage={() => {
          const created = createJournalPage(book.id);
          refresh();
          if (created) setView({ name: "page", bookId: book.id, pageId: created.id });
        }}
        onPreview={() => setPreviewTarget({ bookId: book.id, pageId: page.id })}
        onShare={() => setShareTarget({ bookId: book.id, pageId: page.id })}
        onDelete={() => setDeleteConfirm({ kind: "page", bookId: book.id, pageId: page.id, title: page.title || "这一页" })}
        canPrev={pageIndex > 0}
        canNext={pageIndex >= 0 && pageIndex < book.pages.length - 1}
      />
    </main>
    );
  };

  const title = view.name === "home"
    ? "手账"
    : view.name === "books"
      ? (view.kind === "couple" ? "情侣手账" : "我的手账")
      : currentPage?.title || currentBook?.title || "手账";

  return (
    <section className="diary-app journal-app">
      <header className="diary-app-header">
        <button
          type="button"
          className="diary-icon-btn"
          onClick={() => {
            if (view.name === "page" && currentBook) setView({ name: "book", bookId: currentBook.id });
            else if (view.name === "book" && currentBook) setView({ name: "books", kind: currentBook.kind });
            else if (view.name === "books") setView({ name: "home" });
            else onBack();
          }}
          aria-label="返回"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1>{title}</h1>
          <p>写下、贴上、再装成册</p>
        </div>
        <span className="diary-header-spacer" />
      </header>

      {view.name === "home" && renderHome()}
      {view.name === "books" && renderBooks(view.kind)}
      {view.name === "book" && currentBook && renderBook(currentBook)}
      {view.name === "page" && currentBook && currentPage && renderPage(currentBook, currentPage)}

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const bookId = coverBookIdRef.current || currentBook?.id;
          if (!file || !bookId) return;
          const coverImage = await imageFileToJournalDataUrl(file, 640);
          updateJournalBook(bookId, { coverImage });
          refresh();
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const src = await imageFileToJournalDataUrl(file);
          const id = createJournalBlockId();
          addSideBlock({
            id,
            type: "image",
            src,
            author: "user",
            side: "left",
            x: 16,
            y: 22,
            boxW: 58,
            boxH: 28,
          });
          setFocusBlockId(id);
        }}
      />

      {renameBookId && (
        <div className="journal-sheet-overlay" onClick={() => setRenameBookId(null)}>
          <div className="journal-sheet" onClick={event => event.stopPropagation()}>
            <div className="journal-sheet-title">重命名</div>
            <input className="journal-rename-input" value={renameValue} onChange={event => setRenameValue(event.target.value)} />
            <div className="journal-cover-swatches">
              {JOURNAL_COVER_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className="journal-swatch"
                  style={{ background: color }}
                  onClick={() => {
                    updateJournalBook(renameBookId, { coverColor: color });
                    refresh();
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-success"
              onClick={() => {
                updateJournalBook(renameBookId, { title: renameValue });
                setRenameBookId(null);
                refresh();
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}

      {shareTarget && (
        <CharacterPicker
          title="分享给谁"
          characters={characters}
          onClose={() => setShareTarget(null)}
          onPick={handleShare}
        />
      )}
      {annotateTarget && (
        <CharacterPicker
          title="请谁批注"
          characters={characters}
          onClose={() => setAnnotateTarget(null)}
          onPick={characterId => { void handleAnnotate(characterId); }}
        />
      )}
      {createCoupleOpen && (
        <CharacterPicker
          title="和谁一起写"
          characters={coupleCandidates}
          onClose={() => setCreateCoupleOpen(false)}
          onPick={characterId => {
            const character = characters.find(item => item.id === characterId);
            const book = createJournalBook({
              kind: "couple",
              title: character ? `和${character.name}的手账` : "情侣手账",
              characterId,
            });
            setCreateCoupleOpen(false);
            refresh();
            setView({ name: "book", bookId: book.id });
          }}
        />
      )}
      {previewTarget && getJournalBook(previewTarget.bookId) ? (
        <JournalFlipPreview
          book={getJournalBook(previewTarget.bookId)!}
          pageId={previewTarget.pageId}
          annotations={annotations}
          onClose={() => setPreviewTarget(null)}
        />
      ) : null}

      {doodleOpen ? (
        <JournalDoodleSheet
          onClose={() => setDoodleOpen(false)}
          onApply={strokes => {
            const id = createJournalBlockId();
            addSideBlock({
              id,
              type: "doodle",
              strokes,
              author: "user",
              side: "left",
              x: 14,
              y: 32,
              boxW: 68,
              boxH: 30,
              scale: 1,
            });
            setFocusBlockId(id);
            setDoodleOpen(false);
          }}
        />
      ) : null}

      {busy ? (
        <div className="journal-busy-overlay" aria-live="polite">
          <div className="journal-busy-card">
            <span className="journal-busy-spin" aria-hidden="true" />
            <p>正在生成</p>
          </div>
        </div>
      ) : null}

      {userNote && (
        <div className="journal-sheet-overlay" onClick={() => setUserNote(null)}>
          <div className="journal-sheet" onClick={event => event.stopPropagation()}>
            <div className="journal-sheet-title">写一句批注</div>
            <input
              className="journal-rename-input"
              value={userNoteQuote}
              placeholder="划出对方的那几个字"
              onChange={event => setUserNoteQuote(event.target.value)}
            />
            <textarea
              className="journal-rename-input journal-note-input"
              value={userNoteText}
              placeholder="你的批注，对方再来写时能看见"
              rows={3}
              onChange={event => setUserNoteText(event.target.value)}
            />
            <button type="button" className="ui-btn ui-btn-success" onClick={saveUserNote}>写下</button>
            <button type="button" className="journal-sheet-cancel" onClick={() => setUserNote(null)}>取消</button>
          </div>
        </div>
      )}

      {clipOpen && (
        <div className="journal-sheet-overlay" onClick={() => setClipOpen(false)}>
          <div className="journal-sheet" onClick={event => event.stopPropagation()}>
            <div className="journal-sheet-title">从记忆里摘一段</div>
            <div className="journal-clip-list">
              {clips.length === 0 ? <p className="journal-empty">暂时没有可摘的内容</p> : clips.map(clip => (
                <button
                  key={clip.id}
                  type="button"
                  className="journal-clip-row"
                  onClick={() => {
                    addSideBlock({
                      id: createJournalBlockId(),
                      type: "clip",
                      source: clip.source,
                      text: clip.text,
                      sourceLabel: clip.sourceLabel,
                      author: "user",
                      side: "left",
                      x: 10,
                      y: 16,
                      boxW: 74,
                      boxH: 28,
                    } as JournalBlock);
                    setClipOpen(false);
                  }}
                >
                  <small>{clip.sourceLabel}</small>
                  <span>{clip.text}</span>
                </button>
              ))}
            </div>
            <button type="button" className="journal-sheet-cancel" onClick={() => setClipOpen(false)}>取消</button>
          </div>
        </div>
      )}

      {deleteConfirm ? (
        <ConfirmDialog
          title={
            deleteConfirm.kind === "book"
              ? `删除「${deleteConfirm.title}」？`
              : deleteConfirm.kind === "page"
                ? `删除「${deleteConfirm.title}」？`
                : "删除这块内容？"
          }
          message={
            deleteConfirm.kind === "book"
              ? "这册手账和里面的页都会被删掉。"
              : deleteConfirm.kind === "page"
                ? "这一页上的字、图和涂鸦都会被删掉。"
                : "删掉后不能再改回这一块。"
          }
          icon={AlertCircle}
          variant="danger"
          confirmLabel="删除"
          cancelLabel="取消"
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            if (deleteConfirm.kind === "book") {
              const existing = getJournalBook(deleteConfirm.bookId);
              deleteJournalBook(deleteConfirm.bookId);
              refresh();
              if ((view.name === "book" || view.name === "page") && view.bookId === deleteConfirm.bookId) {
                setView(existing ? { name: "books", kind: existing.kind } : { name: "home" });
              }
            } else if (deleteConfirm.kind === "page") {
              deleteJournalPage(deleteConfirm.bookId, deleteConfirm.pageId);
              refresh();
              setView({ name: "book", bookId: deleteConfirm.bookId });
            } else {
              const book = getJournalBook(deleteConfirm.bookId);
              const page = book?.pages.find(item => item.id === deleteConfirm.pageId);
              if (page) {
                updateJournalPage(deleteConfirm.bookId, deleteConfirm.pageId, {
                  blocks: page.blocks.filter(item => item.id !== deleteConfirm.blockId),
                });
                refresh();
              }
            }
            setDeleteConfirm(null);
          }}
        />
      ) : null}
    </section>
  );
}
