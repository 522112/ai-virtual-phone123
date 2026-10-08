import { useEffect, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { loadChatSessions, loadScopedContacts } from "@/lib/chat-storage";
import { getActiveSubId } from "./sub-account-sheet";
import { recommendCardToCharacter } from "@/lib/recommend-card-engine";
import { describeFlowError } from "@/lib/chunk-reload";
import { isCharacterInActiveMask } from "@/lib/mask-scope";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { WxContactSelectList } from "./wx-contact-select";
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
  const [contacts] = useState(() => loadScopedContacts(getActiveSubId()));
  const [characters] = useState(() => loadCharacters());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState("");

  const candidates = contacts
    .map(c => characters.find(ch => ch.id === c.characterId))
    .filter((c): c is NonNullable<typeof c> => !!c && c.id !== hostCharacterId)
    .filter(c => isCharacterInActiveMask(c.id, "chat"));

  const recommend = async (guestId: string) => {
    if (busyId) return;
    setBusyId(guestId);
    setResult("");
    try {
      const sessions = loadChatSessions();
      const hostSession = sessions.find(s => s.contactId === hostCharacterId && !s.isGroup);
      if (!hostSession) throw new Error("先打开和 TA 的聊天");
      const res = await recommendCardToCharacter(hostCharacterId, guestId, hostSession.id);
      setResult(res.accepted ? `已发送，双方直接聊上了（点会话里的记录卡围观）` : `TA 没加：${res.reply}`);
      if (res.accepted) window.setTimeout(() => onClose(), 1500);
    } catch (error) {
      const text = describeFlowError(error, "推荐失败");
      if (text) setResult(text);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="wx-pick-dialog" onClick={e => e.stopPropagation()}>
        <div className="wx-pick-nav">
          <button type="button" className="wx-pick-back" onClick={onClose} aria-label="返回">‹</button>
          <span className="wx-pick-title">推荐好友名片给 TA</span>
          <span className="wx-pick-nav-right" />
        </div>
        <WxContactSelectList
          contacts={candidates.map(c => ({ id: c.id, name: c.screenName || c.name, avatar: (c.chatAvatar || c.avatar) as string | null }))}
          onSelect={guestId => void recommend(guestId)}
          disabled={busyId !== null}
          footer={c => (busyId === c.id ? <small className="menu-desc">正在发送…</small> : null)}
        />
        {result ? <div style={{ padding: "8px 16px" }}><small className="menu-desc">{result}</small></div> : null}
      </div>
    </div>
  );
}
