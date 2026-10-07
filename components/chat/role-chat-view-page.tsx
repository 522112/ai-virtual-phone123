import { useEffect, useMemo, useState } from "react";
import { loadChatMessages, loadChatSessions, type ChatMessage } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import { PageShell } from "@/components/ui/page-shell";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";

type Props = {
  sessionId: string;
  onBack: () => void;
};

/**
 * 角色互聊专属页（上帝视角）：聊天页面同款气泡，左边一方、右边一方，带头像；
 * 只读展示，输入框锁定，用户只能看，不能发言；双方不知道被围观（除非用户自己去说）。
 */
export function RoleChatViewPage({ sessionId, onBack }: Props) {
  const [title, setTitle] = useState("聊天记录");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const session = loadChatSessions().find(s => s.id === sessionId);
    setTitle(session?.alias || "聊天记录");
    setMessages(loadChatMessages(sessionId));
  }, [sessionId]);

  const chars = useMemo(() => loadCharacters(), []);
  // 先开口的固定在左边，另一方在右边
  const leftName = messages.length > 0 ? (messages[0].senderName || "") : "";
  const avatarOf = (msg: ChatMessage): string | null => {
    if (msg.senderCharacterId) {
      const hit = chars.find(c => c.id === msg.senderCharacterId);
      if (hit?.avatar) return hit.avatar;
    }
    if (msg.senderName) {
      const hit = chars.find(c => c.name === msg.senderName);
      if (hit?.avatar) return hit.avatar;
    }
    return null;
  };

  return (
    <PageShell title={title} onBack={onBack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 12px 24px" }}>
        <div className="menu-desc" style={{ textAlign: "center" }}>上帝视角 · 对方不知道你在看</div>
        {messages.length === 0 ? (
          <div className="ui-empty"><span className="menu-desc">还没有聊天内容</span></div>
        ) : messages.map(msg => {
          const isLeft = (msg.senderName || "") === leftName;
          const avatar = avatarOf(msg);
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: isLeft ? "row" : "row-reverse", alignItems: "flex-start", gap: 8 }}>
              <span style={{ width: 38, height: 38, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                {avatar ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
              </span>
              <span style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isLeft ? "flex-start" : "flex-end", gap: 2 }}>
                {(msg.senderName || "") && (
                  <small className="menu-desc">{msg.senderName}</small>
                )}
                <span
                  style={{
                    background: isLeft ? "#fff" : "#95ec69",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#191919",
                    boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
