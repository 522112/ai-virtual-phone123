import { useEffect, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { loadBindingConfig, loadUserIdentities, resolveBinding } from "@/lib/settings-storage";
import type { UserIdentity } from "@/components/settings/user-identity";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";

type Props = {
  activeMaskId: string;
  onSelect: (maskId: string) => void;
  onClose: () => void;
};

export function MaskSwitchSheet({ activeMaskId, onSelect, onClose }: Props) {
  const [identities, setIdentities] = useState<UserIdentity[]>(() => loadUserIdentities());
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setIdentities(loadUserIdentities());
    try {
      const binding = loadBindingConfig();
      const chars = loadCharacters();
      const map: Record<string, number> = {};
      for (const identity of loadUserIdentities()) map[identity.id] = 0;
      for (const char of chars) {
        const slot = resolveBinding(binding, char.id, "chat");
        const maskId = slot.userIdentityId || loadUserIdentities()[0]?.id || "";
        if (maskId) map[maskId] = (map[maskId] || 0) + 1;
      }
      setCounts(map);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="journal-sheet-overlay" onClick={onClose}>
      <div className="journal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: "82vh", overflowY: "auto" }}>
        <div className="journal-sheet-title">切换面具（不同世界观互不串）</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {identities.length === 0 ? <p className="journal-empty">还没有面具，去设置里创建一个</p> : identities.map(identity => {
            const active = identity.id === activeMaskId;
            return (
              <button
                key={identity.id}
                type="button"
                onClick={() => { onSelect(identity.id); onClose(); }}
                style={{
                  display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left",
                  background: "var(--c-card, #fff)",
                  border: active ? "2px solid #07c160" : "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 16, padding: "14px 14px", cursor: "pointer",
                  boxShadow: active ? "0 4px 16px rgba(7,193,96,0.18)" : "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <span style={{ width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                  {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{identity.name}</span>
                    {active ? <em style={{ fontStyle: "normal", fontSize: 10, color: "#fff", background: "#07c160", borderRadius: 8, padding: "1px 7px", flexShrink: 0 }}>使用中</em> : null}
                  </strong>
                  <small className="menu-desc" style={{ display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {identity.bio ? identity.bio.slice(0, 30) : `${counts[identity.id] || 0} 个角色 · 记忆/朋友圈/小号各自隔离`}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
