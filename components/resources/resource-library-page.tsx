"use client";

import { useMemo, useRef, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
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

export function ResourceLibraryPage({ onNotice }: { onNotice?: (msg: string) => void }) {
  const characters = useMemo(() => loadCharacters(), []);
  const [scope, setScope] = useState<string>(
    characters[0]?.id || RESOURCE_LIBRARY_SHARED_SCOPE,
  );
  const [tick, setTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => listResources(scope), [scope, tick]);
  const scopeName = scope === RESOURCE_LIBRARY_SHARED_SCOPE
    ? "共享分区"
    : characters.find(c => c.id === scope)?.name || "角色分区";

  const notice = (msg: string) => onNotice?.(msg);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
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
        addResource({ scope, kind, dataUrl });
      }
      setTick(n => n + 1);
      notice("已加入资源库，记得写备注和分类");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 24 }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {characters.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setScope(c.id)}
            style={{
              flexShrink: 0,
              border: scope === c.id ? "1px solid #e85a6e" : "1px solid var(--c-panel-border)",
              background: scope === c.id ? "rgba(232,90,110,.12)" : "transparent",
              color: "var(--c-text-title)",
              borderRadius: 16,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: scope === c.id ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setScope(RESOURCE_LIBRARY_SHARED_SCOPE)}
          style={{
            flexShrink: 0,
            border: scope === RESOURCE_LIBRARY_SHARED_SCOPE ? "1px solid #e85a6e" : "1px solid var(--c-panel-border)",
            background: scope === RESOURCE_LIBRARY_SHARED_SCOPE ? "rgba(232,90,110,.12)" : "transparent",
            color: "var(--c-text-title)",
            borderRadius: 16,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: scope === RESOURCE_LIBRARY_SHARED_SCOPE ? 700 : 400,
            cursor: "pointer",
          }}
        >
          共享分区
        </button>
      </div>

      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        style={{
          border: "1px dashed var(--c-panel-border)",
          borderRadius: 14,
          padding: "14px",
          background: "transparent",
          color: "var(--c-text-title)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          opacity: uploading ? 0.5 : 1,
        }}
      >
        {uploading ? "上传中…" : `上传到${scopeName}（图片/视频/语音）`}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        style={{ display: "none" }}
        onChange={e => void handleFiles(e.target.files)}
      />

      {items.length === 0 && (
        <p className="text-center ts-13 mt-6 text-secondary">
          {scopeName}还没有资源，点上面上传吧
        </p>
      )}

      {items.map(item => (
        <ResourceCard
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
  );
}

function ResourceCard({ item, confirming, onSaveMeta, onAskDelete, onCancelDelete, onConfirmDelete }: {
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
    <div className="g-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,.06)", flexShrink: 0, display: "grid", placeItems: "center" }}>
          {item.kind === "image" && <img src={item.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {item.kind === "video" && <video src={item.dataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted preload="metadata" />}
          {item.kind === "audio" && <span style={{ fontSize: 26 }}>🎵</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <select
            value={RESOURCE_CATEGORIES.includes(item.category as never) ? category : "其他"}
            onChange={e => { setCategory(e.target.value); onSaveMeta(item, { category: e.target.value }); }}
            className="ui-select"
            style={{ fontSize: 13 }}
          >
            {RESOURCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => { if (note !== item.note) onSaveMeta(item, { note }); }}
            placeholder="备注：这是什么、什么时候用…"
            rows={2}
            className="ui-textarea"
            style={{ fontSize: 13 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {confirming ? (
          <>
            <button type="button" onClick={onCancelDelete} className="ui-btn ui-btn-ghost" style={{ fontSize: 12 }}>取消</button>
            <button type="button" onClick={onConfirmDelete} className="ui-btn" style={{ fontSize: 12, background: "#e8354b", color: "#fff" }}>确认删除</button>
          </>
        ) : (
          <button type="button" onClick={onAskDelete} className="ui-btn ui-btn-ghost" style={{ fontSize: 12, color: "#e8354b" }}>删除</button>
        )}
      </div>
    </div>
  );
}
