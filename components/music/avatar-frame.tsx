"use client";

import { useEffect, useRef, useState } from "react";
import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";
import {
    applyAvatarFramePreset,
    deleteAvatarFramePreset,
    getAppliedAvatarFrame,
    getAppliedAvatarFrameTargetId,
    listAvatarFramePresets,
    saveAvatarFramePreset,
    type AvatarFramePreset,
    type AvatarFrameTarget,
} from "@/lib/listen-together-storage";

/** 带头像框的头像：头像底图 + 叠加当前应用的 PNG 头像框（可缩放/平移） */
export function FramedAvatar({ avatarUrl, target, className, imgClassName }: {
    avatarUrl?: string | null;
    target: AvatarFrameTarget;
    className?: string;
    imgClassName?: string;
}) {
    const [frame, setFrame] = useState<AvatarFramePreset | null>(() => getAppliedAvatarFrame(target));
    useEffect(() => {
        const refresh = () => setFrame(getAppliedAvatarFrame(target));
        refresh();
        window.addEventListener("avatar-frame-updated", refresh);
        return () => window.removeEventListener("avatar-frame-updated", refresh);
    }, [target]);
    return (
        <span className={`avatar-framed${frame ? " has-frame" : ""}${className ? ` ${className}` : ""}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" className={imgClassName} /> : <ChatFallbackAvatar />}
            {frame ? (
                <img
                    src={frame.frameUrl}
                    alt=""
                    className="avatar-frame-png"
                    style={{ transform: `translate(${frame.offsetX}%, ${frame.offsetY}%) scale(${frame.scale})` }}
                />
            ) : null}
        </span>
    );
}

const EMPTY = { frameUrl: "", scale: 1, offsetX: 0, offsetY: 0 };

/** 头像框：上传 PNG、滑杆裁剪成方案、存入方案库，选择“我/角色”应用；方案全局可复用 */
export function AvatarFrameEditor({ characterName, myAvatar, characterAvatar, onClose }: {
    characterName?: string;
    myAvatar?: string | null;
    characterAvatar?: string | null;
    onClose: () => void;
}) {
    const [target, setTarget] = useState<AvatarFrameTarget>("me");
    const [presets, setPresets] = useState<AvatarFramePreset[]>(() => listAvatarFramePresets());
    const [appliedId, setAppliedId] = useState<string | null>(() => getAppliedAvatarFrameTargetId("me"));
    const [draft, setDraft] = useState({ ...EMPTY });
    const [name, setName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const refresh = () => setPresets(listAvatarFramePresets());
        window.addEventListener("avatar-frame-updated", refresh);
        return () => window.removeEventListener("avatar-frame-updated", refresh);
    }, []);

    useEffect(() => {
        setAppliedId(getAppliedAvatarFrameTargetId(target));
    }, [target, presets]);

    const patch = (part: Partial<typeof EMPTY>) => setDraft(prev => ({ ...prev, ...part }));

    const onPickFile = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { if (typeof reader.result === "string") patch({ frameUrl: reader.result }); };
        reader.readAsDataURL(file);
    };

    const savePreset = () => {
        if (!draft.frameUrl) return;
        const saved = saveAvatarFramePreset({ id: editingId || undefined, name: name || undefined, ...draft });
        setPresets(listAvatarFramePresets());
        setDraft({ ...EMPTY });
        setName("");
        setEditingId(null);
        applyAvatarFramePreset(target, saved.id);
        setAppliedId(saved.id);
    };

    const applyPreset = (id: string) => {
        applyAvatarFramePreset(target, id);
        setAppliedId(id);
    };
    const editPreset = (item: AvatarFramePreset) => {
        setDraft({ frameUrl: item.frameUrl, scale: item.scale, offsetX: item.offsetX, offsetY: item.offsetY });
        setName(item.name);
        setEditingId(item.id);
    };
    const clearApplied = () => {
        applyAvatarFramePreset(target, null);
        setAppliedId(null);
    };

    const previewAvatar = target === "me" ? myAvatar : characterAvatar;

    return (
        <div className="ltp-sheet-mask" onClick={onClose}>
            <div className="ltp-sheet ltp-frame-sheet" onClick={e => e.stopPropagation()}>
                <div className="ltp-sheet-head">
                    <span className="ltp-sheet-title">头像框</span>
                    <button type="button" className="ltp-x" onClick={onClose} aria-label="关闭">×</button>
                </div>
                <div className="ltp-frame-targets">
                    <button type="button" data-active={target === "me" ? "" : undefined} onClick={() => setTarget("me")}>我的</button>
                    <button type="button" data-active={target === "character" ? "" : undefined} onClick={() => setTarget("character")}>{characterName || "角色"}的</button>
                </div>

                <div className="ltp-frame-scroll">
                    <div className="ltp-frame-preview">
                        <span className="ltp-frame-preview-avatar">
                            {previewAvatar ? <img src={previewAvatar} alt="" /> : <ChatFallbackAvatar />}
                            {draft.frameUrl ? (
                                <img
                                    src={draft.frameUrl}
                                    alt=""
                                    className="avatar-frame-png"
                                    style={{ transform: `translate(${draft.offsetX}%, ${draft.offsetY}%) scale(${draft.scale})` }}
                                />
                            ) : null}
                        </span>
                    </div>
                    <div className="ltp-frame-controls">
                        <label className="ltp-frame-row">
                            <span>大小</span>
                            <input type="range" min={0.4} max={2.2} step={0.02} value={draft.scale} onChange={e => patch({ scale: Number(e.target.value) })} />
                        </label>
                        <label className="ltp-frame-row">
                            <span>左右%</span>
                            <input type="range" min={-80} max={80} step={1} value={draft.offsetX} onChange={e => patch({ offsetX: Number(e.target.value) })} />
                        </label>
                        <label className="ltp-frame-row">
                            <span>上下%</span>
                            <input type="range" min={-80} max={80} step={1} value={draft.offsetY} onChange={e => patch({ offsetY: Number(e.target.value) })} />
                        </label>
                    </div>
                    <div className="ltp-frame-actions">
                        <button type="button" className="ltp-frame-upload" onClick={() => fileRef.current?.click()}>上传PNG</button>
                        <button type="button" className="ltp-frame-save" disabled={!draft.frameUrl} onClick={savePreset}>{editingId ? "保存修改" : "保存为方案"}</button>
                    </div>
                    {editingId && (
                        <div className="ltp-frame-editing">正在修改「{name}」，调完点保存修改<button type="button" onClick={() => { setEditingId(null); setDraft({ ...EMPTY }); setName(""); }}>取消</button></div>
                    )}

                    <div className="ltp-frame-lib-title">方案库（可多用）</div>
                    {presets.length === 0 && <div className="ltp-sheet-empty">还没有保存的方案</div>}
                    <div className="ltp-frame-lib">
                        {presets.map(item => (
                            <div key={item.id} className="ltp-frame-item" data-active={item.id === appliedId ? "" : undefined}>
                                <span className="ltp-frame-item-dot">
                                    {previewAvatar ? <img src={previewAvatar} alt="" /> : <ChatFallbackAvatar />}
                                    <img src={item.frameUrl} alt="" className="avatar-frame-png" style={{ transform: `translate(${item.offsetX}%, ${item.offsetY}%) scale(${item.scale})` }} />
                                </span>
                                <span className="ltp-frame-item-name">{item.name}</span>
                                <button type="button" className="ltp-frame-item-edit" onClick={() => editPreset(item)}>编辑</button>
                                <button type="button" className="ltp-frame-item-use" onClick={() => applyPreset(item.id)}>{item.id === appliedId ? "已用" : "使用"}</button>
                                <button type="button" className="ltp-frame-item-del" onClick={() => { deleteAvatarFramePreset(item.id); setPresets(listAvatarFramePresets()); }}>删</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="ltp-frame-actions">
                    <button type="button" className="ltp-frame-clear" onClick={clearApplied}>取消应用</button>
                    <button type="button" className="ltp-frame-save" onClick={onClose}>完成</button>
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/*"
                    style={{ display: "none" }}
                    onChange={e => onPickFile(e.target.files?.[0] || null)}
                />
            </div>
        </div>
    );
}
