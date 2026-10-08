"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { MomentTextThumb } from "./moment-text-thumb";
import { PeerHomepage } from "./peer-homepage";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import { createOrGetSession, type ChatSession } from "@/lib/chat-storage";
import { ensureSubSession } from "@/lib/sub-friend-engine";
import { USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import { getActiveSub } from "./sub-account-sheet";
import { getAllPosts } from "@/lib/moments-storage";
import { generateMomentsBackfill } from "@/lib/moments-backfill";
import {
    COUPLE_AVATARS_UPDATED_EVENT,
    overlayCharacterForDisplay,
} from "@/lib/couple-avatar-storage";
import type { Character } from "@/lib/character-types";

type ContactProfilePageProps = {
    characterId: string;
    onBack: () => void;
    onSelectSession: (session: ChatSession) => void;
};

export function ContactProfilePage({ characterId, onBack, onSelectSession }: ContactProfilePageProps) {
    const [character, setCharacter] = useState<Character | null>(() => {
        const raw = loadCharacters().find(item => item.id === characterId) || null;
        return raw ? overlayCharacterForDisplay(raw) : null;
    });
    const [notice, setNotice] = useState<string | null>(null);
    const [activeSubId, setActiveSubId] = useState<string | null>(() => getActiveSub()?.id || null);
    const [showMoments, setShowMoments] = useState(false);
    const [postsTick, setPostsTick] = useState(0);
    const [backfilling, setBackfilling] = useState(false);

    const refresh = useCallback(() => {
        const raw = loadCharacters().find(item => item.id === characterId) || null;
        setCharacter(raw ? overlayCharacterForDisplay(raw) : null);
        setActiveSubId(getActiveSub()?.id || null);
        setPostsTick(t => t + 1);
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

    // 棰勮瑕佺敤鍒板姩鎬侊細娌″姩鎬佸氨涓€娆¤皟鐢ㄥ洖濉?5-10 鏉★紙璺熸湅鍙嬪湀椤靛叡鐢ㄥ悓涓€浠斤級
    useEffect(() => {
        let cancelled = false;
        try {
            const existing = getAllPosts().filter(p => p.authorType === "character" && p.authorId === characterId);
            if (existing.length > 0) return;
        } catch {
            return;
        }
        setBackfilling(true);
        void generateMomentsBackfill(characterId)
            .catch(() => {})
            .finally(() => {
                if (cancelled) return;
                setBackfilling(false);
                setPostsTick(t => t + 1);
            });
        return () => { cancelled = true; };
    }, [characterId]);

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

    const wechatId = useMemo(() => character?.wechatID || "N/A", [character?.wechatID]);
    const region = character?.profileRegion || "涓浗澶ч檰";
    // 棰勮鍙敹鏈夊浘鍔ㄦ€侊紙瀹炲浘鎴栨枃瀛楀浘锛夛紝绾枃瀛椾笉鍗犱綅
    const previewPosts = useMemo(() => {
        try {
            return getAllPosts()
                .filter(p => p.authorType === "character" && p.authorId === characterId && (p.photoUrl || p.photoDescription))
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                .slice(0, 4);
        } catch {
            return [];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [characterId, postsTick]);

    const openSession = () => {
        if (activeSubId) {
            try {
                onSelectSession(ensureSubSession(characterId, activeSubId));
            } catch (error) {
                showNotice(error instanceof Error ? error.message : "鎵撳紑澶辫触");
            }
            return;
        }
        onSelectSession(createOrGetSession(characterId));
    };

    if (!character) {
        return (
            <PageShell title="鑱旂郴浜? onBack={onBack}>
                <div className="ui-empty"><span className="menu-desc">鑱旂郴浜轰笉瀛樺湪</span></div>
            </PageShell>
        );
    }

    return (
        <PageShell title="鑱旂郴浜? onBack={onBack}>
            <div className="wx-profile">
                <div className="wx-profile-head">
                    <span className="wx-profile-avatar">
                        {character.avatar ? <img src={character.avatar} alt="" /> : <ChatFallbackAvatar />}
                    </span>
                    <div className="wx-profile-id">
                        <div className="wx-profile-name">{character.name || "瀵规柟"}</div>
                        <div className="wx-profile-line">寰俊鍙凤細{wechatId}</div>
                        <div className="wx-profile-line">鍦板尯锛歿region}</div>
                    </div>
                </div>
                <button type="button" className="wx-profile-moments" onClick={() => setShowMoments(true)}>
                    <span>鏈嬪弸鍦?/span>
                    <span className="wx-profile-thumbs">
                        {backfilling ? (
                            <small className="menu-desc">姝ｅ湪鐢熸垚鈥?/small>
                        ) : previewPosts.length === 0 ? null : (
                            previewPosts.map(p => (
                                p.photoUrl
                                    ? <img key={p.id} src={p.photoUrl} alt="" />
                                    : <MomentTextThumb key={p.id} text={p.photoDescription || p.content} size={48} radius={4} />
                            ))
                        )}
                    </span>
                    <span className="wx-profile-go">鈥?/span>
                </button>
                <button type="button" className="wx-profile-send" onClick={openSession}>
                    <span className="wx-profile-send-icon">馃挰</span> 鍙戞秷鎭?
                </button>
                {notice && <div className="couple-profile-toast">{notice}</div>}
            </div>
            {showMoments && (
                <PeerHomepage
                    characterId={characterId}
                    onClose={() => setShowMoments(false)}
                    onMessage={() => { setShowMoments(false); openSession(); }}
                />
            )}
        </PageShell>
    );
}
