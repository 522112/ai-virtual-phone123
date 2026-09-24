"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Plus, Trash2 } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import { createOrGetSession, type ChatSession } from "@/lib/chat-storage";
import {
    USER_IDENTITIES_UPDATED_EVENT,
    resolveUserIdentity,
} from "@/lib/settings-storage";
import {
    COUPLE_AVATARS_UPDATED_EVENT,
    addCoupleAvatarPair,
    applyCoupleAvatarPair,
    loadCoupleAvatarPairs,
    removeCoupleAvatarPair,
    sendCoupleAvatarToChat,
    setContactCharacterAvatar,
    setContactUserAvatar,
    type CoupleAvatarPair,
} from "@/lib/couple-avatar-storage";
import type { Character } from "@/lib/character-types";
import type { UserIdentity } from "@/components/settings/user-identity";

type ContactProfilePageProps = {
    characterId: string;
    onBack: () => void;
    onSelectSession: (session: ChatSession) => void;
};

async function fileToAvatarDataUrl(file: File): Promise<string> {
    const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
        reader.readAsDataURL(file);
    });
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片解码失败"));
        img.src = source;
    });
    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return source;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.82);
}

function AvatarSlot({
    label,
    src,
    onPick,
    busy,
}: {
    label: string;
    src?: string | null;
    onPick: (file: File) => void;
    busy?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <button
            type="button"
            className="couple-avatar-slot"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
        >
            <div className="couple-avatar-slot-image">
                {src ? <img src={src} alt="" /> : <ChatFallbackAvatar />}
                {busy && <span className="couple-avatar-slot-busy">处理中</span>}
            </div>
            <span className="couple-avatar-slot-label">{label}</span>
            <span className="couple-avatar-slot-hint">点击更换</span>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) onPick(file);
                }}
            />
        </button>
    );
}

export function ContactProfilePage({ characterId, onBack, onSelectSession }: ContactProfilePageProps) {
    const [character, setCharacter] = useState<Character | null>(() =>
        loadCharacters().find(item => item.id === characterId) || null,
    );
    const [identity, setIdentity] = useState<UserIdentity | null>(() =>
        resolveUserIdentity(characterId, "chat"),
    );
    const [pairs, setPairs] = useState<CoupleAvatarPair[]>(() => loadCoupleAvatarPairs(characterId));
    const [draftUser, setDraftUser] = useState<string | null>(null);
    const [draftCharacter, setDraftCharacter] = useState<string | null>(null);
    const [draftLabel, setDraftLabel] = useState("");
    const [busySide, setBusySide] = useState<"user" | "character" | "draft-user" | "draft-character" | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(() => {
        setCharacter(loadCharacters().find(item => item.id === characterId) || null);
        setIdentity(resolveUserIdentity(characterId, "chat"));
        setPairs(loadCoupleAvatarPairs(characterId));
    }, [characterId]);

    useEffect(() => {
        refresh();
        window.addEventListener(CHARACTERS_UPDATED_EVENT, refresh);
        window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
        window.addEventListener(COUPLE_AVATARS_UPDATED_EVENT, refresh);
        return () => {
            window.removeEventListener(CHARACTERS_UPDATED_EVENT, refresh);
            window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
            window.removeEventListener(COUPLE_AVATARS_UPDATED_EVENT, refresh);
        };
    }, [refresh]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("chat-hide-tabbar", { detail: true }));
        return () => window.dispatchEvent(new CustomEvent("chat-hide-tabbar", { detail: false }));
    }, []);

    const showNotice = (text: string) => {
        setNotice(text);
        window.setTimeout(() => setNotice(current => current === text ? null : current), 2200);
    };

    const pickAndApply = async (side: "user" | "character", file: File) => {
        setBusySide(side);
        try {
            const url = await fileToAvatarDataUrl(file);
            if (side === "user") {
                const pair = setContactUserAvatar(characterId, url);
                showNotice(pair ? "已换上情头，对方也换上了配套的那张" : "已更换我的头像");
            } else {
                setContactCharacterAvatar(characterId, url);
                showNotice("已更换对方头像");
            }
            refresh();
        } catch (error) {
            showNotice(error instanceof Error ? error.message : "图片处理失败");
        } finally {
            setBusySide(null);
        }
    };

    const pickDraft = async (side: "draft-user" | "draft-character", file: File) => {
        setBusySide(side);
        try {
            const url = await fileToAvatarDataUrl(file);
            if (side === "draft-user") setDraftUser(url);
            else setDraftCharacter(url);
        } catch (error) {
            showNotice(error instanceof Error ? error.message : "图片处理失败");
        } finally {
            setBusySide(null);
        }
    };

    const saveDraftPair = () => {
        if (!draftUser || !draftCharacter) {
            showNotice("请先上传双方的情头");
            return;
        }
        const pair = addCoupleAvatarPair({
            characterId,
            userAvatar: draftUser,
            characterAvatar: draftCharacter,
            label: draftLabel,
        });
        if (!pair) {
            showNotice("保存失败");
            return;
        }
        setDraftUser(null);
        setDraftCharacter(null);
        setDraftLabel("");
        refresh();
        showNotice("情头已保存");
    };

    const handleApplyPair = (pairId: string) => {
        applyCoupleAvatarPair(characterId, pairId);
        refresh();
        showNotice("已换上这对比对情头");
    };

    const handleSendPair = (pairId: string) => {
        const sent = sendCoupleAvatarToChat({
            characterId,
            pairId,
            characterName: character?.name,
        });
        if (!sent) {
            showNotice("发送失败");
            return;
        }
        const session = createOrGetSession(characterId);
        onSelectSession(session);
    };

    const wechatId = useMemo(() => character?.wechatID || "N/A", [character?.wechatID]);

    if (!character) {
        return (
            <PageShell title="联系人" onBack={onBack}>
                <div className="ui-empty"><span className="menu-desc">联系人不存在</span></div>
            </PageShell>
        );
    }

    return (
        <PageShell title="联系人" onBack={onBack}>
            <div className="couple-profile-page">
                <div className="couple-profile-hero">
                    <AvatarSlot
                        label={identity?.name || "我"}
                        src={identity?.avatarUrl}
                        busy={busySide === "user"}
                        onPick={file => void pickAndApply("user", file)}
                    />
                    <div className="couple-profile-heart" aria-hidden="true">
                        <Heart size={22} strokeWidth={1.8} />
                    </div>
                    <AvatarSlot
                        label={character.name || "对方"}
                        src={character.avatar}
                        busy={busySide === "character"}
                        onPick={file => void pickAndApply("character", file)}
                    />
                </div>
                <div className="couple-profile-meta">
                    <div className="ts-18 font-bold text-[var(--c-text-title)]">{character.name || "UNNAMED"}</div>
                    <div className="menu-desc">微信号: {wechatId}</div>
                </div>
                <button
                    type="button"
                    className="ui-btn ui-btn-success w-full"
                    onClick={() => onSelectSession(createOrGetSession(characterId))}
                >
                    发消息
                </button>
                <p className="couple-profile-tip">
                    在这里保存双方情头。聊天里发出其中你的那张时，角色会主动换上配套的那张。
                </p>

                <div className="couple-pair-section">
                    <div className="couple-pair-title">情头</div>
                    {pairs.length === 0 && (
                        <div className="menu-desc">还没有保存的情头，下面可以加一对。</div>
                    )}
                    <div className="couple-pair-list">
                        {pairs.map(pair => (
                            <div key={pair.id} className="couple-pair-card">
                                <div className="couple-pair-thumbs">
                                    <img src={pair.userAvatar} alt="" />
                                    <img src={pair.characterAvatar} alt="" />
                                </div>
                                <div className="couple-pair-body">
                                    <div className="couple-pair-name">{pair.label || "未命名情头"}</div>
                                    <div className="couple-pair-actions">
                                        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => handleApplyPair(pair.id)}>换上</button>
                                        <button type="button" className="ui-btn ui-btn-success" onClick={() => handleSendPair(pair.id)}>发给对方</button>
                                        <button
                                            type="button"
                                            className="couple-pair-delete"
                                            onClick={() => { removeCoupleAvatarPair(pair.id); refresh(); }}
                                            aria-label="删除情头"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="couple-pair-section">
                    <div className="couple-pair-title">添加一对情头</div>
                    <div className="couple-profile-hero couple-profile-hero-compact">
                        <AvatarSlot
                            label="我的这张"
                            src={draftUser}
                            busy={busySide === "draft-user"}
                            onPick={file => void pickDraft("draft-user", file)}
                        />
                        <div className="couple-profile-heart" aria-hidden="true">
                            <Plus size={20} strokeWidth={1.8} />
                        </div>
                        <AvatarSlot
                            label="对方那张"
                            src={draftCharacter}
                            busy={busySide === "draft-character"}
                            onPick={file => void pickDraft("draft-character", file)}
                        />
                    </div>
                    <input
                        className="ui-input w-full"
                        value={draftLabel}
                        onChange={event => setDraftLabel(event.target.value)}
                        placeholder="备注，比如春日情头"
                    />
                    <button type="button" className="ui-btn ui-btn-success w-full" onClick={saveDraftPair}>
                        保存这对情头
                    </button>
                </div>
                {notice && <div className="couple-profile-toast">{notice}</div>}
            </div>
        </PageShell>
    );
}
