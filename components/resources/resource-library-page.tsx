"use client";

import { useMemo, useRef, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_LIBRARY_SHARED_SCOPE,
  addResource,
  deleteResource,
  listResources,
  updateResource,
  type ResourceItem,
  type ResourceKind,
} from "@/lib/resource-library";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function kindOfFile(file: File): ResourceKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}

async function compressImage(dataUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = dataUrl;
  });
  const maxSize = 1024;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  if (scale >= 1) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.85);
}

function FolderGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="reslib-folder-glyph" x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5ED3B3" />
          <stop offset="1" stopColor="#2FA08C" />
        </linearGradient>
      </defs>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill="url(#reslib-folder-glyph)" />
      <path d="M9 10.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 9 10.5Z" fill="#fff" opacity=".92" />
    </svg>
  );
}

function AudioGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18V5l10-2v13" stroke="#8a8f9e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" fill="#c9cedb" />
      <circle cx="16.5" cy="16" r="2.5" fill="#c9cedb" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="返回"
      style={{ border: 0, background: "none", color: "var(--c-text-title)", cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

export function ResourceLibraryPage({ onNotice }: { onNotice?: (msg: string) => void }) {
  const characters = useMemo(() => loadCharacters(), []);
  const [scope, setScope] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ scope: string; category: string | null }>({ scope: "", category: null });

  const notice = (msg: string) => onNotice?.(msg);

  const scopeName = (id: string) => id === RESOURCE_LIBRARY_SHARED_SCOPE
    ? "共享分区"
    : characters.find(c => c.id === id)?.name || "角色分区";
  const scopeAvatar = (id: string) => id === RESOURCE_LIBRARY_SHARED_SCOPE
    ? null
    : characters.find(c => c.id === id)?.avatar || null;
  const scopeCount = (id: string) => listResources(id).length;

  const items = useMemo(
    () => (scope ? listResources(scope).filter(item => !category || item.category === category) : []),
    [scope, category, tick],
  );
  const folderCounts = useMemo(() => {
    if (!scope) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const item of listResources(scope)) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [scope, tick]);

  const openUpload = (targetScope: string, targetCategory: string | null) => {
    uploadTarget.current = { scope: targetScope, category: targetCategory };
    fileRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { scope: targetScope, category: targetCategory } = uploadTarget.current;
    if (!targetScope) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const kind = kindOfFile(file);
        if (!kind) {
          notice(`跳过不支持的文件：${file.name}`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          notice(`${file.name} 超过15MB，已跳过`);
          continue;
        }
        let dataUrl = await readFileAsDataUrl(file);
        if (kind === "image") dataUrl = await compressImage(dataUrl);
        addResource({ scope: targetScope, kind, dataUrl, category: targetCategory || "其他" });
      }
      setTick(n => n + 1);
      notice("已加入资源库，记得写备注");
    } catch (error) {
      notice(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveMeta = (item: ResourceItem, patch: { note?: string; category?: string }) => {
    updateResource(item.id, patch);
    setTick(n => n + 1);
  };

  const removeItem = (id: string) => {
    deleteResource(id);
    setConfirmDeleteId(null);
    setTick(n => n + 1);
    notice("已删除该资源");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 28 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        style={{ display: "none" }}
        onChange={e => void handleFiles(e.target.files)}
      />

      {scope === null && (
        <>
          <p className="menu-desc" style={{ margin: "2px 2px 0" }}>按角色分区存放，也可以放进共享分区，AI 会读备注和分类来使用</p>
          {characters.map(c => (
            <button
              key={c.id}
              type="button"
              className="g-card"
              onClick={() => { setScope(c.id); setCategory(null); }}
              style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", width: "100%" }}
            >
              <span style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center" }}>
                {c.avatar ? <img src={c.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ChatFallbackAvatar />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--c-text-title)" }}>{c.name}</span>
                <span className="menu-desc">{scopeCount(c.id)} 项资源</span>
              </span>
              <span style={{ color: "var(--c-text-secondary)" }}><Chevron /></span>
            </button>
          ))}
          <button
            type="button"
            className="g-card"
            onClick={() => { setScope(RESOURCE_LIBRARY_SHARED_SCOPE); setCategory(null); }}
            style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", width: "100%", background: "linear-gradient(135deg, rgba(94,211,179,.14), rgba(47,160,140,.06))" }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 14, overflow: "hidden", flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,.6)" }}>
              <FolderGlyph />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--c-text-title)" }}>共享分区</span>
              <span className="menu-desc">{scopeCount(RESOURCE_LIBRARY_SHARED_SCOPE)} 项资源 · 所有角色可用</span>
            </span>
            <span style={{ color: "var(--c-text-secondary)" }}><Chevron /></span>
          </button>
        </>
      )}

      {scope !== null && category === null && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BackBtn onClick={() => setScope(null)} />
            <strong style={{ fontSize: 16, color: "var(--c-text-title)" }}>{scopeName(scope)}</strong>
            <span className="menu-desc">{listResources(scope).length} 项</span>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => openUpload(scope, null)}
            style={{ border: "1px dashed var(--c-panel-border)", borderRadius: 14, padding: "14px", background: "transparent", color: "var(--c-text-title)", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: uploading ? 0.5 : 1 }}
          >
            {uploading ? "上传中…" : "上传图片 / 视频 / 语音"}
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {RESOURCE_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                className="g-card"
                onClick={() => setCategory(cat)}
                style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", padding: "14px 12px" }}
              >
                <FolderGlyph />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--c-text-title)" }}>{cat}</span>
                  <span className="menu-desc">{folderCounts[cat] || 0} 项</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {scope !== null && category !== null && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BackBtn onClick={() => setCategory(null)} />
            <strong style={{ fontSize: 16, color: "var(--c-text-title)" }}>{category}</strong>
            <span className="menu-desc">{items.length} 项 · {scopeName(scope)}</span>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => openUpload(scope, category)}
            style={{ border: "1px dashed var(--c-panel-border)", borderRadius: 14, padding: "14px", background: "transparent", color: "var(--c-text-title)", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: uploading ? 0.5 : 1 }}
          >
            {uploading ? "上传中…" : `上传到${category}`}
          </button>
          {items.length === 0 && (
            <p className="text-center ts-13 mt-6 text-secondary">这个类目还没有内容</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {items.map(item => (
              <ResourceTile
                key={item.id}
                item={item}
                confirming={confirmDeleteId === item.id}
                onSaveMeta={saveMeta}
                onAskDelete={() => setConfirmDeleteId(item.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => removeItem(item.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ResourceTile({ item, confirming, onSaveMeta, onAskDelete, onCancelDelete, onConfirmDelete }: {
  item: ResourceItem;
  confirming: boolean;
  onSaveMeta: (item: ResourceItem, patch: { note?: string; category?: string }) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const [note, setNote] = useState(item.note);
  const [category, setCategory] = useState(item.category);
  return (
    <div className="g-card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, overflow: "hidden" }}>
      <div style={{ width: "100%", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "linear-gradient(135deg, rgba(0,0,0,.05), rgba(0,0,0,.02))", display: "grid", placeItems: "center" }}>
        {item.kind === "image" && <img src={item.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {item.kind === "video" && <video src={item.dataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted preload="metadata" />}
        {item.kind === "audio" && <AudioGlyph />}
      </div>
      {item.kind !== "image" && (
        <span className="menu-desc">{item.kind === "video" ? "视频" : "语音"}</span>
      )}
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        onBlur={() => { if (note !== item.note) onSaveMeta(item, { note }); }}
        placeholder="备注：这是什么、何时用…"
        rows={2}
        className="ui-textarea"
        style={{ fontSize: 12 }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={RESOURCE_CATEGORIES.includes(item.category as never) ? category : "其他"}
          onChange={e => { setCategory(e.target.value); onSaveMeta(item, { category: e.target.value }); }}
          className="ui-select"
          style={{ fontSize: 12, flex: 1, minWidth: 0 }}
        >
          {RESOURCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {confirming ? (
          <button type="button" onClick={onConfirmDelete} style={{ border: 0, background: "#e8354b", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 10, padding: "7px 10px", cursor: "pointer" }}>确认</button>
        ) : (
          <button type="button" onClick={onAskDelete} style={{ border: 0, background: "none", color: "#e8354b", fontSize: 12, cursor: "pointer", padding: "7px 4px" }}>删除</button>
        )}
      </div>
      {confirming && (
        <button type="button" onClick={onCancelDelete} style={{ border: 0, background: "none", color: "var(--c-text-secondary)", fontSize: 12, cursor: "pointer" }}>取消删除</button>
      )}
    </div>
  );
}
