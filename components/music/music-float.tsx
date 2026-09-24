// components/music/music-float.tsx — Desktop Dynamic Island music widget
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMusicControlsOptional } from "@/lib/music-context";

const DRAG_START_THRESHOLD = 6;
const SWIPE_DISMISS_EDGE_X = 4;
const SWIPE_DISMISS_SPEED = 1.5; // px/ms
const SWIPE_DISMISS_ARMING_X = 88;
const SWIPE_INERTIA_MS = 140;
const SWIPE_VELOCITY_RECENT_MS = 180;
const ISLAND_TOP = 12;
const COMPACT_WIDTH = 126;

function placeIsland(el: HTMLElement | null, width = COMPACT_WIDTH) {
    const parent = el?.closest("[data-ui='phone-screen']") as HTMLElement | null;
    const screenWidth = parent?.clientWidth || 390;
    return {
        x: Math.max(0, (screenWidth - width) / 2),
        y: ISLAND_TOP,
    };
}

export default function MusicFloat({ hidden }: { hidden?: boolean }) {
    const player = useMusicControlsOptional();
    const floatRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState(() => placeIsland(null));
    const [userMoved, setUserMoved] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{
        pointerId: number | null; active: boolean;
        startX: number; startY: number; origX: number; origY: number;
        lastX: number; lastTime: number;
        lastLeftSpeed: number; lastLeftSpeedTime: number;
        moved: boolean; startedOnInfo: boolean;
    }>({
        pointerId: null,
        active: false,
        startX: 0,
        startY: 0,
        origX: 0,
        origY: 0,
        lastX: 0,
        lastTime: 0,
        lastLeftSpeed: 0,
        lastLeftSpeedTime: 0,
        moved: false,
        startedOnInfo: false,
    });
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [dismissing, setDismissing] = useState(false);

    const clampPos = useCallback((x: number, y: number) => {
        const el = floatRef.current;
        const parent = el?.closest("[data-ui='phone-screen']") as HTMLElement | null;
        if (!el || !parent) return { x, y };
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const ew = el.offsetWidth;
        const eh = el.offsetHeight;
        return {
            x: Math.max(0, Math.min(x, pw - ew)),
            y: Math.max(0, Math.min(y, ph - eh)),
        };
    }, []);

    const snapToIsland = useCallback(() => {
        const el = floatRef.current;
        if (!el) return;
        setPos(placeIsland(el, el.offsetWidth));
    }, []);

    const dismissFloat = useCallback(() => {
        if (!player) return;
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        setDismissing(true);
        dismissTimerRef.current = setTimeout(() => {
            player.dismissFloat();
            setDismissing(false);
            setExpanded(false);
            setUserMoved(false);
            dismissTimerRef.current = null;
        }, 250);
    }, [player]);

    useEffect(() => () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    }, []);

    useEffect(() => {
        if (hidden || !player?.currentTrack || player.floatDismissed || userMoved) return;
        const frame = requestAnimationFrame(() => snapToIsland());
        return () => cancelAnimationFrame(frame);
    }, [expanded, hidden, player?.currentTrack, player?.floatDismissed, snapToIsland, userMoved]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        // Let transport buttons keep their native click behavior.
        if (target.closest("button")) return;
        e.preventDefault();
        e.stopPropagation();
        floatRef.current?.setPointerCapture?.(e.pointerId);
        const now = performance.now();
        dragRef.current = {
            pointerId: e.pointerId,
            active: true,
            startX: e.clientX, startY: e.clientY,
            origX: pos.x, origY: pos.y,
            lastX: e.clientX,
            lastTime: now,
            lastLeftSpeed: 0,
            lastLeftSpeedTime: 0,
            moved: false,
            startedOnInfo: Boolean(target.closest(".music-float-info")),
        };
    }, [pos]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d.active || d.pointerId !== e.pointerId) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) > DRAG_START_THRESHOLD || Math.abs(dy) > DRAG_START_THRESHOLD) d.moved = true;
        if (d.moved) {
            const nextPos = clampPos(d.origX + dx, d.origY + dy);
            const now = performance.now();
            const dt = Math.max(1, now - d.lastTime);
            const stepDx = e.clientX - d.lastX;
            const leftSpeed = stepDx < 0 ? Math.abs(stepDx) / dt : 0;
            if (leftSpeed > 0) {
                d.lastLeftSpeed = leftSpeed;
                d.lastLeftSpeedTime = now;
            }
            d.lastX = e.clientX;
            d.lastTime = now;
            setDragging(true);
            setPos(nextPos);
        }
    }, [clampPos]);

    const finishPointer = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d.active || d.pointerId !== e.pointerId) return;
        if (floatRef.current?.hasPointerCapture?.(e.pointerId)) {
            floatRef.current.releasePointerCapture(e.pointerId);
        }
        d.active = false;
        d.pointerId = null;
        setDragging(false);
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const finalPos = clampPos(d.origX + dx, d.origY + dy);
        const now = performance.now();
        const dt = Math.max(1, now - d.lastTime);
        const stepDx = e.clientX - d.lastX;
        const leftSpeed = stepDx < 0 ? Math.abs(stepDx) / dt : 0;
        const recentMoveSpeed = now - d.lastLeftSpeedTime <= SWIPE_VELOCITY_RECENT_MS ? d.lastLeftSpeed : 0;
        const effectiveLeftSpeed = Math.max(leftSpeed, recentMoveSpeed);
        const inertialX = finalPos.x - effectiveLeftSpeed * SWIPE_INERTIA_MS;
        const shouldDismiss = d.moved
            && finalPos.x <= SWIPE_DISMISS_ARMING_X
            && effectiveLeftSpeed >= SWIPE_DISMISS_SPEED
            && inertialX <= SWIPE_DISMISS_EDGE_X;

        if (shouldDismiss) {
            dismissFloat();
            return;
        }

        if (d.moved) {
            setUserMoved(true);
            setPos(finalPos);
            return;
        }

        if (!d.moved && player) {
            if (d.startedOnInfo) {
                player.openFullPlayer();
                return;
            }

            setExpanded(prev => {
                requestAnimationFrame(() => {
                    const el = floatRef.current;
                    if (!el) return;
                    if (userMoved) {
                        setPos(p => clampPos(p.x, p.y));
                        return;
                    }
                    setPos(placeIsland(el, el.offsetWidth));
                });
                return !prev;
            });
        }
    }, [player, clampPos, dismissFloat, userMoved]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => finishPointer(e), [finishPointer]);
    const handlePointerCancel = useCallback((e: React.PointerEvent) => finishPointer(e), [finishPointer]);

    if (!player || !player.currentTrack || hidden || player.floatDismissed) return null;

    const track = player.currentTrack;

    return (
        <div
            ref={floatRef}
            className="music-float"
            data-island=""
            aria-label="音乐灵动岛"
            {...(expanded ? { "data-expanded": "" } : {})}
            {...(dismissing ? { "data-dismissing": "" } : {})}
            {...(dragging ? { "data-dragging": "" } : {})}
            {...(player.isPlaying ? { "data-playing": "" } : {})}
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
        >
            <div className="music-float-inner">
                <div className="music-float-cover-wrap">
                    {track.coverUrl ? (
                        <img src={track.coverUrl} alt="" className="music-float-cover-img" draggable={false} />
                    ) : (
                        <div className="music-float-cover-placeholder">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                            </svg>
                        </div>
                    )}
                </div>

                <div className="music-float-wave" aria-hidden>
                    <span /><span /><span /><span />
                </div>

                <div className="music-float-info">
                    <div className="music-float-title">{track.title}</div>
                    <div className="music-float-artist">{track.artist}</div>
                </div>

                <div className="music-float-controls">
                    <button className="music-float-btn" onClick={(e) => { e.stopPropagation(); player.prev(); }} aria-label="上一首">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                        </svg>
                    </button>
                    <button className="music-float-btn music-float-btn-play" onClick={(e) => { e.stopPropagation(); player.togglePlay(); }} aria-label={player.isPlaying ? "暂停" : "播放"}>
                        {player.isPlaying ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                            </svg>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>
                    <button className="music-float-btn" onClick={(e) => { e.stopPropagation(); player.next(); }} aria-label="下一首">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
