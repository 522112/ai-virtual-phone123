"use client";

import { useCallback, useEffect, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { usePhoneBack } from "@/lib/phone-navigation";
import { isReverseWatchEnabled } from "@/lib/reverse-watch";
import { getReverseWatchRecord } from "@/lib/reverse-watch-storage";
import type { ReverseWatchRecord } from "@/lib/reverse-watch-storage";

type ReverseWatchPanelState = {
  characterId: string;
  characterName: string;
  suspicion: number;
};

/**
 * 反查岗面板：用户点"看看"后，看角色正在翻自己手机的过程。
 * 从 trigger 事件或手动打开。只展示怀疑值、角色头像名字和"正在翻看…"状态，
 * 真正的翻看发生在角色自己的聊天回合里（工具调用结果进聊天）。
 */
export function useReverseWatchTrigger(onTrigger: (state: ReverseWatchPanelState) => void) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as ReverseWatchPanelState | undefined;
      if (!detail?.characterId) return;
      if (!isReverseWatchEnabled()) return;
      onTrigger({ characterId: detail.characterId, characterName: detail.characterName || "", suspicion: detail.suspicion ?? 90 });
    };
    window.addEventListener("reverse-watch-trigger", handler);
    return () => window.removeEventListener("reverse-watch-trigger", handler);
  }, [onTrigger]);
}

export function ReverseWatchSheet({ state, onClose, onOpenChat }: {
  state: ReverseWatchPanelState | null;
  onClose: () => void;
  onOpenChat: (characterId: string) => void;
}) {
  const [record, setRecord] = useState<ReverseWatchRecord | null>(null);
  const character = state ? loadCharacters().find(c => c.id === state.characterId) : undefined;

  useEffect(() => {
    if (state) setRecord(getReverseWatchRecord(state.characterId));
  }, [state]);

  usePhoneBack(() => {
    if (!state) return false;
    onClose();
    return true;
  }, 45);

  if (!state) return null;

  return (
    <div
      className="rw-overlay"
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, zIndex: 70,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(8,6,12,0.6)", backdropFilter: "blur(8px)",
      }}
    >
      <style>{`
.rw-sheet{width:100%;border-radius:22px 22px 0 0;background:linear-gradient(170deg,#2a1520,#14121a 55%,#1a1220);border:1px solid rgba(255,255,255,0.1);border-bottom:none;color:#f4efe8;box-shadow:0 -12px 48px rgba(0,0,0,0.6);animation:rwUp 0.28s cubic-bezier(0.2,0.9,0.3,1.1);padding:6px 0 20px}
@keyframes rwUp{from{transform:translateY(48px);opacity:0}to{transform:none;opacity:1}}
.rw-meter{height:8px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;margin-top:10px}
.rw-meter i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#fbbf24,#f43f5e)}
.rw-btn{border-radius:12px;padding:10px;font-size:13px;font-weight:700;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);color:#fff}
.rw-btn-primary{background:linear-gradient(135deg,#f43f5e,#a855f7);border:none}
`}</style>
      <div className="rw-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px 4px" }}>
          <span style={{ fontSize: 26 }}>🔍</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {character?.avatar ? (
                <img src={character.avatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", verticalAlign: "-7px", marginRight: 8 }} />
              ) : null}
              {state.characterName || character?.name || "对方"}正在查你的岗
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
              TA 翻了你的微信消息、联系人{record ? `……怀疑值 ${record.suspicion}/100` : ""}
            </div>
          </div>
          <button type="button" className="rw-btn" onClick={onClose} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 999 }}>收起</button>
        </div>
        <div style={{ padding: "4px 18px 0" }}>
          <div className="rw-meter"><i style={{ width: `${Math.min(100, state.suspicion)}%` }} /></div>
          {record && record.log.length > 0 ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.7 }}>
              {record.log.slice(-3).map((e, i) => (
                <div key={i}>· {e.reason}（{e.delta >= 0 ? "+" : ""}{e.delta}）</div>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" className="rw-btn" style={{ flex: 1 }} onClick={onClose}>先装作不知道</button>
            <button type="button" className="rw-btn rw-btn-primary" style={{ flex: 1 }} onClick={() => { onOpenChat(state.characterId); onClose(); }}>去对峙</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useReverseWatchSheetState() {
  const [state, setState] = useState<ReverseWatchPanelState | null>(null);
  const open = useCallback((next: ReverseWatchPanelState) => setState(next), []);
  const close = useCallback(() => setState(null), []);
  useReverseWatchTrigger(open);
  return { state, open, close };
}
