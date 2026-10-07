import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { resolveUserIdentity, loadUserIdentities } from "@/lib/settings-storage";
import { getActiveMaskId } from "@/lib/mask-scope";
import { getAllPosts } from "@/lib/moments-storage";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { MomentsFeed } from "./moments-feed";

/**
 * p5 用户名片：全屏微信风（头像/名字/面具/朋友圈入口带预览）。
 * 从消息主页左上角头像点进；朋友圈进去是自己的 p6。
 */
export function UserBusinessCard({ onClose }: { onClose: () => void }) {
  const [identity, setIdentity] = useState(() => resolveUserIdentity());
  const [showFeed, setShowFeed] = useState(false);

  useEffect(() => {
    const maskId = getActiveMaskId();
    const list = loadUserIdentities();
    setIdentity(list.find(i => i.id === maskId) || resolveUserIdentity());
  }, []);

  const previewPhotos = useMemo(() => {
    try {
      return getAllPosts()
        .filter(p => p.authorType === "user" && (!p.maskId || p.maskId === identity?.id))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 4);
    } catch {
      return [];
    }
  }, [identity?.id]);

  return (
    <div className="char-card-overlay" onClick={onClose}>
      <div className="char-card" onClick={e => e.stopPropagation()}>
        <div className="char-card-head">
          <span className="char-card-title">我的名片</span>
          <button type="button" className="char-card-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="char-card-profile">
          <div className="char-card-avatar">
            {identity?.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <ChatFallbackAvatar />}
          </div>
          <div className="char-card-idblock">
            <strong>{identity?.name || "我"}</strong>
            <span>面具：{identity?.name || "默认"}</span>
            <span>{identity?.bio ? identity.bio.slice(0, 40) : ""}</span>
          </div>
        </div>
        <div className="char-card-moments">
          <button
            type="button"
            className="char-card-moments-title"
            style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", background: "none", border: 0, cursor: "pointer", padding: 0 }}
            onClick={() => setShowFeed(true)}
          >
            <span>朋友圈</span>
            <span>›</span>
          </button>
          {previewPhotos.length === 0 ? (
            <div className="char-card-moments-empty">还没有动态，去发一条</div>
          ) : (
            previewPhotos.map(m => (
              <div key={m.id} className="char-card-moment">
                {m.photoUrl ? <img src={m.photoUrl} alt="" /> : null}
                <div className="char-card-moment-body">
                  <p>{m.content.slice(0, 90)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {showFeed && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5 }}>
          <MomentsFeed onCloseApp={() => setShowFeed(false)} />
        </div>
      )}
    </div>
  );
}
