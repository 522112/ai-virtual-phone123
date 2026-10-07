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
      <div className="journal-sheet" onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-title">切换面具（不同世界观互不串）</div>
        <div className="journal-clip-list">
          {identities.length === 0 ? <p className="journal-empty">还没有面具，去设置里创建一个</p> : identities.map(identity => (
            <button
              key={identity.id}
              type="button"
              className="journal-clip-row"
              style={identity.id === activeMaskId ? { border: "1px solid var(--c-accent)" } : undefined}
              onClick={() => { onSelect(identity.id); onClose(); }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 15, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
              </span>
              <span style={{ flex: 1 }}>
                <strong style={{ display: "block", fontSize: 13 }}>{identity.name}{identity.id === activeMaskId ? "（使用中）" : ""}</strong>
                <small className="menu-desc">{counts[identity.id] || 0} 个角色 · 记忆/朋友圈/小号各自隔离</small>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="journal-sheet-cancel" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
