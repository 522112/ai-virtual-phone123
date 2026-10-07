"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import { createOrGetSession, type ChatSession } from "@/lib/chat-storage";
import { ensureSubSession } from "@/lib/sub-friend-engine";
import {
    USER_IDENTITIES_UPDATED_EVENT,
    resolveUserIdentity,
} from "@/lib/settings-storage";
import { getActiveSub } from "./sub-account-sheet";
import {
    COUPLE_AVATARS_UPDATED_EVENT,
    overlayCharacterForDisplay,
    overlayUserIdentityForDisplay,
    setContactCharacterAvatar,
    setContactUserAvatar,
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
    const [character, setCharacter] = useState<Character | null>(() => {
        const raw = loadCharacters().find(item => item.id === characterId) || null;
        return raw ? overlayCharacterForDisplay(raw) : null;
    });
    const [identity, setIdentity] = useState<UserIdentity | null>(() =>
        overlayUserIdentityForDisplay(characterId, resolveSubAwareIdentity(characterId)),
    );
    const [busySide, setBusySide] = useState<"user" | "character" | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [activeSubId, setActiveSubId] = useState<string | null>(() => getActiveSub()?.id || null);

    function resolveSubAwareIdentity(cid: string): UserIdentity {
        const sub = getActiveSub();
        const base = resolveUserIdentity(cid, "chat");
        if (!sub) return base;
        return { ...base, name: sub.name, screenName: sub.name, avatarUrl: sub.avatar || undefined };
    }

    const refresh = useCallback(() => {
        const raw = loadCharacters().find(item => item.id === characterId) || null;
        setCharacter(raw ? overlayCharacterForDisplay(raw) : null);
        const sub = getActiveSub();
        const overlaid = overlayUserIdentityForDisplay(characterId, resolveSubAwareIdentity(characterId));
        // 小号模式我这边强制显示小号头像，不吃主号的情头覆盖
        if (sub && overlaid) {
            overlaid.avatarUrl = sub.avatar || undefined;
            overlaid.name = sub.name;
        }
        setIdentity(overlaid);
        setActiveSubId(sub?.id || null);
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
        return () => {
            window.dispatchEvent(new CustomEvent("chat-hide-tabbar", { detail: false }));
        };
    }, []);

    const showNotice = (text: string) => {
        setNotice(text);
        window.setTimeout(() => setNotice(current => current === text ? null : current), 2200);
    };

    const pickAndApply = async (side: "user" | "character", file: File) => {
        // 小号模式：不能改对方头像（除非角色自己换）；我这边显示小号头像
        if (side === "character" && getActiveSub()) {
            showNotice("小号不能改对方头像");
            return;
        }
        if (side === "user" && getActiveSub()) {
            try {
                const url = await fileToAvatarDataUrl(file);
                const { updateUserSubAccount } = await import("@/lib/sub-accounts");
                const sub = getActiveSub();
                if (sub) updateUserSubAccount(sub.id, { avatar: url });
                showNotice("已更换小号头像");
                refresh();
            } catch (error) {
                showNotice(error instanceof Error ? error.message : "图片处理失败");
            }
            return;
        }
        setBusySide(side);
        try {
            const url = await fileToAvatarDataUrl(file);
            if (side === "user") {
                setContactUserAvatar(characterId, url);
                showNotice("已更换我这边的头像，只对这个角色生效");
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
                    onClick={() => {
                        if (activeSubId) {
                            try {
                                onSelectSession(ensureSubSession(characterId, activeSubId));
                            } catch (error) {
                                showNotice(error instanceof Error ? error.message : "打开失败");
                            }
                            return;
                        }
                        onSelectSession(createOrGetSession(characterId));
                    }}
                >
                    发消息
                </button>
                {notice && <div className="couple-profile-toast">{notice}</div>}
            </div>
        </PageShell>
    );
}
