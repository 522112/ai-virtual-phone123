"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusicIslandBody } from "@/components/music/music-float";
import { useMusicControlsOptional } from "@/lib/music-context";

const SWIPE_DISMISS_Y = -44;
const DRAG_THRESHOLD = 6;

export type IslandIncomingCall = {
  sessionId: string;
  type: "voice" | "video";
  charName: string;
  charAvatar: string | null;
  isGroup?: boolean;
};

export type IslandChatNotice = {
  sessionId: string;
  title: string;
  body: string;
  avatar: string | null;
  isGroup?: boolean;
};

type IslandActivity = "call" | "message" | "toast" | "music" | "idle";

type PhoneDynamicIslandProps = {
  incomingCall: IslandIncomingCall | null;
  onAcceptCall: () => void;
  onDeclineCall: () => void;
  chatNotice: IslandChatNotice | null;
  onOpenNotice: () => void;
  onDismissNotice: () => void;
  onHoldNotice?: () => void;
  onReleaseNotice?: () => void;
  toast: string | null;
  hideIdle?: boolean;
  musicHidden?: boolean;
};

function initials(label: string, fallback: string) {
  return (label.trim()[0] || fallback).toUpperCase();
}

export function PhoneDynamicIsland({
  incomingCall,
  onAcceptCall,
  onDeclineCall,
  chatNotice,
  onOpenNotice,
  onDismissNotice,
  onHoldNotice,
  onReleaseNotice,
  toast,
  hideIdle = false,
  musicHidden = false,
}: PhoneDynamicIslandProps) {
  const player = useMusicControlsOptional();
  const [musicExpanded, setMusicExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef({
    active: false,
    startY: 0,
    dy: 0,
    far: false,
    pointerId: null as number | null,
  });
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const musicTrack = !musicHidden && player && !player.floatDismissed && !player.showFullPlayer
    ? player.currentTrack
    : null;

  const activity = useMemo<IslandActivity | null>(() => {
    if (incomingCall) return "call";
    if (chatNotice) return "message";
    if (toast) return "toast";
    if (musicTrack) return "music";
    if (hideIdle) return null;
    return "idle";
  }, [incomingCall, chatNotice, toast, musicTrack, hideIdle]);

  const expanded = activity === "call" || activity === "message" || activity === "toast"
    || (activity === "music" && musicExpanded);

  useEffect(() => {
    if (activity !== "music") setMusicExpanded(false);
  }, [activity]);

  useEffect(() => {
    setDismissing(false);
    setDragging(false);
    setDragY(0);
    dragRef.current = { active: false, startY: 0, dy: 0, far: false, pointerId: null };
  }, [activity, chatNotice?.sessionId, toast]);

  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  const finishDismiss = useCallback((action: () => void) => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setDismissing(true);
    dismissTimerRef.current = setTimeout(() => {
      action();
      setDismissing(false);
      setDragY(0);
      dismissTimerRef.current = null;
    }, 220);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (activity !== "message" && activity !== "music") return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startY: e.clientY,
      dy: 0,
      far: false,
      pointerId: e.pointerId,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (activity === "message") {
      setDragging(true);
      onHoldNotice?.();
    }
  }, [activity, onHoldNotice]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    if (activity !== "message") return;
    let dy = e.clientY - drag.startY;
    if (dy > 0) dy = Math.min(10, dy * 0.28);
    drag.dy = dy;
    if (Math.abs(dy) > DRAG_THRESHOLD) drag.far = true;
    setDragY(dy);
  }, [activity]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || (drag.pointerId !== null && drag.pointerId !== e.pointerId)) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.active = false;
    drag.pointerId = null;
    setDragging(false);

    if (activity === "message") {
      if (drag.dy < SWIPE_DISMISS_Y) {
        setDragY(-160);
        finishDismiss(onDismissNotice);
        return;
      }
      setDragY(0);
      onReleaseNotice?.();
      if (!drag.far) onOpenNotice();
      drag.far = false;
      return;
    }

    if (activity === "music" && player && !drag.far) {
      if (musicExpanded) {
        player.openFullPlayer();
        setMusicExpanded(false);
        return;
      }
      setMusicExpanded(true);
    }
    drag.far = false;
  }, [activity, finishDismiss, musicExpanded, onDismissNotice, onOpenNotice, onReleaseNotice, player]);

  if (!activity) return null;

  const ariaLabel = activity === "call"
    ? `${incomingCall?.charName || "来电"} ${incomingCall?.type === "video" ? "视频通话" : "语音通话"}`
    : activity === "message"
      ? `${chatNotice?.title || "新消息"}：${chatNotice?.body || ""}`
      : activity === "toast"
        ? toast || "通知"
        : activity === "music"
          ? `正在播放 ${musicTrack?.title || "音乐"}`
          : "灵动岛";

  return (
    <>
    {activity === "music" && musicExpanded ? (
      <button
        type="button"
        className="phone-island-music-backdrop"
        aria-label="收起灵动岛"
        onClick={() => setMusicExpanded(false)}
      />
    ) : null}
    <div
      className="phone-dynamic-island"
      data-island=""
      data-activity={activity}
      aria-label={ariaLabel}
      role={activity === "message" || activity === "music" ? "button" : "status"}
      {...(expanded ? { "data-expanded": "" } : {})}
      {...(dismissing ? { "data-dismissing": "" } : {})}
      {...(dragging ? { "data-dragging": "" } : {})}
      {...(activity === "music" && player?.isPlaying ? { "data-playing": "" } : {})}
      style={{ "--island-drag-y": `${dragY}px` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="phone-dynamic-island-inner">
        {activity === "call" && incomingCall ? (
          <>
            <div className="phone-island-leading">
              {incomingCall.charAvatar ? (
                <img src={incomingCall.charAvatar} alt="" className="phone-island-avatar" />
              ) : (
                <span className="phone-island-avatar phone-island-avatar-fallback">
                  {initials(incomingCall.charName, "?")}
                </span>
              )}
              <span className="phone-island-call-pulse" aria-hidden />
            </div>
            <div className="phone-island-copy">
              <span className="phone-island-title">{incomingCall.charName}</span>
              <span className="phone-island-subtitle">
                {incomingCall.isGroup ? "群" : ""}
                {incomingCall.type === "voice" ? "语音通话" : "视频通话"}
              </span>
            </div>
            <div className="phone-island-actions">
              <button
                type="button"
                className="phone-island-btn phone-island-btn-decline"
                aria-label="拒绝来电"
                onClick={(e) => { e.stopPropagation(); onDeclineCall(); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
              </button>
              <button
                type="button"
                className="phone-island-btn phone-island-btn-accept"
                aria-label="接听来电"
                onClick={(e) => { e.stopPropagation(); onAcceptCall(); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </button>
            </div>
          </>
        ) : null}

        {activity === "message" && chatNotice ? (
          <>
            <div className="phone-island-leading">
              {chatNotice.avatar ? (
                <img src={chatNotice.avatar} alt="" className="phone-island-avatar" />
              ) : (
                <span className="phone-island-avatar phone-island-avatar-fallback">
                  {initials(chatNotice.title, "消")}
                </span>
              )}
            </div>
            <div className="phone-island-copy">
              <span className="phone-island-title">{chatNotice.title}</span>
              <span className="phone-island-subtitle">{chatNotice.body}</span>
            </div>
            <span className="phone-island-chip">查看</span>
          </>
        ) : null}

        {activity === "toast" ? (
          <div className="phone-island-toast">{toast}</div>
        ) : null}

        {activity === "music" && musicTrack && player ? (
          <MusicIslandBody
            track={musicTrack}
            isPlaying={player.isPlaying}
            onPrev={() => player.prev()}
            onTogglePlay={() => player.togglePlay()}
            onNext={() => player.next()}
          />
        ) : null}
      </div>
    </div>
    </>
  );
}
