"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { generateListenTogetherReply } from "@/lib/listen-together-engine";
import { buildListenTogetherCardHtml, sendListenTogetherShare } from "@/lib/listen-together-share";
import {
  LISTEN_TOGETHER_UPDATED_EVENT,
  appendListenTogetherMessage,
  appendListenTogetherTrack,
  endListenTogetherSession,
  formatListenDuration,
  getActiveListenTogetherSession,
  loadListenTogetherSessions,
  startListenTogetherSession,
} from "@/lib/listen-together-storage";
import type { ListenTogetherSession, ListenTogetherTrack } from "@/lib/listen-together-types";
import { loadRelationshipBindings } from "@/lib/relationship-storage";

type ListenTogetherControlsProps = {
  track: ListenTogetherTrack;
  onNotice?: (message: string) => void;
};

type Panel = "closed" | "pick" | "chat" | "history" | "result";

export function ListenTogetherControls({ track, onNotice }: ListenTogetherControlsProps) {
  const [panel, setPanel] = useState<Panel>("closed");
  const [session, setSession] = useState<ListenTogetherSession | null>(() => getActiveListenTogetherSession());
  const [history, setHistory] = useState<ListenTogetherSession[]>(() => loadListenTogetherSessions());
  const [result, setResult] = useState<ListenTogetherSession | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [playerRoot, setPlayerRoot] = useState<Element | null>(null);

  useEffect(() => {
    setPlayerRoot(document.querySelector(".music-player"));
  }, []);

  const refresh = useCallback(() => {
    setSession(getActiveListenTogetherSession());
    setHistory(loadListenTogetherSessions());
  }, []);

  useEffect(() => {
    window.addEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    appendListenTogetherTrack(session.id, track);
  }, [session?.id, session?.status, track.id, track.title, track.artist, track.coverUrl]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [session?.messages.length, panel]);

  const characters = useMemo(() => {
    const all = loadCharacters();
    const activeIds = new Set(
      loadRelationshipBindings().filter(item => item.status === "active").map(item => item.characterId),
    );
    return [...all].sort((a, b) => Number(activeIds.has(b.id)) - Number(activeIds.has(a.id)));
  }, [panel]);

  const notify = (message: string) => onNotice?.(message);

  const startWith = async (character: Character) => {
    const next = startListenTogetherSession({
      characterId: character.id,
      characterName: character.name,
      track,
    });
    setSession(next);
    setPanel("chat");
    setBusy("正在接通");
    try {
      const text = await generateListenTogetherReply({
        characterId: character.id,
        session: next,
        currentTrack: track,
        opening: true,
      });
      appendListenTogetherMessage(next.id, { author: "character", text });
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "对方还没开口");
    } finally {
      setBusy("");
    }
  };

  const sendDraft = async () => {
    if (!session || session.status !== "active") return;
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    appendListenTogetherMessage(session.id, { author: "user", text });
    refresh();
    setBusy("正在回复");
    try {
      const latest = getActiveListenTogetherSession();
      if (!latest) return;
      const reply = await generateListenTogetherReply({
        characterId: latest.characterId,
        session: latest,
        userText: text,
        currentTrack: track,
      });
      appendListenTogetherMessage(latest.id, { author: "character", text: reply });
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "这句没有发出去");
    } finally {
      setBusy("");
    }
  };

  const endSession = () => {
    if (!session) return;
    const ended = endListenTogetherSession(session.id);
    refresh();
    setResult(ended);
    setPanel("result");
    setSession(null);
  };

  const sendRecord = (item: ListenTogetherSession) => {
    sendListenTogetherShare({ characterId: item.characterId, session: item });
    notify("已把一起听记录发给对方");
    setPanel("closed");
  };

  return (
    <>
      <button
        type="button"
        className="mp-social-btn"
        data-listen={session ? "" : undefined}
        onClick={() => setPanel(session ? "chat" : "pick")}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M9 18V6l12-2v12" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          <path d="M6 15v-4" />
        </svg>
        <span>{session ? "听着" : "一起听"}</span>
      </button>

      {session && panel === "closed" && playerRoot ? createPortal(
        <button type="button" className="lt-chip" onClick={() => setPanel("chat")}>
          正在和{session.characterName}一起听
        </button>,
        playerRoot,
      ) : null}

      {panel !== "closed" && playerRoot ? createPortal(
        <div className="lt-overlay" onClick={() => setPanel("closed")}>
          <div className="lt-sheet" onClick={event => event.stopPropagation()}>
            <div className="lt-head">
              <span>
                {panel === "pick" ? "邀请谁一起听" : panel === "history" ? "一起听记录" : panel === "result" ? "这一次听完了" : `和${session?.characterName || "对方"}一起听`}
              </span>
              <div className="lt-head-actions">
                {panel === "chat" ? (
                  <button type="button" onClick={() => setPanel("history")}>记录</button>
                ) : null}
                {panel === "pick" || panel === "result" ? (
                  <button type="button" onClick={() => setPanel("history")}>记录</button>
                ) : null}
                <button type="button" onClick={() => setPanel("closed")}>收起</button>
              </div>
            </div>

            {panel === "pick" ? (
              <div className="lt-list">
                {characters.length === 0 ? <p className="lt-empty">还没有可邀请的角色</p> : characters.map(character => (
                  <button key={character.id} type="button" className="lt-char" onClick={() => { void startWith(character); }}>
                    <span className="lt-avatar">
                      {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                    </span>
                    <span>{character.name}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {panel === "chat" && session ? (
              <>
                <div className="lt-now">
                  <strong>{track.title}</strong>
                  <span>{track.artist || "正在听"}</span>
                </div>
                <div className="lt-messages" ref={listRef}>
                  {session.messages.length === 0 ? <p className="lt-empty">先跟对方说一句</p> : session.messages.map(item => (
                    <div key={item.id} className={`lt-bubble${item.author === "user" ? " is-me" : ""}`}>
                      {item.text}
                    </div>
                  ))}
                  {busy ? <div className="lt-busy">{busy}</div> : null}
                </div>
                <div className="lt-compose">
                  <input
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder="给对方发一句"
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void sendDraft();
                      }
                    }}
                  />
                  <button type="button" disabled={Boolean(busy) || !draft.trim()} onClick={() => { void sendDraft(); }}>发送</button>
                  <button type="button" className="lt-end" onClick={endSession}>结束</button>
                </div>
              </>
            ) : null}

            {panel === "history" ? (
              <div className="lt-list">
                {history.filter(item => item.status === "ended").length === 0 ? (
                  <p className="lt-empty">还没有一起听记录</p>
                ) : history.filter(item => item.status === "ended").map(item => (
                  <article key={item.id} className="lt-history">
                    <div>
                      <strong>和{item.characterName}</strong>
                      <span>{formatListenDuration(item)} · {item.tracks.length} 首</span>
                      <p>{item.tracks[0]?.title || "那一次"}</p>
                    </div>
                    <div className="lt-history-actions">
                      <button type="button" onClick={() => { setResult(item); setPanel("result"); }}>查看</button>
                      <button type="button" onClick={() => sendRecord(item)}>发给对方</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {panel === "result" && result ? (
              <div className="lt-result">
                <div
                  className="lt-card"
                  dangerouslySetInnerHTML={{ __html: buildListenTogetherCardHtml(result) }}
                />
                <div className="lt-result-actions">
                  <button type="button" onClick={() => sendRecord(result)}>发给对方</button>
                  <button type="button" onClick={() => setPanel("history")}>历史</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        playerRoot,
      ) : null}
    </>
  );
}
