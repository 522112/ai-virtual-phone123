"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { COUPLE_AVATARS_UPDATED_EVENT, overlayCharacterForDisplay, overlayUserIdentityForDisplay } from "@/lib/couple-avatar-storage";
import { resolveUserIdentity, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import { generateListenTogetherReply, splitListenTogetherBubbles, type ListenTogetherAction } from "@/lib/listen-together-engine";
import { getMusicControlBridge } from "@/lib/music-control-bridge";
import { buildListenTogetherCardHtml, revealListenTogetherOutcome, sendListenTogetherInviteCard, sendListenTogetherRefuse, sendListenTogetherShare } from "@/lib/listen-together-share";
import { useMusicPlayer } from "@/lib/music-context";
import { usePhoneBack } from "@/lib/phone-navigation";
import {
    LISTEN_TOGETHER_UPDATED_EVENT,
    appendListenTogetherMessage,
    appendListenTogetherTrack,
    createListenTogetherInvite,
    deleteListenTogetherMessage,
    endListenTogetherSession,
    formatListenDuration,
    getActiveListenTogetherSession,
    getListenTogetherBg,
    getListenTogetherSession,
    getPendingListenInvite,
    loadListenTogetherSessions,
    setListenTogetherBg,
    startListenTogetherSession,
} from "@/lib/listen-together-storage";
import type { ListenTogetherSession, ListenTogetherTrack } from "@/lib/listen-together-types";
import { parseChatBubbleDisplay, sanitizeListenTogetherText } from "@/lib/chat-message-display";
import { loadRelationshipBindings } from "@/lib/relationship-storage";

type ListenTogetherControlsProps = {
  track: ListenTogetherTrack;
  onNotice?: (message: string) => void;
  onOpenChat?: () => void;
};

type Panel = "closed" | "pick" | "chat" | "history" | "result" | "playlist";

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

export function parseLyricLines(lyrics: string | undefined): { time: number; text: string }[] {
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
    window.addEventListener(COUPLE_AVATARS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, refresh);
      window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
      window.removeEventListener(COUPLE_AVATARS_UPDATED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    const root = lyricsRef.current;
    if (!root || activeIdx < 0) return;
    const el = root.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  const floatBubbles = useMemo(() => {
    if (!session) return [];
    return session.messages.slice(-6).map((m, i) => ({ ...m, floatKey: `${m.id}-${i}` }));
  }, [session?.messages.length, session?.id]);

  if (!session) return null;

  const character = (() => {
    const raw = loadCharacters().find(item => item.id === session.characterId) || null;
    return raw ? overlayCharacterForDisplay(raw) : null;
  })();
  const identity = overlayUserIdentityForDisplay(session.characterId, resolveUserIdentity(session.characterId, "chat"));
  const userName = identity?.name || "我";

  return (
    <div className="lt-duo" data-avatar-rev={tick} data-playing={playing ? "" : undefined}>
      <div className="lt-duo-faces" data-playing={playing ? "" : undefined}>
        <span className="lt-duo-person">
          <DuoAvatar src={identity?.avatarUrl} alt={userName} playing={playing} />
          <em className="lt-duo-name">{userName}</em>
        </span>
        <span className="lt-duo-link" aria-hidden="true">
          <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
            <path d="M5 16V7.5L16 6v8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="3.6" cy="16.2" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="14.6" cy="14.4" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M20.5 8.2c1.6-1.7 4.2-1.5 5.4.4 1 1.6.4 3.6-1.1 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="lt-duo-person">
          <DuoAvatar src={character?.avatar || undefined} alt={session.characterName} playing={playing} />
          <em className="lt-duo-name">{character?.screenName?.trim() || session.characterName}</em>
        </span>
      </div>
      {/* 网易云式飘浮气泡：最近消息+表情弹幕 */}
      <div className="lt-float-layer" aria-hidden="true">
        {floatBubbles.map((m, i) => (
          <div key={m.floatKey} className={`lt-float${m.author === "user" ? " is-me" : ""}`} style={{ bottom: `${34 + i * 34}px`, animationDelay: `${i * 0.15}s` }}>
            {m.kind === "emoji" ? <span className="lt-float-emoji">{m.text}</span> : <span className="lt-float-text">{m.text.slice(0, 24)}</span>}
          </div>
        ))}
      </div>
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

const LT_MODAL_CSS = `
.lt-overlay{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,6,12,0.55);backdrop-filter:blur(8px);z-index:60;animation:ltFade 0.22s ease}
@keyframes ltFade{from{opacity:0}to{opacity:1}}
.lt-sheet{width:100%;max-height:82%;overflow:hidden auto;border-radius:22px 22px 0 0;background:linear-gradient(170deg,#221d2e,#14121a 55%,#191423);border:1px solid rgba(255,255,255,0.1);border-bottom:none;color:#f4efe8;box-shadow:0 -12px 48px rgba(0,0,0,0.6);animation:ltUp 0.28s cubic-bezier(0.2,0.9,0.3,1.1)}
@keyframes ltUp{from{transform:translateY(48px);opacity:0}to{transform:none;opacity:1}}
.lt-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;font-size:15px;font-weight:700}
.lt-head-actions{display:flex;gap:6px}
.lt-head-actions button{background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.1);color:#f4efe8;font-size:12px;padding:5px 11px;border-radius:999px}
.lt-modal-sub{font-size:12px;opacity:0.6;margin:0 0 8px}
.lt-char-card{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:10px 12px;margin-bottom:8px;color:#fff}
.lt-avatar-lg{width:44px;height:44px;font-size:18px}
.lt-avatar-lg img{width:44px;height:44px;border-radius:50%;object-fit:cover}
.lt-char-meta{flex:1;display:flex;flex-direction:column;gap:2px}
.lt-char-meta strong{font-size:14px}
.lt-char-meta em{font-style:normal;font-size:11px;opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.lt-char-go{background:linear-gradient(135deg,#f43f4e,#e8354b);border:none;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px}
.lt-emoji-row{display:flex;gap:4px;margin-bottom:8px}
.lt-emoji{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.08);border-radius:999px;font-size:16px;padding:3px 8px}
.lt-float-layer{position:absolute;left:0;right:0;top:0;bottom:120px;pointer-events:none;overflow:hidden}
.lt-float{position:absolute;left:12%;background:rgba(20,14,28,0.82);border:1px solid rgba(255,255,255,0.14);color:#fff;font-size:12px;padding:5px 12px;border-radius:999px 999px 999px 6px;animation:ltFloat 5s ease forwards;backdrop-filter:blur(6px);max-width:70%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lt-float.is-me{left:auto;right:12%;border-radius:999px 999px 6px 999px;background:rgba(168,85,247,0.35)}
.lt-float-emoji{font-size:22px}
@keyframes ltFloat{0%{opacity:0;transform:translateY(18px) scale(0.9)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-26px)}}
.lt-pl-head{display:flex;gap:12px;align-items:center;padding:4px 16px 10px}
.lt-pl-cover{width:64px;height:64px;border-radius:14px;object-fit:cover;background:linear-gradient(140deg,#3a3348,#23202b)}
.lt-pl-name{font-size:15px;font-weight:700}
.lt-pl-desc{font-size:12px;opacity:0.65;margin-top:2px}
.lt-pl-row{display:flex;align-items:center;gap:10px;padding:8px 16px}
.lt-pl-row img{width:38px;height:38px;border-radius:8px;object-fit:cover}
.lt-pl-row .t{flex:1;min-width:0}
.lt-pl-row .t strong{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lt-pl-row .t span{font-size:11px;opacity:0.6}
.lt-pl-del{background:rgba(255,77,79,0.15);border:none;color:#ff8080;border-radius:8px;padding:4px 9px;font-size:12px}
.lt-pl-edit{display:flex;gap:6px;padding:8px 16px}
.lt-pl-edit input{flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;font-size:13px;padding:8px 10px;min-width:0}
.lt-pl-edit button{background:linear-gradient(135deg,#ff5f8f,#a855f7);border:none;color:#fff;font-size:12px;font-weight:700;border-radius:10px;padding:8px 12px;white-space:nowrap}
`;

function ListenTogetherPlaylistPanel({ session, track, onBack, onNotice, refresh }: {
  session: ListenTogetherSession;
  track: ListenTogetherTrack;
  onBack: () => void;
  onNotice: (m: string) => void;
  refresh: () => void;
}) {
  const [name, setName] = useState(session.playlist?.name || `和${session.characterName}的一起听`);
  const [desc, setDesc] = useState(session.playlist?.description || "");
  const [query, setQuery] = useState("");
  const coverRef = useRef<HTMLInputElement>(null);
  const saveMeta = () => {
    void import("@/lib/listen-together-storage").then(m => {
      m.updateListenTogetherPlaylist(session.id, { name: name.trim() || `和${session.characterName}的一起听`, description: desc }, "user");
      onNotice("歌单已保存，角色看得到");
      refresh();
    });
  };
  const doAdd = () => {
    const parts = query.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (parts.length === 0) return;
    setQuery("");
    const bridge = getMusicControlBridge();
    if (!bridge) { onNotice("播放器还没准备好"); return; }
    void Promise.all(parts.map(q => bridge.resolveByQuery(q).catch(() => null))).then(resolved => {
      const fresh = resolved.filter((t): t is NonNullable<typeof t> => Boolean(t));
      if (fresh.length === 0) { onNotice("没有搜到这些歌"); return; }
      void import("@/lib/listen-together-storage").then(m => {
        const res = m.addManyListenTogetherPlaylistTracks(session.id, fresh.map(t => ({ id: t!.id, title: t!.title, artist: t!.artist || "", coverUrl: t!.coverUrl })));
        onNotice(res.added.length > 0 ? `已批量加入${res.added.length}首` : "这些歌都已在歌单里了");
        refresh();
      });
    });
  };
  const playlist = session.playlist;
  return (
    <div className="lt-pl">
      <div className="lt-pl-head">
        <button type="button" className="lt-emoji" onClick={onBack}>‹</button>
        {playlist?.coverUrl || session.tracks.find(t => t.coverUrl)?.coverUrl ? (
          <img className="lt-pl-cover" src={playlist?.coverUrl || session.tracks.find(t => t.coverUrl)?.coverUrl} alt="" />
        ) : <div className="lt-pl-cover" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lt-pl-name">{playlist?.name || `和${session.characterName}的一起听`}</div>
          <div className="lt-pl-desc">{playlist?.description || `${session.tracks.length} 首 · 持久保存`}{playlist ? ` · ${playlist.updatedBy === "character" ? `${session.characterName}改过` : "你改过"}` : ""}</div>
        </div>
        <button type="button" className="lt-emoji" onClick={() => coverRef.current?.click()} title="换封面">🖼️</button>
        <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              void import("@/lib/listen-together-storage").then(m => {
                m.updateListenTogetherPlaylist(session.id, { coverUrl: reader.result as string }, "user");
                onNotice("封面已保存");
                refresh();
              });
            }
          };
          reader.readAsDataURL(file);
        }} />
      </div>
      <div className="lt-pl-edit">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="歌单名" maxLength={60} />
        <button type="button" onClick={saveMeta}>保存</button>
      </div>
      <div className="lt-pl-edit">
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="写点歌单简介…" maxLength={300} />
        <button type="button" onClick={saveMeta}>保存</button>
      </div>
      <div className="lt-pl-edit">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="批量加歌：逗号分隔，一次加入…" onKeyDown={e => { if (e.key === "Enter") doAdd(); }} />
        <button type="button" onClick={doAdd}>加歌</button>
      </div>
      <div style={{ paddingBottom: 12 }}>
        {session.tracks.length === 0 ? <p className="lt-empty">歌单还空着，加一首开始吧</p> : session.tracks.map((t, i) => (
          <div key={t.id} className="lt-pl-row">
            <span style={{ opacity: 0.5, fontSize: 12, width: 16 }}>{i + 1}</span>
            {t.coverUrl ? <img src={t.coverUrl} alt="" /> : <div className="lt-pl-cover" style={{ width: 38, height: 38, borderRadius: 8 }} />}
            <div className="t"><strong>{t.title}</strong><span>{t.artist || "未知歌手"}</span></div>
            <button type="button" className="lt-pl-del" onClick={() => {
              void import("@/lib/listen-together-storage").then(m => {
                m.removeListenTogetherPlaylistTrack(session.id, t.id);
                onNotice(`已移出「${t.title}」`);
                refresh();
              });
            }}>移除</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListenTogetherControls({ track, onNotice, onOpenChat }: ListenTogetherControlsProps) {
  const player = useMusicPlayer();
  const [panel, setPanel] = useState<Panel>("closed");
  const [session, setSession] = useState<ListenTogetherSession | null>(() => getActiveListenTogetherSession());
  const [history, setHistory] = useState<ListenTogetherSession[]>(() => loadListenTogetherSessions());
  const [result, setResult] = useState<ListenTogetherSession | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [pendingCall, setPendingCall] = useState("");
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const [bgTick, setBgTick] = useState(0);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<number | null>(null);
  // 对方延迟回应定时器：退出音乐页时清理，避免野指针
  const inviteTimers = useRef<number[]>([]);
  useEffect(() => {
    const timers = inviteTimers.current;
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      timers.length = 0;
    };
  }, []);
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

  const appendBubbles = useCallback(async (sessionId: string, author: "user" | "character", text: string) => {
    const current = getListenTogetherSession(sessionId);
    const identity = current ? resolveUserIdentity(current.characterId, "chat") : null;
    const names = [current?.characterName || "", identity?.name || "", "我", "用户"];
    const parts = splitListenTogetherBubbles(text, names);
    for (let index = 0; index < parts.length; index += 1) {
      appendListenTogetherMessage(sessionId, { author, text: parts[index] });
      refresh();
      if (index < parts.length - 1) {
        await new Promise(resolve => window.setTimeout(resolve, 160));
      }
    }
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(LISTEN_TOGETHER_UPDATED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    const refreshAvatars = () => setAvatarTick(n => n + 1);
    window.addEventListener(CHARACTERS_UPDATED_EVENT, refreshAvatars);
    window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshAvatars);
    window.addEventListener(COUPLE_AVATARS_UPDATED_EVENT, refreshAvatars);
    return () => {
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, refreshAvatars);
      window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshAvatars);
      window.removeEventListener(COUPLE_AVATARS_UPDATED_EVENT, refreshAvatars);
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
      } else if (action.kind === "emoji") {
        const active = getActiveListenTogetherSession();
        if (active) appendListenTogetherMessage(active.id, { author: "character", text: action.emoji, kind: "emoji" });
      } else if (action.kind === "playlist_add") {
        // 批量一次解析：并行 resolve，不逐首播放打断当前歌曲
        const active = getActiveListenTogetherSession();
        if (active && bridge) {
          const resolved = await Promise.all(action.queries.map(q => bridge.resolveByQuery(q).catch(() => null)));
          const fresh = resolved.filter((t): t is NonNullable<typeof t> => Boolean(t));
          if (fresh.length > 0) {
            const { addManyListenTogetherPlaylistTracks } = await import("@/lib/listen-together-storage");
            addManyListenTogetherPlaylistTracks(active.id, fresh.map(t => ({ id: t.id, title: t.title, artist: t.artist || "", coverUrl: t.coverUrl })));
            refresh();
          }
        }
      } else if (action.kind === "playlist_remove") {
        const active = getActiveListenTogetherSession();
        if (active) {
          const { removeListenTogetherPlaylistTrack } = await import("@/lib/listen-together-storage");
          const target = active.tracks.find(t => t.title.includes(action.title) || action.title.includes(t.title));
          if (target) removeListenTogetherPlaylistTrack(active.id, target.id);
        }
      } else if (action.kind === "end" || action.kind === "refuse") {
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
      if (reply.text) await appendBubbles(session.id, "character", reply.text);
      await applyActions(reply.actions);
      refresh();
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setBusy("");
    });
    return () => { cancelled = true; };
  }, [applyActions, appendBubbles, session?.id, session?.status, track.id]);

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
    return [...all]
      .sort((a, b) => Number(activeIds.has(b.id)) - Number(activeIds.has(a.id)))
      .map(overlayCharacterForDisplay);
  }, [panel]);

  const notify = (message: string) => onNotice?.(message);

  usePhoneBack(() => {
    if (panel === "closed") return false;
    setPanel("closed");
    return true;
  }, 40);

  const startWith = async (character: Character) => {
    const draftSession: ListenTogetherSession = {
      id: "invite",
      characterId: character.id,
      characterName: character.name,
      startedAt: new Date().toISOString(),
      tracks: track ? [track] : [],
      messages: [],
      status: "active",
    };
    // 防重复邀请：还有没回复的邀请就别再发了（先检查再调 API，不浪费调用）
    const existingPending = getPendingListenInvite(character.id);
    if (existingPending) {
      notify("已经邀请过了，等对方回复，别重复邀请");
      setPanel("closed");
      refresh();
      return;
    }
    // 先把邀请卡发出去：状态 pending，聊天里转起进度条等对方
    const invite = createListenTogetherInvite({
      characterId: character.id,
      characterName: character.name,
      track,
      inviteText: track ? `想和你一起听《${track.title}》` : "想和你一起听",
      direction: "outgoing",
    });
    const sent = sendListenTogetherInviteCard({
      characterId: character.id,
      characterName: character.name,
      direction: "outgoing",
      track,
      text: track ? `想和你一起听《${track.title}》` : "想和你一起听",
      inviteId: invite.id,
    });
    notify("邀请已发出，等对方回应，去聊天看卡片进度");
    setPanel("closed");
    player.openFullPlayer();
    refresh();
    setBusy("对方正在决定");
    try {
      // 发出邀请后直接调用一次 API：按人设+当下日程当场同意或拒绝，只调这一次，不调工具
      const reply = await generateListenTogetherReply({
        characterId: character.id,
        session: draftSession,
        currentTrack: track,
        lyrics: track.lyrics,
        opening: true,
      });
      const refused = reply.actions.some(item => item.kind === "refuse");
      const peerTexts = splitListenTogetherBubbles(reply.text, [character.name, "我", "用户"]);
      if (refused) {
        const timer = window.setTimeout(() => {
          const done = revealListenTogetherOutcome({
            sessionId: sent.sessionId,
            messageId: sent.messageId,
            inviteId: invite.id,
            accept: false,
            peerTexts,
          });
          if (done) {
            notify(`${character.name}暂时来不了：${peerTexts[0] || "现在不方便"}`);
            refresh();
          }
        }, 4000 + Math.random() * 3000);
        inviteTimers.current.push(timer);
        return;
      }
      // 同意：直接开始一起听，无需再回聊天窗口；聊天卡也更新为已接受
      startListenTogetherSession({ characterId: character.id, characterName: character.name, track });
      revealListenTogetherOutcome({
        sessionId: sent.sessionId,
        messageId: sent.messageId,
        inviteId: invite.id,
        accept: true,
        peerTexts,
      });
      notify(`${character.name}和你一起听了`);
      refresh();
      return;
    } catch (error) {
      notify(error instanceof Error ? error.message : "对方还没开口");
    } finally {
      setBusy("");
    }
  };

  const invokeReply = async () => {
    const latest = getActiveListenTogetherSession();
    if (!latest || latest.status !== "active") return;
    if (!pendingCall || latest.id !== pendingCall) return;
    if (busy) return;
    setBusy("正在回复");
    try {
      const reply = await generateListenTogetherReply({
        characterId: latest.characterId,
        session: latest,
        userText: [...latest.messages].reverse().find(item => item.author === "user")?.text,
        currentTrack: track,
        lyrics: track.lyrics,
      });
      if (reply.actions.some(item => item.kind === "refuse")) {
        sendListenTogetherRefuse({
          characterId: latest.characterId,
          characterName: latest.characterName,
          texts: splitListenTogetherBubbles(reply.text),
        });
      } else if (reply.text) {
        await appendBubbles(latest.id, "character", reply.text);
      }
      await applyActions(reply.actions);
      setPendingCall("");
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "这句没有发出去");
    } finally {
      setBusy("");
    }
  };

  const sendDraft = async () => {
    if (!session || session.status !== "active") return;
    const text = draft.trim();
    if (!text) {
      await invokeReply();
      return;
    }
    setDraft("");
    await appendBubbles(session.id, "user", text);
    setPendingCall(session.id);
    setDelTarget(null);
    refresh();
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
        onClick={() => { if (session) onOpenChat?.(); else setPanel("pick"); }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>{session ? "聊天" : "一起听"}</span>
      </button>

      {panel !== "closed" && playerRoot ? createPortal(
        <div className="lt-overlay" onClick={() => setPanel("closed")}>
          <style>{LT_MODAL_CSS}</style>
          <div
            className="lt-sheet"
            onClick={event => event.stopPropagation()}
            data-bg-tick={bgTick}
            style={session && getListenTogetherBg(session.characterId)
              ? { backgroundImage: `url("${getListenTogetherBg(session.characterId)}")`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined}
          >
            <div className="lt-head">
              <span>
                {panel === "pick" ? "邀请好友一起听" : panel === "history" ? "一起听记录" : panel === "result" ? "这一次听完了" : panel === "playlist" ? `歌单 · ${session?.playlist?.name || `和${session?.characterName}的一起听`}` : `和${session?.characterName || "对方"}一起听`}
              </span>
              <div className="lt-head-actions">
                {panel === "chat" && session ? (
                  <>
                    <button type="button" onClick={() => bgInputRef.current?.click()}>背景</button>
                    <input
                      ref={bgInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file || !session) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            setListenTogetherBg(session.characterId, reader.result);
                            setBgTick(n => n + 1);
                            notify("背景已保存");
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </>
                ) : null}
                {panel === "chat" ? (
                  <button type="button" onClick={() => setPanel("playlist")}>歌单</button>
                ) : null}
                {panel === "chat" ? (
                  <button type="button" onClick={() => setPanel("history")}>记录</button>
                ) : null}
                <button type="button" onClick={() => setPanel("closed")}>收起</button>
              </div>
            </div>

            {panel === "pick" ? (
              <div className="lt-list">
                <p className="lt-modal-sub">选一位朋友，和TA实时同频听歌</p>
                {characters.length === 0 ? <p className="lt-empty">还没有可邀请的角色</p> : characters.map(character => (
                  <button key={character.id} type="button" className="lt-char lt-char-card" onClick={() => { void startWith(character); }}>
                    <span className="lt-avatar lt-avatar-lg">
                      {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                    </span>
                    <span className="lt-char-meta"><strong>{character.name}</strong><em>邀请一起听 · {track.title}</em></span>
                    <span className="lt-char-go">邀请</span>
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
                <div className="lt-messages" ref={listRef} data-avatar-rev={avatarTick} onClick={() => { if (delTarget) setDelTarget(null); }}>
                  {session.messages.length === 0 ? <p className="lt-empty">先跟对方说一句</p> : session.messages.map(item => {
                    const raw = loadCharacters().find(entry => entry.id === session.characterId) || null;
                    const character = raw ? overlayCharacterForDisplay(raw) : null;
                    const identity = overlayUserIdentityForDisplay(session.characterId, resolveUserIdentity(session.characterId, "chat"));
                    const mine = item.author === "user";
                    const avatar = mine ? identity?.avatarUrl : character?.avatar;
                    const alt = mine ? (identity?.name || "我") : session.characterName;
                    const names = [session.characterName, identity?.name || "", "我", "用户"];
                    const parsed = parseChatBubbleDisplay(item.text, names);
                    const body = sanitizeListenTogetherText(parsed.body, names);
                    return (
                      <div
                        key={item.id}
                        className={`lt-row${mine ? " is-me" : ""}`}
                        style={{ position: "relative" }}
                        onContextMenu={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDelTarget(item.id);
                        }}
                        onTouchStart={() => {
                          if (pressTimer.current) window.clearTimeout(pressTimer.current);
                          pressTimer.current = window.setTimeout(() => setDelTarget(item.id), 550);
                        }}
                        onTouchEnd={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }}
                        onTouchMove={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }}
                      >
                        <span className="lt-row-avatar">
                          {avatar ? <img src={avatar} alt={alt} /> : <ChatFallbackAvatar alt={alt} />}
                        </span>
                        <div className="lt-msg-col">
                          {parsed.whisper ? <span className="lt-whisper">【私聊】</span> : null}
                          {item.kind === "emoji" ? <div style={{ fontSize: 30, lineHeight: 1.2 }}>{item.text}</div>
                            : body ? <div className={`lt-bubble${mine ? " is-me" : ""}`}>{body}</div> : null}
                        </div>
                        {delTarget === item.id ? (
                          <button
                            type="button"
                            style={{
                              position: "absolute", top: -8, right: 0,
                              background: "#ff4d4f", color: "#fff", border: "none", borderRadius: 6,
                              padding: "4px 12px", fontSize: 12, zIndex: 20,
                            }}
                            onClick={event => {
                              event.stopPropagation();
                              const updated = deleteListenTogetherMessage(session.id, item.id);
                              setDelTarget(null);
                              if (updated) {
                                const last = updated.messages[updated.messages.length - 1];
                                if (!last || last.author !== "user") setPendingCall("");
                              }
                              refresh();
                            }}
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {busy ? <div className="lt-busy">{busy}</div> : null}
                </div>
                <div className="lt-compose">
                  <div className="lt-emoji-row">
                    {["❤️", "😭", "🔥", "🎶", "👏", "🥰"].map(e => (
                      <button key={e} type="button" className="lt-emoji" onClick={() => {
                        if (!session) return;
                        appendListenTogetherMessage(session.id, { author: "user", text: e, kind: "emoji" });
                        setPendingCall(session.id);
                        refresh();
                      }}>{e}</button>
                    ))}
                  </div>
                  <input
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder={pendingCall === session.id ? "再按一次发送，让对方回复" : "给对方发一句"}
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void sendDraft();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy) || (!draft.trim() && pendingCall !== session.id)}
                    onClick={() => { void sendDraft(); }}
                  >
                    {draft.trim() ? "发送" : (pendingCall === session.id ? "调用" : "发送")}
                  </button>
                  <button type="button" className="lt-end" onClick={endSession}>结束</button>
                </div>
              </>
            ) : null}

            {panel === "playlist" && session ? (
              <ListenTogetherPlaylistPanel session={session} track={track} onBack={() => setPanel("chat")} onNotice={notify} refresh={refresh} />
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
