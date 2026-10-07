import { useEffect, useState } from "react";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import {
  createUserSubAccount,
  deleteUserSubAccount,
  loadUserSubAccounts,
  updateUserSubAccount,
  SUB_ACCOUNTS_UPDATED_EVENT,
  type UserSubAccount,
} from "@/lib/sub-accounts";
import { loadUserIdentities } from "@/lib/settings-storage";
import type { UserIdentity } from "@/components/settings/user-identity";

type Props = {
  activeMaskId: string;
  activeSubId: string | null;
  onSelectMask: (maskId: string) => void;
  onSelectSub: (subId: string | null) => void;
  onClose: () => void;
  onNotice?: (msg: string) => void;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}

export function SubAccountSheet({ activeMaskId, activeSubId, onSelectMask, onSelectSub, onClose, onNotice }: Props) {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
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
    setIdentities(loadUserIdentities());
    setSubs(loadUserSubAccounts(activeMaskId));
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener(SUB_ACCOUNTS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SUB_ACCOUNTS_UPDATED_EVENT, onUpdate);
  }, [activeMaskId]);

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
      onNotice?.(`小号「${created.name}」已创建，角色不知道这是你`);
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
        <div className="journal-sheet-title">面具 · 小号</div>
        <div className="journal-clip-list">
          <small className="menu-desc">当前面具</small>
          {identities.map(identity => (
            <button
              key={identity.id}
              type="button"
              className="journal-clip-row"
              style={identity.id === activeMaskId ? { border: "1px solid var(--c-accent)" } : undefined}
              onClick={() => { onSelectMask(identity.id); }}
            >
              <small>{identity.id === activeMaskId ? "使用中" : "切换"}</small>
              <span>{identity.name}</span>
            </button>
          ))}
          <small className="menu-desc">小号（角色眼里是陌生人，不知道是你）</small>
          <button
            type="button"
            className="journal-clip-row"
            style={!activeSubId ? { border: "1px solid var(--c-accent)" } : undefined}
            onClick={() => { onSelectSub(null); onClose(); }}
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
                  onClick={() => { onSelectSub(sub.id); onClose(); }}
                >
                  <span style={{ width: 30, height: 30, borderRadius: 15, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                    {sub.avatar ? <img src={sub.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: "block", fontSize: 13 }}>{sub.name}</strong>
                    <small className="menu-desc">{sub.persona ? sub.persona.slice(0, 24) : "未写人设"}</small>
                  </span>
                </button>
                <button type="button" onClick={() => { setFriendingId(friendingId === sub.id ? null : sub.id); setFriendResult(""); }} style={{ border: 0, background: "none", color: "var(--c-text-secondary)", fontSize: 12, cursor: "pointer" }}>加好友</button>
                <button type="button" onClick={() => openEditor(sub)} style={{ border: 0, background: "none", color: "var(--c-text-secondary)", fontSize: 12, cursor: "pointer" }}>编辑</button>
                <button type="button" onClick={() => { deleteUserSubAccount(sub.id); if (activeSubId === sub.id) onSelectSub(null); }} style={{ border: 0, background: "none", color: "#e8354b", fontSize: 12, cursor: "pointer" }}>删除</button>
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
              <input value={name} maxLength={30} onChange={e => setName(e.target.value)} placeholder="网名（角色看到的名字）" className="ui-input" />
              <textarea value={persona} rows={3} onChange={e => setPersona(e.target.value)} placeholder="人设（角色看到的你是谁，不知道是你本人）" className="ui-textarea" />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ border: "1px solid var(--c-panel-border)", borderRadius: 10, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>
                  {avatar ? "换头像" : "传头像"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) setAvatar(await readFileAsDataUrl(file).catch(() => null));
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
            <button
              type="button"
              className="journal-clip-row"
              onClick={() => openEditor(null)}
            >
              <small>＋</small>
              <span>创建小号</span>
            </button>
          )}
        </div>
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
