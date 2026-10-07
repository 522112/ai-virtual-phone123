import { useEffect, useState } from "react";
import { loadChatMessages, loadChatSessions, type ChatMessage } from "@/lib/chat-storage";
import { PageShell } from "@/components/ui/page-shell";
import { MessageBubble } from "./message-bubble";

type Props = {
  sessionId: string;
  onBack: () => void;
};

/**
 * 角色互聊专属页（上帝视角）：只读展示双方聊天，输入框锁定，
 * 用户只能看，不能发言；双方不知道被围观（除非用户自己去说）。
 */
export function RoleChatViewPage({ sessionId, onBack }: Props) {
  const [title, setTitle] = useState("聊天记录");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const session = loadChatSessions().find(s => s.id === sessionId);
    setTitle(session?.alias || "聊天记录");
    setMessages(loadChatMessages(sessionId));
  }, [sessionId]);

  return (
    <PageShell title={title} onBack={onBack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 12px 24px" }}>
        <div className="menu-desc" style={{ textAlign: "center" }}>上帝视角 · 对方不知道你在看</div>
        {messages.length === 0 ? (
          <div className="ui-empty"><span className="menu-desc">还没有聊天内容</span></div>
        ) : messages.map(msg => (
          <div key={msg.id} className="chat-msg-content-wrap flex flex-col min-w-0 max-w-[80%]">
            {(msg.senderName || "") && (
              <span className="chat-group-sender-name">{msg.senderName}</span>
            )}
            <MessageBubble msg={msg} />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
