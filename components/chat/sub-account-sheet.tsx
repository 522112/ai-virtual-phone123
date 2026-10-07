import { useEffect, useState } from "react";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
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
import { kvGet } from "@/lib/kv-db";

export const ACTIVE_SUB_CHANGED_EVENT = "active-sub-changed";

type Props = {
  activeMaskId: string;
  activeSubId: string | null;
  onSelectSub: (subId: string | null) => void;
  onClose: () => void;
  onNotice?: (msg: string) => void;
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
export function SubAccountSheet({ activeMaskId, activeSubId, onSelectSub, onClose, onNotice }: Props) {
  const [maskName, setMaskName] = useState("");
  const [subs, setSubs] = useState<UserSubAccount[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [friendingId, setFriendingId] = useState<string | null>(null);
  const [targetWechat, setTargetWechat] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendResult, setFriendResult] = useState("");

  const refresh = () => {
    const mask = loadUserIdentities().find(i => i.id === activeMaskId);
    setMaskName(mask?.name || "当前面具");
    setSubs(loadUserSubAccounts(activeMaskId));
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener(SUB_ACCOUNTS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SUB_ACCOUNTS_UPDATED_EVENT, onUpdate);
  }, [activeMaskId]);

  const pick = (subId: string | null) => {
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

  return (
    <div className="journal-sheet-overlay" onClick={onClose}>
      <div className="journal-sheet" onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-title">小号 · {maskName}</div>
        <div className="journal-clip-list">
          <small className="menu-desc">切到小号就是一个新号：聊天/好友/朋友圈从零开始，角色只认识这个号</small>
          <button
            type="button"
            className="journal-clip-row"
            style={!activeSubId ? { border: "1px solid var(--c-accent)" } : undefined}
            onClick={() => pick(null)}
          >
            <small>主号</small>
            <span>用本面具身份聊天</span>
          </button>
          {subs.map(sub => (
            <div key={sub.id}>
              <div className="journal-clip-row" style={sub.id === activeSubId ? { border: "1px solid var(--c-accent)" } : undefined}>
                <button
                  type="button"
                  style={{ flex: 1, display: "flex", gap: 8, alignItems: "center", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}
                  onClick={() => pick(sub.id)}
                >
                  <span style={{ width: 30, height: 30, borderRadius: 15, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                    {sub.avatar ? <img src={sub.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: "block", fontSize: 13 }}>{sub.name}</strong>
                    <small className="menu-desc">{sub.persona ? sub.persona.slice(0, 24) : "没设人设：对方在聊天中认识你"}</small>
                  </span>
                </button>
                <button type="button" onClick={() => { setFriendingId(friendingId === sub.id ? null : sub.id); setFriendResult(""); }} style={{ border: 0, background: "none", color: "var(--c-text-secondary)", fontSize: 12, cursor: "pointer" }}>加好友</button>
                <button type="button" onClick={() => openEditor(sub)} style={{ border: 0, background: "none", color: "var(--c-text-secondary)", fontSize: 12, cursor: "pointer" }}>编辑</button>
                <button type="button" onClick={() => { deleteUserSubAccount(sub.id); if (activeSubId === sub.id) pick(null); }} style={{ border: 0, background: "none", color: "#e8354b", fontSize: 12, cursor: "pointer" }}>删除</button>
              </div>
              {friendingId === sub.id ? (
                <div className="g-card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  <input value={targetWechat} onChange={e => setTargetWechat(e.target.value)} placeholder="对方微信号" className="ui-input" />
                  <input value={verifyMsg} maxLength={60} onChange={e => setVerifyMsg(e.target.value)} placeholder="验证消息（对方按人设决定过不过）" className="ui-input" />
                  {friendResult ? <small className="menu-desc">{friendResult}</small> : null}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" disabled={friendBusy} onClick={() => void sendFriendRequest(sub.id)} className="ui-btn ui-btn-success">
                      {friendBusy ? "等待对方决定…" : "发送好友申请"}
                    </button>
                    <button type="button" onClick={() => setFriendingId(null)} style={{ border: 0, background: "none", fontSize: 12, cursor: "pointer" }}>取消</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {editingId !== null ? (
            <div className="g-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={name} maxLength={30} onChange={e => setName(e.target.value)} placeholder="网名（对方看到的名字）" className="ui-input" />
              <textarea value={persona} rows={3} onChange={e => setPersona(e.target.value)} placeholder="人设（可选，不填对方就在聊天中认识你；绝不会暴露你是大号）" className="ui-textarea" />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ border: "1px solid var(--c-panel-border)", borderRadius: 10, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>
                  {avatar ? "换头像" : "传头像"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) setAvatar(await readFileAsDataUrl(file));
                      e.target.value = "";
                    }}
                  />
                </label>
                {avatar ? (
                  <span style={{ width: 30, height: 30, borderRadius: 15, overflow: "hidden" }}>
                    <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </span>
                ) : null}
                <span style={{ flex: 1 }} />
                <button type="button" onClick={saveEditor} className="ui-btn ui-btn-success">保存</button>
                <button type="button" onClick={() => setEditingId(null)} style={{ border: 0, background: "none", fontSize: 12, cursor: "pointer" }}>取消</button>
              </div>
            </div>
          ) : (
            <button type="button" className="journal-clip-row" onClick={() => openEditor(null)}>
              <small>＋</small>
              <span>开个新小号（像 QQ 新号）</span>
            </button>
          )}
        </div>
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}

export function getActiveSubId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return kvGet("active_sub_id") || null;
  } catch {
    return null;
  }
}

export function getActiveSub(): ReturnType<typeof getUserSubAccount> {
  const id = getActiveSubId();
  return id ? getUserSubAccount(id) : null;
}
