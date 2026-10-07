import { useEffect, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { loadChatContacts } from "@/lib/chat-storage";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import {
  deleteGodViewRecord,
  loadGodViewRecords,
  GOD_VIEW_UPDATED_EVENT,
  type GodViewRecord,
} from "@/lib/god-view";

export function GodViewSheet({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<GodViewRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setRecords(loadGodViewRecords());
    const refresh = () => setRecords(loadGodViewRecords());
    window.addEventListener(GOD_VIEW_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(GOD_VIEW_UPDATED_EVENT, refresh);
  }, []);

  const open = records.find(r => r.id === openId) || null;

  return (
    <div className="journal-sheet-overlay" onClick={onClose}>
      <div className="journal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: "82vh", display: "flex", flexDirection: "column" }}>
        <div className="journal-sheet-title">上帝视角（他们不知道你在看）</div>
        {open ? (
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => setOpenId(null)} style={{ border: 0, background: "none", fontSize: 12, cursor: "pointer", textAlign: "left" }}>‹ 返回列表</button>
            <small className="menu-desc">{open.aName} × {open.bName} · {open.topic}</small>
            {open.messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.speaker === "a" ? "flex-start" : "flex-end", maxWidth: "88%", background: m.speaker === "a" ? "var(--c-input)" : "var(--c-accent-soft, #e8f4f0)", borderRadius: 12, padding: "8px 10px", fontSize: 13 }}>
                <strong style={{ display: "block", fontSize: 11, opacity: 0.7 }}>{m.name}</strong>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="journal-clip-list" style={{ overflowY: "auto" }}>
            {records.length === 0 ? <p className="journal-empty">还没有角色之间的聊天</p> : records.map(r => (
              <div key={r.id} className="journal-clip-row">
                <button
                  type="button"
                  style={{ flex: 1, background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}
                  onClick={() => setOpenId(r.id)}
                >
                  <small>{r.aName} × {r.bName}</small>
                  <span>{r.topic}</span>
                </button>
                <button type="button" onClick={() => { deleteGodViewRecord(r.id); setRecords(loadGodViewRecords()); }} style={{ border: 0, background: "none", color: "#e8354b", fontSize: 12, cursor: "pointer" }}>删除</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}

export function RecommendCardModal({ hostCharacterId, onClose }: { hostCharacterId: string; onClose: () => void }) {
  const [contacts] = useState(() => loadChatContacts());
  const [characters] = useState(() => loadCharacters());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState("");

  const candidates = contacts
    .map(c => characters.find(ch => ch.id === c.characterId))
    .filter((c): c is NonNullable<typeof c> => !!c && c.id !== hostCharacterId);

  const recommend = async (guestId: string) => {
    if (busyId) return;
    setBusyId(guestId);
    setResult("");
    try {
      const { recommendCardToCharacter } = await import("@/lib/recommend-card-engine");
      const { loadChatSessions } = await import("@/lib/chat-storage");
      const sessions = loadChatSessions();
      const hostSession = sessions.find(s => s.contactId === hostCharacterId && !s.isGroup);
      if (!hostSession) throw new Error("先打开和 TA 的聊天");
      const res = await recommendCardToCharacter(hostCharacterId, guestId, hostSession.id);
      setResult(res.accepted ? `TA 加了对方：${res.reply}（已进上帝视角）` : `TA 没加：${res.reply}`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "推荐失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="journal-sheet-overlay" onClick={onClose}>
      <div className="journal-sheet" onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-title">推荐好友名片给 TA</div>
        <div className="journal-clip-list">
          {candidates.length === 0 ? <p className="journal-empty">还没有其他联系人</p> : candidates.map(c => (
            <div key={c.id} className="journal-clip-row">
              <button
                type="button"
                style={{ flex: 1, display: "flex", gap: 8, alignItems: "center", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}
                disabled={busyId !== null}
                onClick={() => void recommend(c.id)}
              >
                <span style={{ width: 30, height: 30, borderRadius: 15, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                  {(c.chatAvatar || c.avatar) ? <img src={(c.chatAvatar || c.avatar) as string} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
                </span>
                <span>{c.screenName || c.name}</span>
              </button>
              {busyId === c.id ? <small className="menu-desc">等 TA 决定…</small> : null}
            </div>
          ))}
        </div>
        {result ? <small className="menu-desc">{result}</small> : null}
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
