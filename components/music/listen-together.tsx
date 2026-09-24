"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { resolveUserIdentity, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import { generateListenTogetherReply, type ListenTogetherAction } from "@/lib/listen-together-engine";
import { getMusicControlBridge } from "@/lib/music-control-bridge";
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

export function useActiveListenTogetherSession() {
  const [session, setSession] = useState<ListenTogetherSession | null>(() => getActiveListenTogetherSession());

  useEffect(() => {
    const refresh = () => setSession(getActiveListenTogetherSession());
    window.addEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
  }, []);

  return session?.status === "active" ? session : null;
}

function DuoAvatar({ src, alt, playing }: { src?: string; alt: string; playing: boolean }) {
  return (
    <span className="lt-duo-avatar" data-playing={playing ? "" : undefined}>
      <span className="lt-duo-ring" aria-hidden="true" />
      {src ? <img src={src} alt={alt} /> : <ChatFallbackAvatar alt={alt} />}
    </span>
  );
}

function parseLyricLines(lyrics: string | undefined): { time: number; text: string }[] {
  const raw = (lyrics || "").trim();
  if (!raw) return [];
  const lines: { time: number; text: string }[] = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (match) {
      lines.push({
        time: parseInt(match[1], 10) * 60 + parseFloat(match[2]),
        text: match[3].trim(),
      });
    }
  }
  if (lines.length > 0) {
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }
  return raw.split("\n").map((text, index) => ({ time: index, text: text.trim() })).filter(item => item.text);
}

export function ListenTogetherDuoStage({
  lyrics,
  currentTime,
  playing,
}: {
  track?: ListenTogetherTrack;
  lyrics?: string;
  currentTime: number;
  playing: boolean;
  onOpenLyrics?: () => void;
}) {
  const session = useActiveListenTogetherSession();
  const [tick, setTick] = useState(0);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseLyricLines(lyrics), [lyrics]);
  const activeIdx = useMemo(() => {
    if (parsed.length === 0) return -1;
    if (!parsed.some(item => item.time > 0)) return Math.min(parsed.length - 1, Math.floor(currentTime));
    let idx = 0;
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      if (currentTime >= parsed[i].time) return i;
    }
    return idx;
  }, [parsed, currentTime]);

  useEffect(() => {
    const refresh = () => setTick(n => n + 1);
    window.addEventListener(CHARACTERS_UPDATED_EVENT, refresh);
    window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, refresh);
      window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    const root = lyricsRef.current;
    if (!root || activeIdx < 0) return;
    const el = root.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  if (!session) return null;

  const character = loadCharacters().find(item => item.id === session.characterId) || null;
  const identity = resolveUserIdentity(session.characterId, "chat");
  const userName = identity?.name || "我";

  return (
    <div className="lt-duo" data-avatar-rev={tick} data-playing={playing ? "" : undefined}>
      <div className="lt-duo-faces" data-playing={playing ? "" : undefined}>
        <DuoAvatar src={identity?.avatarUrl} alt={userName} playing={playing} />
        <span className="lt-duo-link" aria-hidden="true">
          <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
            <path d="M5 16V7.5L16 6v8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="3.6" cy="16.2" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="14.6" cy="14.4" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M20.5 8.2c1.6-1.7 4.2-1.5 5.4.4 1 1.6.4 3.6-1.1 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <DuoAvatar src={character?.avatar || undefined} alt={session.characterName} playing={playing} />
      </div>
      <div className="lt-duo-caption">和{session.characterName}一起听</div>
      <div className="lt-duo-lyrics" ref={lyricsRef}>
        {parsed.length === 0 ? (
          <div className="lt-duo-lyric" data-active="">暂无歌词</div>
        ) : parsed.map((line, index) => (
          <div
            key={`${line.time}-${index}`}
            className="lt-duo-lyric"
            {...(index === activeIdx ? { "data-active": "" } : Math.abs(index - activeIdx) === 1 ? { "data-near": "" } : {})}
          >
            {line.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListenTogetherControls({ track, onNotice }: ListenTogetherControlsProps) {
  const [panel, setPanel] = useState<Panel>("closed");
  const [session, setSession] = useState<ListenTogetherSession | null>(() => getActiveListenTogetherSession());
  const [history, setHistory] = useState<ListenTogetherSession[]>(() => loadListenTogetherSessions());
  const [result, setResult] = useState<ListenTogetherSession | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const announcedTrackRef = useRef<string>("");
  const [playerRoot, setPlayerRoot] = useState<Element | null>(null);
  const [avatarTick, setAvatarTick] = useState(0);

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
    const refreshAvatars = () => setAvatarTick(n => n + 1);
    window.addEventListener(CHARACTERS_UPDATED_EVENT, refreshAvatars);
    window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshAvatars);
    return () => {
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, refreshAvatars);
      window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshAvatars);
    };
  }, []);

  const applyActions = useCallback(async (actions: ListenTogetherAction[]) => {
    const bridge = getMusicControlBridge();
    for (const action of actions) {
      if (action.kind === "play") {
        await bridge?.playByQuery(action.query);
      } else if (action.kind === "skip") {
        if (action.action === "prev") bridge?.prev();
        else bridge?.next();
      } else if (action.kind === "end") {
        const active = getActiveListenTogetherSession();
        if (active) {
          const ended = endListenTogetherSession(active.id);
          setResult(ended);
          setPanel("result");
          setSession(null);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    appendListenTogetherTrack(session.id, track);
  }, [session?.id, session?.status, track.id, track.title, track.artist, track.coverUrl]);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    if (!track.id || announcedTrackRef.current === track.id) return;
    const first = !announcedTrackRef.current;
    announcedTrackRef.current = track.id;
    if (first) return;
    let cancelled = false;
    setBusy("正在换歌");
    void generateListenTogetherReply({
      characterId: session.characterId,
      session,
      currentTrack: track,
      lyrics: track.lyrics,
      trackChanged: true,
    }).then(async reply => {
      if (cancelled) return;
      if (reply.text) appendListenTogetherMessage(session.id, { author: "character", text: reply.text });
      await applyActions(reply.actions);
      refresh();
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setBusy("");
    });
    return () => { cancelled = true; };
  }, [applyActions, session?.id, session?.status, track.id]);

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
    announcedTrackRef.current = track.id;
    setBusy("正在接通");
    try {
      const reply = await generateListenTogetherReply({
        characterId: character.id,
        session: next,
        currentTrack: track,
        lyrics: track.lyrics,
        opening: true,
      });
      if (reply.text) appendListenTogetherMessage(next.id, { author: "character", text: reply.text });
      await applyActions(reply.actions);
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
        lyrics: track.lyrics,
      });
      if (reply.text) appendListenTogetherMessage(latest.id, { author: "character", text: reply.text });
      await applyActions(reply.actions);
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
                <div className="lt-messages" ref={listRef} data-avatar-rev={avatarTick}>
                  {session.messages.length === 0 ? <p className="lt-empty">先跟对方说一句</p> : session.messages.map(item => {
                    const character = loadCharacters().find(entry => entry.id === session.characterId) || null;
                    const identity = resolveUserIdentity(session.characterId, "chat");
                    const mine = item.author === "user";
                    const avatar = mine ? identity?.avatarUrl : character?.avatar;
                    const alt = mine ? (identity?.name || "我") : session.characterName;
                    return (
                      <div key={item.id} className={`lt-row${mine ? " is-me" : ""}`}>
                        <span className="lt-row-avatar">
                          {avatar ? <img src={avatar} alt={alt} /> : <ChatFallbackAvatar alt={alt} />}
                        </span>
                        <div className={`lt-bubble${mine ? " is-me" : ""}`}>{item.text}</div>
                      </div>
                    );
                  })}
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
