"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";

import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import { JournalEditBar, JournalFlipPreview, JournalOpenBook } from "./journal-spread";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { collectJournalClips } from "@/lib/journal-clips";
import {
  generateJournalAnnotation,
  generateJournalCharacterStamp,
  generateJournalCharacterWrite,
} from "@/lib/journal-engine";
import { sendJournalShareToCharacter } from "@/lib/journal-share";
import {
  addJournalAnnotation,
  createCharacterDoodleStrokes,
  createJournalBlockId,
  createJournalBook,
  createJournalPage,
  deleteJournalBook,
  deleteJournalPage,
  getJournalBook,
  imageFileToJournalDataUrl,
  JOURNAL_UPDATED_EVENT,
  loadJournalAnnotations,
  loadJournalBooks,
  updateJournalBook,
  updateJournalPage,
} from "@/lib/journal-storage";
import type { JournalAnnotation, JournalBlock, JournalBook, JournalBookKind, JournalClipCandidate, JournalPage, JournalSide } from "@/lib/journal-types";
import { JOURNAL_COVER_COLORS } from "@/lib/journal-types";
import { loadRelationshipBindings } from "@/lib/relationship-storage";

type JournalAppProps = {
  onBack: () => void;
  onNotice?: (message: string) => void;
};

type JournalView =
  | { name: "home" }
  | { name: "books"; kind: JournalBookKind }
  | { name: "book"; bookId: string }
  | { name: "page"; bookId: string; pageId: string };

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
  const [annotationCharId, setAnnotationCharId] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<JournalSide>("left");
  const [previewBookId, setPreviewBookId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [clips, setClips] = useState<JournalClipCandidate[]>([]);
  const [clipOpen, setClipOpen] = useState(false);
  const [createCoupleOpen, setCreateCoupleOpen] = useState(false);
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

  useEffect(() => {
    setAnnotationCharId(null);
  }, [view]);

  const notify = (message: string) => onNotice?.(message);
  const currentBook = view.name === "book" || view.name === "page" ? getJournalBook(view.bookId) : null;
  const currentPage = view.name === "page" && currentBook
    ? currentBook.pages.find(page => page.id === view.pageId) || null
    : null;

  const scopedAnnotations = useMemo(() => {
    if (view.name === "page") {
      return annotations.filter(item => item.bookId === view.bookId && item.pageId === view.pageId);
    }
    if (view.name === "book") {
      return annotations.filter(item => item.bookId === view.bookId && !item.pageId);
    }
    return [];
  }, [annotations, view]);
  const annotationChars = useMemo(() => {
    const ids = Array.from(new Set(scopedAnnotations.map(item => item.characterId)));
    return ids.map(id => characters.find(item => item.id === id)).filter(Boolean) as Character[];
  }, [scopedAnnotations, characters]);
  const visibleAnnotations = scopedAnnotations.filter(item => !annotationCharId || item.characterId === annotationCharId);

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

  const handleAnnotate = async (characterId: string) => {
    if (!annotateTarget) return;
    const book = getJournalBook(annotateTarget.bookId);
    if (!book) return;
    const page = annotateTarget.pageId ? book.pages.find(item => item.id === annotateTarget.pageId) : undefined;
    setBusy("批注中");
    try {
      await generateJournalAnnotation({
        characterId,
        book,
        page,
        side: annotateTarget.pageId ? activeSide : undefined,
      });
      setAnnotationCharId(characterId);
      setAnnotateTarget(null);
      refresh();
      notify("批注已经写在页边");
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
    const side = block.side
      || (block.author === "character" ? "right" : (currentBook?.kind === "couple" ? "left" : activeSide));
    addBlock({ ...block, side });
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
                <button type="button" onClick={() => { deleteJournalBook(book.id); refresh(); }}>删除</button>
              </div>
            </div>
          </article>
        ))}
      </main>
    );
  };

  const renderAnnotations = (target: { bookId: string; pageId?: string }) => (
    <div className="journal-annotate">
      <div className="journal-annotate-head">
        <span>{target.pageId ? (activeSide === "left" ? "批左页" : "批右页") : "册边批注"}</span>
        <div className="journal-annotate-switch">
          <button type="button" data-active={!annotationCharId ? "" : undefined} onClick={() => setAnnotationCharId(null)}>全部</button>
          {annotationChars.map(character => (
            <button
              key={character.id}
              type="button"
              data-active={annotationCharId === character.id ? "" : undefined}
              onClick={() => setAnnotationCharId(character.id)}
            >
              {character.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAnnotateTarget(target)}>请角色批注</button>
      </div>
      {target.pageId ? (
        <div className="journal-note-row">
          <input
            className="journal-rename-input"
            value={noteDraft}
            placeholder={activeSide === "left" ? "给左页写一句批注" : "给右页写一句批注"}
            onChange={event => setNoteDraft(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              const text = noteDraft.trim();
              if (!text || !target.pageId) return;
              addJournalAnnotation({
                bookId: target.bookId,
                pageId: target.pageId,
                side: activeSide,
                authorType: "user",
                characterId: "user",
                characterName: "我",
                text,
              });
              setNoteDraft("");
              refresh();
            }}
          >
            写下
          </button>
        </div>
      ) : null}
      {visibleAnnotations.length === 0 ? <p className="journal-empty">还没有批注</p> : visibleAnnotations.map(item => (
        <p key={item.id} className={`journal-annotation${item.authorType === "user" ? " is-user" : ""}`}>
          <b>{item.characterName}{item.side === "left" ? " · 左" : item.side === "right" ? " · 右" : ""}</b>
          {item.text}
        </p>
      ))}
    </div>
  );

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
        <button type="button" onClick={() => setPreviewBookId(book.id)}>翻页预览</button>
      </div>
      {book.pages.length === 0 ? <p className="journal-empty">这一册还是空的</p> : book.pages.map(page => (
        <button key={page.id} type="button" className="journal-page-row" onClick={() => setView({ name: "page", bookId: book.id, pageId: page.id })}>
          <strong>{page.title}</strong>
          <span>{page.dateLabel}</span>
        </button>
      ))}
      {renderAnnotations({ bookId: book.id })}
    </main>
  );

  const renderPage = (book: JournalBook, page: JournalPage) => (
    <main className="journal-editor">
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
        annotations={visibleAnnotations}
        activeSide={activeSide}
        onActivateSide={setActiveSide}
        onChangeBlock={block => {
          updatePageBlocks(page.blocks.map(item => item.id === block.id ? block : item));
        }}
        onRemoveBlock={blockId => updatePageBlocks(page.blocks.filter(item => item.id !== blockId))}
      />
      <JournalEditBar
        book={book}
        busy={busy}
        onAddText={() => addSideBlock({ id: createJournalBlockId(), type: "text", text: "", author: "user", side: activeSide === "right" && book.kind === "personal" ? "right" : "left" })}
        onAddImage={() => imageInputRef.current?.click()}
        onAddDoodle={() => addSideBlock({ id: createJournalBlockId(), type: "doodle", strokes: [], author: "user", side: activeSide === "right" && book.kind === "personal" ? "right" : "left" })}
        onAddStamp={stamp => addSideBlock({ id: createJournalBlockId(), type: "stamp", stamp, author: "user", side: activeSide === "right" && book.kind === "personal" ? "right" : "left" })}
        onClip={async () => {
          if (!book.characterId) return;
          setClipOpen(true);
          setClips(await collectJournalClips(book.characterId));
        }}
        onInviteWrite={async () => {
          if (!book.characterId) return;
          setBusy("对方在写右页");
          try {
            const text = await generateJournalCharacterWrite({ characterId: book.characterId, book, page });
            addSideBlock({
              id: createJournalBlockId(),
              type: "text",
              text,
              author: "character",
              characterId: book.characterId,
              side: "right",
            });
            setActiveSide("right");
            notify("对方写在右页");
          } catch (error) {
            notify(error instanceof Error ? error.message : "对方没有写下来");
          } finally {
            setBusy("");
          }
        }}
        onInviteDoodle={async () => {
          if (!book.characterId) return;
          setBusy("对方在涂右页");
          try {
            const doodle = await generateJournalCharacterStamp({ characterId: book.characterId, book, page });
            updatePageBlocks([
              ...page.blocks,
              {
                id: createJournalBlockId(),
                type: "stamp",
                stamp: doodle.stamp,
                note: doodle.note,
                author: "character",
                characterId: book.characterId,
                side: "right",
              },
              {
                id: createJournalBlockId(),
                type: "doodle",
                strokes: createCharacterDoodleStrokes(doodle.stamp),
                author: "character",
                characterId: book.characterId,
                side: "right",
              },
            ]);
            setActiveSide("right");
            notify("对方涂在右页");
          } catch (error) {
            notify(error instanceof Error ? error.message : "对方没有涂成");
          } finally {
            setBusy("");
          }
        }}
      />
      {renderAnnotations({ bookId: book.id, pageId: page.id })}
      <div className="journal-toolbar">
        <button type="button" onClick={() => setShareTarget({ bookId: book.id, pageId: page.id })}>分享这一摊</button>
        <button type="button" onClick={() => setPreviewBookId(book.id)}>翻页预览</button>
        <button type="button" onClick={() => {
          deleteJournalPage(book.id, page.id);
          refresh();
          setView({ name: "book", bookId: book.id });
        }}>删除这一摊</button>
      </div>
    </main>
  );

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
          <p>{busy || "写下、贴上、再装成册"}</p>
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
          addSideBlock({
            id: createJournalBlockId(),
            type: "image",
            src,
            author: "user",
            side: currentBook?.kind === "couple" ? "left" : activeSide,
          });
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
      {previewBookId && getJournalBook(previewBookId) ? (
        <JournalFlipPreview
          book={getJournalBook(previewBookId)!}
          annotations={annotations}
          onClose={() => setPreviewBookId(null)}
        />
      ) : null}

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
    </section>
  );
}
