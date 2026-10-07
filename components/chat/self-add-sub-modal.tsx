import { useState } from "react";
import { kvGet } from "@/lib/kv-db";
import { pushChatMessage } from "@/lib/chat-storage";
import { getUserSubAccount } from "@/lib/sub-accounts";
import { ensureSubSession } from "@/lib/sub-friend-engine";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { SubAccountSheet } from "./sub-account-sheet";

type Props = {
  characterId: string;
  characterName?: string;
  characterAvatar?: string | null;
  onClose: () => void;
  onDone: () => void;
};

/** 聊天页内帮小号加人：当前角色默认选中，账号用小号卡片只选不切。 */
export function SelfAddSubModal({ characterId, characterName, characterAvatar, onClose, onDone }: Props) {
  const [pickedSubId, setPickedSubId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const picked = pickedSubId ? getUserSubAccount(pickedSubId) : null;

  const confirm = () => {
    if (busy) return;
    if (!pickedSubId || !picked) {
      setResult("先选一个小号账号");
      return;
    }
    setBusy(true);
    setResult("");
    (async () => {
      try {
        const session = ensureSubSession(characterId, pickedSubId);
        pushChatMessage({
          sessionId: session.id,
          role: "system",
          content: `[你在手机上通过了 ${picked.name} 的好友申请]`,
          status: "sent",
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
          window.dispatchEvent(new CustomEvent("weixin-messages-updated"));
        }
        setResult(`已用${characterName || "对方"}的手机通过，切到「${picked.name}」就能聊了`);
        window.setTimeout(() => onDone(), 1200);
      } catch (error) {
        setResult(error instanceof Error ? error.message : "加上失败，再试一次");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="journal-sheet-overlay" onClick={onClose}>
      <div className="journal-sheet" onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-title" style={{ position: "relative", textAlign: "center" }}>
          帮小号加人
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
              border: 0, background: "none", fontSize: 20, lineHeight: 1,
              color: "var(--c-text-secondary)", cursor: "pointer", padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <small className="menu-desc">用对方手机直接通过，跳过验证</small>
          <div style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--c-card, #fff)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "12px 14px" }}>
            <span style={{ width: 46, height: 46, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
              {characterAvatar ? <img src={characterAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
            </span>
            <span style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: 14 }}>{characterName || "对方"}</strong>
              <small className="menu-desc">当前聊天对象（已默认选中）</small>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", background: "var(--c-card, #fff)", border: picked ? "2px solid #07c160" : "1px dashed rgba(0,0,0,0.2)", borderRadius: 16, padding: "12px 14px", cursor: "pointer" }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
              {picked?.avatar ? <img src={picked.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
            </span>
            <span style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: 14 }}>{picked ? picked.name : "选择小号账号"}</strong>
              <small className="menu-desc">{picked ? (picked.persona ? picked.persona.slice(0, 24) : "没设人设") : "点这里从卡片里选一个"}</small>
            </span>
          </button>
          {result ? <small className="menu-desc" style={{ textAlign: "center" }}>{result}</small> : null}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              className="ui-btn ui-btn-success"
              style={{ minWidth: 160 }}
              disabled={!pickedSubId || busy}
              onClick={confirm}
            >
              {busy ? "正在加上…" : "添加"}
            </button>
          </div>
        </div>
      </div>
      {showPicker && (
        <SubAccountSheet
          activeMaskId={kvGet("active_mask_id") || ""}
          activeSubId={kvGet("active_sub_id") || null}
          onSelectSub={() => {}}
          onClose={() => setShowPicker(false)}
          selectOnly
          onPickSub={subId => { setPickedSubId(subId); setShowPicker(false); setResult(""); }}
        />
      )}
    </div>
  );
}
