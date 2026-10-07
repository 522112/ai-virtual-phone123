"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { loadCharacters } from "@/lib/character-storage";
import { loadChatSessions, saveChatSessions } from "@/lib/chat-storage";
import {
  CONTACT_REMARKS_UPDATED_EVENT,
  getCharacterRecentMoments,
  getCharacterRemark,
  notifyCharacterOfUserRemarkChange,
} from "@/lib/contact-remarks";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { overlayCharacterForDisplay } from "@/lib/couple-avatar-storage";
import {
  createCharacterSubAccount,
  deleteCharacterSubAccount,
  loadCharacterSubAccounts,
  type CharacterSubAccount,
} from "@/lib/sub-accounts";
import type { Character } from "@/lib/character-types";

const L = {
  title: "名片",
  nickname: "昵称",
  remark: "备注",
  theirRemark: "对方给我的备注",
  recentMoments: "近7天动态",
  noMoments: "暂无动态",
  save: "保存",
  close: "关闭",
  remarkPh: "输入备注",
  daysAgo: "天前",
  hoursAgo: "小时前",
  justNow: "刚才",
  noRemark: "暂无",
};

function formatMomentTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}${L.daysAgo}`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}${L.hoursAgo}`;
  return L.justNow;
}

type Props = {
  characterId: string;
  sessionId?: string;
  onClose: () => void;
  onOpenHomepage?: (characterId: string) => void;
};

export function CharacterBusinessCard({ characterId, sessionId, onClose, onOpenHomepage }: Props) {
  const [character, setCharacter] = useState<Character | null>(() => loadCharacters().find(c => c.id === characterId) || null);
  const [alias, setAlias] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [theirRemark, setTheirRemark] = useState(() => getCharacterRemark(characterId));
  const [moments, setMoments] = useState(() => getCharacterRecentMoments(characterId));
  const [notice, setNotice] = useState("");
  const [charSubs, setCharSubs] = useState<CharacterSubAccount[]>(() => loadCharacterSubAccounts(characterId));
  const [subBusy, setSubBusy] = useState(false);

  useEffect(() => {
    const chars = loadCharacters();
    setCharacter(chars.find(c => c.id === characterId) || null);
    const sessions = loadChatSessions();
    const sess = sessions.find(s => s.id === sessionId) || sessions.find(s => s.contactId === characterId && !s.isGroup);
    const current = sess?.alias || "";
    setAlias(current);
    setDraft(current);
    setTheirRemark(getCharacterRemark(characterId));
    setMoments(getCharacterRecentMoments(characterId));
    // 对方备注初始生成（按人设+记忆，后续对方可改）
    if (!getCharacterRemark(characterId)) {
      void import("@/lib/character-remark-engine").then(m => m.ensureInitialCharacterRemark(characterId)).catch(() => {});
    }
    const onRemark = () => {
      setTheirRemark(getCharacterRemark(characterId));
      setMoments(getCharacterRecentMoments(characterId));
    };
    window.addEventListener(CONTACT_REMARKS_UPDATED_EVENT, onRemark);
    return () => window.removeEventListener(CONTACT_REMARKS_UPDATED_EVENT, onRemark);
  }, [characterId, sessionId]);

  const saveAlias = () => {
    const next = draft.trim().slice(0, 30);
    const sessions = loadChatSessions();
    const idx = sessions.findIndex(s => s.id === sessionId || (s.contactId === characterId && !s.isGroup));
    if (idx === -1) {
      setNotice(L.noRemark);
      return;
    }
    const prev = sessions[idx].alias || "";
    sessions[idx] = { ...sessions[idx], alias: next };
    saveChatSessions(sessions);
    setAlias(next);
    setEditing(false);
    if (next !== prev) {
      notifyCharacterOfUserRemarkChange(characterId, prev, next);
    }
  };

  if (!character) return null;
  const shown = overlayCharacterForDisplay(character);
  const wechatId = character.wechatID || character.id.slice(-8);

  return (
    <div className="char-card-overlay" onClick={onClose}>
      <div className="char-card" onClick={e => e.stopPropagation()}>
        <div className="char-card-head">
          <span className="char-card-title">{L.title}</span>
          <button type="button" className="char-card-close" aria-label={L.close} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="char-card-profile">
          <div className="char-card-avatar">
            {shown.avatar ? <img src={shown.avatar} alt="" /> : <ChatFallbackAvatar />}
          </div>
          <div className="char-card-idblock">
            <strong>{alias || character.screenName || character.name}</strong>
            <span>{L.nickname}：{character.screenName || character.name}</span>
            <span>ID：{wechatId}</span>
          </div>
        </div>
        <div className="char-card-rows">
          <div className="char-card-row">
            <span className="char-card-label">{L.remark}</span>
            {editing ? (
              <span className="char-card-edit">
                <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={L.remarkPh} maxLength={30} />
                <button type="button" onClick={saveAlias}>{L.save}</button>
              </span>
            ) : (
              <button type="button" className="char-card-value" onClick={() => { setDraft(alias); setEditing(true); }}>
                {alias || L.noRemark}
              </button>
            )}
          </div>
          <div className="char-card-row">
            <span className="char-card-label">{L.theirRemark}</span>
            <span className="char-card-value dim">{theirRemark || L.noRemark}</span>
          </div>
        </div>
        <div className="char-card-moments">
          <button
            type="button"
            className="char-card-moments-title"
            style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", background: "none", border: 0, cursor: onOpenHomepage ? "pointer" : "default", padding: 0 }}
            onClick={() => { if (onOpenHomepage) { onOpenHomepage(characterId); onClose(); } }}
          >
            <span>{L.recentMoments}</span>
            {onOpenHomepage ? <span>›</span> : null}
          </button>
          {moments.length === 0 ? (
            <div className="char-card-moments-empty">{L.noMoments}</div>
          ) : (
            moments.map(m => (
              <div key={m.id} className="char-card-moment">
                {m.photoUrl ? <img src={m.photoUrl} alt="" /> : null}
                <div className="char-card-moment-body">
                  <p>{m.content.slice(0, 90)}</p>
                  <span>{formatMomentTime(m.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
        {notice ? <div className="char-card-notice">{notice}</div> : null}
        <div className="char-card-moments">
          <div className="char-card-moments-title"><span>TA 的小号（按人设开）</span></div>
          {charSubs.length === 0 ? (
            <div className="char-card-moments-empty">TA 还没开小号</div>
          ) : (
            charSubs.map(sub => (
              <div key={sub.id} className="char-card-moment">
                {sub.avatar ? <img src={sub.avatar} alt="" /> : null}
                <div className="char-card-moment-body">
                  <p>{sub.name}{sub.persona ? ` · ${sub.persona.slice(0, 40)}` : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { deleteCharacterSubAccount(sub.id); setCharSubs(loadCharacterSubAccounts(characterId)); }}
                  style={{ border: 0, background: "none", color: "#e8354b", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                >
                  删除
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            disabled={subBusy}
            onClick={() => {
              if (subBusy) return;
              setSubBusy(true);
              void import("@/lib/recommend-card-engine")
                .then(m => m.createCharacterSubByPersona(characterId))
                .then(() => {
                  setCharSubs(loadCharacterSubAccounts(characterId));
                  setNotice("TA 按人设开了个小号");
                })
                .catch(error => setNotice(error instanceof Error ? error.message : "开小号失败"))
                .finally(() => setSubBusy(false));
            }}
            style={{ border: "1px solid var(--c-panel-border)", background: "none", borderRadius: 10, padding: "8px", fontSize: 13, cursor: "pointer", width: "100%" }}
          >
            {subBusy ? "TA 正在想…" : "让 TA 按人设开个小号"}
          </button>
        </div>
      </div>
    </div>
  );
}
