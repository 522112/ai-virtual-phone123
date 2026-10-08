import React, { useEffect, useState } from "react";import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import {
  createUserSubAccount,
  deleteUserSubAccount,
  getUserSubAccount,
  loadUserSubAccounts,
  updateUserSubAccount,
  SUB_ACCOUNTS_UPDATED_EVENT,
  type UserSubAccount,
} from "@/lib/sub-accounts";
import { loadUserIdentities } from "@/lib/settings-storage";
import { kvGet, kvSet } from "@/lib/kv-db";

export const ACTIVE_SUB_CHANGED_EVENT = "active-sub-changed";

type Props = {
  activeMaskId: string;
  activeSubId: string | null;
  onSelectSub: (subId: string | null) => void;
  onClose: () => void;
  onNotice?: (msg: string) => void;
  /** 只选择不切换：点卡片只回传，不改当前身份（给“帮小号加人”用） */
  selectOnly?: boolean;
  onPickSub?: (subId: string | null) => void;
};

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function dispatchSubChanged(subId: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_SUB_CHANGED_EVENT, { detail: { subId } }));
}

/** 聊天主页长按：只切当前面具的小号（+新增）。面具切换去“我的”页面长按头像。 */
export function SubAccountSheet({ activeMaskId, activeSubId, onSelectSub, onClose, onNotice, selectOnly, onPickSub }: Props) {
  const [maskName, setMaskName] = useState("");
  const [maskAvatar, setMaskAvatar] = useState<string | null>(null);
  const [maskBio, setMaskBio] = useState("");
  const [subs, setSubs] = useState<UserSubAccount[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const avatarFileRef = React.useRef<HTMLInputElement>(null);
  const touchStartX = React.useRef(0);

  const refresh = () => {
    const mask = loadUserIdentities().find(i => i.id === activeMaskId);
    setMaskName(mask?.name || "当前面具");
    setMaskAvatar(mask?.avatarUrl || null);
    setMaskBio(mask?.bio || "");
    setSubs(loadUserSubAccounts(activeMaskId));
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener(SUB_ACCOUNTS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SUB_ACCOUNTS_UPDATED_EVENT, onUpdate);
  }, [activeMaskId]);

  const pick = (subId: string | null) => {
    if (selectOnly) {
      onPickSub?.(subId);
      return;
    }
    onSelectSub(subId);
    dispatchSubChanged(subId);
    onClose();
  };

  const openEditor = (sub: UserSubAccount | null) => {
    setEditingId(sub ? sub.id : "new");
    setName(sub?.name || "");
    setPersona(sub?.persona || "");
    setAvatar(sub?.avatar || null);
  };

  const saveEditor = () => {
    if (!name.trim()) {
      onNotice?.("给小号起个网名");
      return;
    }
    if (editingId === "new") {
      const created = createUserSubAccount({ maskId: activeMaskId, name, avatar, persona });
      onNotice?.(`小号「${created.name}」已创建，相当于一个新号：聊天/好友/朋友圈都从零开始`);
    } else if (editingId) {
      updateUserSubAccount(editingId, { name, avatar, persona });
      onNotice?.("小号已更新");
    }
    setEditingId(null);
  };

  const sendFriendRequest = async (subId: string) => {
    if (friendBusy || !targetWechat.trim() || !verifyMsg.trim()) {
      onNotice?.("填对方微信号和验证消息");
      return;
    }
    setFriendBusy(true);
    setFriendResult("");
    try {
      const { requestSubFriend } = await import("@/lib/sub-friend-engine");
      const result = await requestSubFriend(subId, targetWechat.trim(), verifyMsg.trim());
      setFriendResult(result.accepted ? `对方通过了：${result.reply}` : `对方拒绝了：${result.reply}`);
      if (result.accepted) {
        setFriendingId(null);
        setTargetWechat("");
        setVerifyMsg("");
      }
    } catch (error) {
      setFriendResult(error instanceof Error ? error.message : "发送失败");
    } finally {
      setFriendBusy(false);
    }
  };

  const cardStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    gap: 12,
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    background: "var(--c-card, #fff)",
    border: active ? "2px solid #07c160" : "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: "14px 14px",
    cursor: "pointer",
    boxShadow: active ? "0 4px 16px rgba(7,193,96,0.18)" : "0 2px 8px rgba(0,0,0,0.06)",
  });
  const avatarStyle: React.CSSProperties = {
    width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0,
    background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center",
  };

  return (
    <div
      className="journal-sheet-overlay"
      onClick={onClose}
      style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div className="journal-sheet" onClick={e => e.stopPropagation()} style={{ height: "62vh", maxHeight: "62vh", display: "flex", flexDirection: "column" }}>
        <div className="journal-sheet-title">{selectOnly ? "选择小号" : `切换身份 · ${maskName}`}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1, paddingBottom: 4 }}>
          <small className="menu-desc">小号就是一个新号：聊天/好友/朋友圈从零开始，对方只认识这个号</small>
          {!selectOnly && (
          <button type="button" style={cardStyle(!activeSubId)} onClick={() => pick(null)}>
            <span style={avatarStyle}>
              {maskAvatar ? <img src={maskAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15 }}>
                {maskName}
                {!activeSubId ? <em style={{ fontStyle: "normal", fontSize: 10, color: "#fff", background: "#07c160", borderRadius: 8, padding: "1px 7px" }}>使用中</em> : null}
              </strong>
              <small className="menu-desc" style={{ display: "block", marginTop: 2 }}>主号 · {maskBio || "用本面具身份聊天"}</small>
            </span>
          </button>
          )}
          {subs.map(sub => {
            const swiped = swipedId === sub.id;
            const confirming = confirmDeleteId === sub.id;
            return (
            <div key={sub.id} style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
              <span
                style={{
                  position: "absolute", top: 0, right: 0, bottom: 0, width: 84,
                  display: selectOnly ? "none" : "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (confirming) {
                      deleteUserSubAccount(sub.id);
                      setConfirmDeleteId(null);
                      setSwipedId(null);
                      if (activeSubId === sub.id) pick(null);
                      else refresh();
                    } else {
                      setConfirmDeleteId(sub.id);
                    }
                  }}
                  style={{
                    border: 0, background: confirming ? "#e8354b" : "#ff7a59", color: "#fff",
                    fontSize: 12, borderRadius: 10, padding: "8px 10px", cursor: "pointer", marginRight: 8,
                  }}
                >
                  {confirming ? "确认删除" : "删除"}
                </button>
              </span>
              <div
                style={{ ...cardStyle(sub.id === activeSubId), transform: swiped ? "translateX(-84px)" : "translateX(0)", transition: "transform 0.18s ease" }}
                onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                onTouchMove={e => {
                  const dx = e.touches[0].clientX - touchStartX.current;
                  if (dx < -40 && swipedId !== sub.id) { setSwipedId(sub.id); setConfirmDeleteId(null); }
                  if (dx > 40 && swipedId === sub.id) { setSwipedId(null); setConfirmDeleteId(null); }
                }}
              >
                <button
                  type="button"
                  style={{ flex: 1, minWidth: 0, display: "flex", gap: 12, alignItems: "center", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}
                  onClick={() => { if (swiped) { setSwipedId(null); setConfirmDeleteId(null); return; } pick(sub.id); }}
                >
                  <span style={avatarStyle}>
                    {sub.avatar ? <img src={sub.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</span>
                      {sub.id === activeSubId ? <em style={{ fontStyle: "normal", fontSize: 10, color: "#fff", background: "#07c160", borderRadius: 8, padding: "1px 7px", flexShrink: 0 }}>使用中</em> : null}
                    </strong>
                    <small className="menu-desc" style={{ display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sub.persona ? sub.persona.slice(0, 30) : "没设人设：对方在聊天中认识你"}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); openEditor(sub); }}
                  style={{ border: "1px solid rgba(0,0,0,0.12)", background: "var(--c-card, #fff)", borderRadius: 10, fontSize: 11, padding: "6px 10px", cursor: "pointer", flexShrink: 0, display: selectOnly ? "none" : undefined }}
                >
                  编辑
                </button>
              </div>
            </div>
            );
          })}
          {!selectOnly && editingId !== null ? (
            <div className="g-card" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                style={{
                  alignSelf: "center", width: 84, height: 84, borderRadius: 18, overflow: "hidden",
                  border: "2px dashed rgba(0,0,0,0.2)", background: "rgba(0,0,0,0.04)",
                  display: "grid", placeItems: "center", cursor: "pointer", padding: 0,
                }}
                aria-label="选择头像"
              >
                {avatar ? (
                  <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 11, color: "var(--c-text-secondary)" }}>选头像</span>
                )}
              </button>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (file) setAvatar(await readFileAsDataUrl(file));
                  e.target.value = "";
                }}
              />
              <input value={name} maxLength={30} onChange={e => setName(e.target.value)} placeholder="网名（对方看到的名字）" className="ui-input" />
              <textarea value={persona} rows={3} onChange={e => setPersona(e.target.value)} placeholder="人设（可选，不填对方就在聊天中认识你；绝不会暴露你是大号）" className="ui-textarea" />
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                <button type="button" onClick={saveEditor} className="ui-btn ui-btn-success">保存</button>
                <button type="button" onClick={() => setEditingId(null)} style={{ border: 0, background: "none", fontSize: 12, cursor: "pointer" }}>取消</button>
              </div>
            </div>
          ) : !selectOnly ? (
            <button type="button" style={{ ...cardStyle(false), borderStyle: "dashed", justifyContent: "center", color: "var(--c-text-secondary)" }} onClick={() => openEditor(null)}>
              ＋ 添加账号
            </button>
          ) : null}
        </div>
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}

export function getActiveSubId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = kvGet("active_sub_id") || null;
    if (!id) return null;
    // 小号归属面具：不是当前面具的小号直接视为无，绝不复用上个面具的小号
    try {
      const sub = getUserSubAccount(id);
      const maskId = kvGet("active_mask_id") || "";
      if (!sub || (sub.maskId || "") !== (maskId || "")) {
        kvSet("active_sub_id", "");
        return null;
      }
    } catch { /* ignore */ }
    return id;
  } catch {
    return null;
  }
}

export function getActiveSub(): ReturnType<typeof getUserSubAccount> {
  const id = getActiveSubId();
  return id ? getUserSubAccount(id) : null;
}
