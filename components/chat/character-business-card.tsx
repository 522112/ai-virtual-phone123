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
};

export function CharacterBusinessCard({ characterId, sessionId, onClose }: Props) {
  const [character, setCharacter] = useState<Character | null>(() => loadCharacters().find(c => c.id === characterId) || null);
  const [alias, setAlias] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [theirRemark, setTheirRemark] = useState(() => getCharacterRemark(characterId));
  const [moments, setMoments] = useState(() => getCharacterRecentMoments(characterId));
  const [notice, setNotice] = useState("");

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
            {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
          </div>
          <div className="char-card-idblock">
            <strong>{alias || character.name}</strong>
            <span>{L.nickname}：{character.name}</span>
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
          <div className="char-card-moments-title">{L.recentMoments}</div>
          {moments.length === 0 ? (
            <div className="char-card-moments-empty">{L.noMoments}</div>
          ) : (
            moments.map(m => (
              <div key={m.id} className="char-card-moment">
                <p>{m.content.slice(0, 90)}</p>
                <span>{formatMomentTime(m.createdAt)}</span>
              </div>
            ))
          )}
        </div>
        {notice ? <div className="char-card-notice">{notice}</div> : null}
      </div>
    </div>
  );
}
