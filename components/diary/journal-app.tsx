"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";

import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import { JournalDoodlePad } from "./journal-doodle-pad";
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
import type { JournalAnnotation, JournalBlock, JournalBook, JournalBookKind, JournalClipCandidate, JournalPage, JournalStampKind } from "@/lib/journal-types";
import { JOURNAL_COVER_COLORS, JOURNAL_STAMPS } from "@/lib/journal-types";
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

const STAMP_LABEL: Record<JournalStampKind, string> = {
  heart: "心",
  star: "星",
  flower: "花",
  arrow: "箭",
  underline: "线",
  tape: "贴",
};

function JournalStampMark({ stamp }: { stamp: JournalStampKind }) {
  return <span className={`journal-stamp journal-stamp-${stamp}`} aria-hidden="true" />;
}

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
      await generateJournalAnnotation({ characterId, book, page });
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
        <span>页边批注</span>
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
      {visibleAnnotations.length === 0 ? <p className="journal-empty">还没有批注</p> : visibleAnnotations.map(item => (
        <p key={item.id} className="journal-annotation">
          <b>{item.characterName}</b>
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
      <div className="journal-paper">
        {page.blocks.map(block => (
          <div key={block.id} className={`journal-block journal-block-${block.type}${block.author === "character" ? " is-char" : ""}`}>
            {block.type === "text" ? (
              <textarea
                value={block.text}
                placeholder={block.author === "character" ? "对方写下的一段" : "写在这一页上"}
                onChange={event => {
                  updatePageBlocks(page.blocks.map(item => item.id === block.id && item.type === "text" ? { ...item, text: event.target.value } : item));
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
                disabled={block.author === "character"}
                onChange={strokes => {
                  updatePageBlocks(page.blocks.map(item => item.id === block.id && item.type === "doodle" ? { ...item, strokes } : item));
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
            <button type="button" className="journal-block-remove" onClick={() => updatePageBlocks(page.blocks.filter(item => item.id !== block.id))} aria-label="删除这块">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="journal-edit-bar">
        <button type="button" onClick={() => addBlock({ id: createJournalBlockId(), type: "text", text: "", author: "user" })}>文字</button>
        <button type="button" onClick={() => imageInputRef.current?.click()}>图片</button>
        <button type="button" onClick={() => addBlock({ id: createJournalBlockId(), type: "doodle", strokes: [], author: "user" })}>涂鸦</button>
        {JOURNAL_STAMPS.map(stamp => (
          <button key={stamp} type="button" onClick={() => addBlock({ id: createJournalBlockId(), type: "stamp", stamp, author: "user" })}>
            {STAMP_LABEL[stamp]}
          </button>
        ))}
        {book.kind === "couple" && book.characterId ? (
          <>
            <button type="button" onClick={async () => {
              setClipOpen(true);
              setClips(await collectJournalClips(book.characterId!));
            }}>摘录</button>
            <button type="button" disabled={Boolean(busy)} onClick={async () => {
              setBusy("对方在写");
              try {
                const text = await generateJournalCharacterWrite({ characterId: book.characterId!, book, page });
                addBlock({ id: createJournalBlockId(), type: "text", text, author: "character", characterId: book.characterId });
                notify("对方写了一段");
              } catch (error) {
                notify(error instanceof Error ? error.message : "对方没有写下来");
              } finally {
                setBusy("");
              }
            }}>请对方写</button>
            <button type="button" disabled={Boolean(busy)} onClick={async () => {
              setBusy("对方在涂");
              try {
                const doodle = await generateJournalCharacterStamp({ characterId: book.characterId!, book, page });
                const extra: JournalBlock[] = [
                  {
                    id: createJournalBlockId(),
                    type: "stamp",
                    stamp: doodle.stamp,
                    note: doodle.note,
                    author: "character",
                    characterId: book.characterId,
                  },
                  {
                    id: createJournalBlockId(),
                    type: "doodle",
                    strokes: createCharacterDoodleStrokes(doodle.stamp),
                    author: "character",
                    characterId: book.characterId,
                  },
                ];
                updatePageBlocks([...page.blocks, ...extra]);
                notify("对方留下了一个涂鸦");
              } catch (error) {
                notify(error instanceof Error ? error.message : "对方没有涂成");
              } finally {
                setBusy("");
              }
            }}>请对方涂</button>
          </>
        ) : null}
      </div>
      {renderAnnotations({ bookId: book.id, pageId: page.id })}
      <div className="journal-toolbar">
        <button type="button" onClick={() => setShareTarget({ bookId: book.id, pageId: page.id })}>分享这页</button>
        <button type="button" onClick={() => {
          deleteJournalPage(book.id, page.id);
          refresh();
          setView({ name: "book", bookId: book.id });
        }}>删除这页</button>
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
          addBlock({ id: createJournalBlockId(), type: "image", src, author: "user" });
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
                    addBlock({
                      id: createJournalBlockId(),
                      type: "clip",
                      source: clip.source,
                      text: clip.text,
                      sourceLabel: clip.sourceLabel,
                      author: "user",
                    });
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
