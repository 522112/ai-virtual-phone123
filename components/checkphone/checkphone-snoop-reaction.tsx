"use client";

import { useEffect, useRef, useState } from "react";
import type { Character } from "@/lib/character-types";
import { ChatFallbackAvatar } from "@/components/chat/chat-fallback-avatar";

export const CHECKPHONE_FLIP_EVENT = "checkphone-snoop-flip";

export type CheckPhoneFlipDetail = {
    characterId: string;
    characterName: string;
    characterAvatar: string | null;
    appLabel: string;
    contentLabel: string;
    text: string;
};

export function emitCheckPhoneFlip(detail: CheckPhoneFlipDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<CheckPhoneFlipDetail>(CHECKPHONE_FLIP_EVENT, { detail }));
}

function pick<T>(list: T[], seed: number): T {
    return list[Math.abs(seed) % list.length];
}

function hashSeed(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return hash;
}

/**
 * 按角色人设拼一条翻看反应（质问/吃醋/好奇都按人设走，离线模板不调模型）。
 * persona/personality 命中关键词决定口吻，命中不到走默认"质问+好奇"。
 */
export function buildSnoopReactionText(
    character: Pick<Character, "name" | "persona" | "personality">,
    appLabel: string,
    contentLabel: string,
): string {
    const target = contentLabel || `${appLabel}首页`;
    const seed = hashSeed(`${character.name}|${appLabel}|${target}|${Date.now() >> 14}`);
    const haystack = `${character.persona || ""} ${character.personality || ""}`;

    if (/病娇|偏执|占有欲|黑化|疯批|嫉妒/.test(haystack)) {
        return pick([
            `还敢看${target}？说清楚，不然今晚别想睡。`,
            `哼，${target}有什么好看的……给我解释一下。`,
            `这个${target}，你最好现在就交代清楚。`,
        ], seed);
    }
    if (/傲娇|傲|口是心非|毒舌/.test(haystack)) {
        return pick([
            `哼，才、才不是在意呢……不过${target}是什么？勉强听你解释一下。`,
            `别以为我没看见，${target}给我老实交代。`,
            `切，又在偷看${target}？算了，说来听听。`,
        ], seed);
    }
    if (/温柔|体贴|治愈|暖|贤惠/.test(haystack)) {
        return pick([
            `诶？${target}看起来有意思，能讲给我听听吗？`,
            `原来你在看${target}呀，我也想看看。`,
            `${target}……有点好奇，能分享给我吗？`,
        ], seed);
    }
    if (/活泼|元气|开朗|话痨|社牛|可爱|软/.test(haystack)) {
        return pick([
            `哇——${target}！快给我讲讲！`,
            `嘿嘿，被我抓到啦，你在看${target}对不对？`,
            `${target}？${target}？让我也康康！`,
        ], seed);
    }
    if (/高冷|冷漠|淡漠|冰山|面瘫|少言/.test(haystack)) {
        return pick([
            `……${target}。解释。`,
            `${target}？说。`,
            `嗯，看到了。${target}是怎么回事。`,
        ], seed);
    }
    return pick([
        `等等，${target}是什么？给我解释一下。`,
        `哼，翻到${target}了？老实交代。`,
        `这个${target}……你最好给我说清楚。`,
        `先别划，${target}是怎么回事？`,
    ], seed);
}

/**
 * 子页面翻动上报：flipKey 变化（切 tab/点开详情/换照片等）即视为"翻了一页"，
 * 冒泡一层角色头像反应。首挂载不触发（进入 App 那一下由外层统一报）。
 */
export function useSnoopFlip(
    character: Pick<Character, "id" | "name" | "avatar" | "persona" | "personality"> | null | undefined,
    appLabel: string,
    flipKey: string,
    contentLabel: string,
): void {
    const mountedRef = useRef(false);
    const lastKeyRef = useRef("");
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            lastKeyRef.current = flipKey;
            return;
        }
        if (!character || !flipKey || flipKey === lastKeyRef.current) return;
        lastKeyRef.current = flipKey;
        emitCheckPhoneFlip({
            characterId: character.id,
            characterName: character.name,
            characterAvatar: character.avatar || null,
            appLabel,
            contentLabel,
            text: buildSnoopReactionText(character, appLabel, contentLabel),
        });
    }, [character, appLabel, flipKey, contentLabel]);
}

const SNOOP_BUBBLE_TTL_MS = 4500;

export function CheckPhoneSnoopLayer() {
    const [flip, setFlip] = useState<(CheckPhoneFlipDetail & { seq: number }) | null>(null);
    const [visible, setVisible] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<CheckPhoneFlipDetail>).detail;
            if (!detail?.text) return;
            seqRef.current += 1;
            if (timerRef.current) clearTimeout(timerRef.current);
            setFlip({ ...detail, seq: seqRef.current });
            setVisible(true);
            timerRef.current = setTimeout(() => setVisible(false), SNOOP_BUBBLE_TTL_MS);
        };
        window.addEventListener(CHECKPHONE_FLIP_EVENT, handler);
        return () => {
            window.removeEventListener(CHECKPHONE_FLIP_EVENT, handler);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    if (!flip) return null;

    return (
        <>
            {/* 翻页划痕：模拟手指划过屏幕的一道光，key 变化即重播 */}
            <div key={`swipe-${flip.seq}`} className="cp-snoop-swipe" aria-hidden="true" />
            {/* 左下角角色头像气泡 */}
            <div
                key={`bubble-${flip.seq}`}
                className="cp-snoop-bubble"
                data-visible={visible ? "true" : "false"}
                aria-live="polite"
            >
                <span className="cp-snoop-avatar" aria-hidden="true">
                    {flip.characterAvatar
                        ? <img src={flip.characterAvatar} alt="" />
                        : <ChatFallbackAvatar />}
                </span>
                <span className="cp-snoop-text">
                    <span className="cp-snoop-name">{flip.characterName} · 正在翻{flip.appLabel}</span>
                    <span className="cp-snoop-say">{flip.text}</span>
                </span>
            </div>
            <style>{`
.cp-snoop-swipe{position:absolute;inset:0;z-index:60;pointer-events:none;overflow:hidden}
.cp-snoop-swipe::after{content:"";position:absolute;top:-10%;bottom:-10%;left:0;width:34%;
background:linear-gradient(100deg,transparent,rgba(255,255,255,0.22),transparent);
transform:translateX(-120%) skewX(-12deg);animation:cpSnoopSwipe 0.55s ease-out forwards}
@keyframes cpSnoopSwipe{from{transform:translateX(-120%) skewX(-12deg)}to{transform:translateX(340%) skewX(-12deg)}}
.cp-snoop-bubble{position:absolute;left:10px;bottom:12px;z-index:61;max-width:78%;
display:flex;align-items:flex-end;gap:8px;pointer-events:none;
opacity:0;transform:translateY(14px) scale(0.92);transform-origin:bottom left;
transition:opacity 0.22s ease,transform 0.25s cubic-bezier(0.2,0.9,0.3,1.25)}
.cp-snoop-bubble[data-visible="true"]{opacity:1;transform:none}
.cp-snoop-avatar{width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;
border:2px solid rgba(255,255,255,0.85);box-shadow:0 4px 14px rgba(0,0,0,0.35);background:rgba(255,255,255,0.2)}
.cp-snoop-avatar img{width:100%;height:100%;object-fit:cover;display:block}
.cp-snoop-text{display:flex;flex-direction:column;gap:2px;background:rgba(255,255,255,0.96);color:#222;
border-radius:4px 16px 16px 16px;padding:8px 12px;box-shadow:0 6px 20px rgba(0,0,0,0.3);
font-size:12.5px;line-height:1.55;position:relative}
.cp-snoop-name{font-size:10.5px;color:#999}
.cp-snoop-say{color:#222}
`}</style>
        </>
    );
}
