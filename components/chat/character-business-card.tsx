"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { loadCharacters } from "@/lib/character-storage";
import { loadChatSessions, saveChatSessions } from "@/lib/chat-storage";
import {
  CONTACT_REMARKS_UPDATED_EVENT,
  getCharacterRemark,
  notifyCharacterOfUserRemarkChange,
} from "@/lib/contact-remarks";
import { getAllPosts } from "@/lib/moments-storage";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { MomentTextThumb } from "./moment-text-thumb";
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
  const [moments, setMoments] = useState(() => getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId));
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
    setMoments(getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId));
    // 对方备注初始生成（按人设+记忆，后续对方可改）
    if (!getCharacterRemark(characterId)) {
      void import("@/lib/character-remark-engine").then(m => m.ensureInitialCharacterRemark(characterId)).catch(() => {});
    }
    const onRemark = () => {
      setTheirRemark(getCharacterRemark(characterId));
      setMoments(getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId));
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
  const region = character.profileRegion || "中国大陆";
  const displayName = alias || character.screenName || character.name;
  // 预览只收有图动态（实图或文字图），纯文字不占位
  const thumbPosts = moments.filter(m => m.photoUrl || m.photoDescription).slice(0, 4);

  const openMoments = () => {
    if (onOpenHomepage) {
      onOpenHomepage(characterId);
      onClose();
    }
  };

  return (
    <div className="char-card-overlay" onClick={onClose}>
      <div className="char-card" onClick={e => e.stopPropagation()}>
        <div className="char-card-head">
          <span className="char-card-title">{L.title}</span>
          <button type="button" className="char-card-close" aria-label={L.close} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="wx-profile-head">
          <span className="wx-profile-avatar">
            {shown.avatar ? <img src={shown.avatar} alt="" /> : <ChatFallbackAvatar />}
          </span>
          <div className="wx-profile-id">
            <div className="wx-profile-name">{displayName}</div>
            <div className="wx-profile-line">微信号：{wechatId}</div>
            <div className="wx-profile-line">地区：{region}</div>
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
        <button
          type="button"
          className="wx-profile-moments"
          onClick={openMoments}
        >
          <span>朋友圈</span>
          <span className="wx-profile-thumbs">
            {thumbPosts.length === 0 ? (
              <small className="menu-desc">{L.noMoments}</small>
            ) : (
              thumbPosts.map(m => (
                m.photoUrl
                  ? <img key={m.id} src={m.photoUrl} alt="" />
                  : <MomentTextThumb key={m.id} text={m.photoDescription || m.content} size={48} radius={4} />
              ))
            )}
          </span>
          <span className="wx-profile-go">›</span>
        </button>
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
