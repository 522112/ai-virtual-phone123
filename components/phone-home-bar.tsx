"use client";

import { useRef, useState } from "react";

import type { DesktopIconId } from "@/lib/desktop-config";

export type PhoneRecentApp = {
  id: DesktopIconId;
  label: string;
  tone: string;
  iconUrl?: string;
};

function PhoneRecentCard({
  app,
  onOpen,
  onDismiss,
}: {
  app: PhoneRecentApp;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const dragRef = useRef<{ startY: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const endDrag = (clientY: number) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const dy = drag.startY - clientY;
    if (dy > 72) {
      setLeaving(true);
      setOffset(-220);
      window.setTimeout(() => onDismiss(), 180);
      return;
    }
    setOffset(0);
  };

  return (
    <button
      type="button"
      className={`phone-recents-card${leaving ? " is-leaving" : ""}`}
      style={{ transform: `translateY(${offset}px)`, "--recents-tone": app.tone } as React.CSSProperties}
      onPointerDown={event => {
        event.stopPropagation();
        dragRef.current = { startY: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!dragRef.current) return;
        const dy = dragRef.current.startY - event.clientY;
        if (Math.abs(dy) > 6) dragRef.current.moved = true;
        setOffset(dy > 0 ? -dy : 0);
      }}
      onPointerUp={event => {
        const moved = dragRef.current?.moved;
        endDrag(event.clientY);
        if (!moved && !leaving) onOpen();
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setOffset(0);
      }}
    >
      <span className="phone-recents-preview">
        {app.iconUrl ? <span className="phone-recents-icon" style={{ backgroundImage: `url("${app.iconUrl}")` }} /> : null}
        <strong>{app.label}</strong>
      </span>
      <span className="phone-recents-name">{app.label}</span>
    </button>
  );
}

export function PhoneHomeBar({
  recents,
  recentsOpen,
  onBack,
  onHome,
  onOpenRecents,
  onCloseRecents,
  onSwitchApp,
  onDismissApp,
}: {
  recents: PhoneRecentApp[];
  recentsOpen: boolean;
  onBack: () => void;
  onHome: () => void;
  onOpenRecents: () => void;
  onCloseRecents: () => void;
  onSwitchApp: (id: DesktopIconId) => void;
  onDismissApp: (id: DesktopIconId) => void;
}) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  return (
    <>
      {recentsOpen ? (
        <div className="phone-recents" onClick={onCloseRecents}>
          <div className="phone-recents-track" onClick={event => event.stopPropagation()}>
            {recents.length === 0 ? (
              <p className="phone-recents-empty">还没有最近打开的应用</p>
            ) : recents.map(app => (
              <PhoneRecentCard
                key={String(app.id)}
                app={app}
                onOpen={() => onSwitchApp(app.id)}
                onDismiss={() => onDismissApp(app.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div
        className="phone-home-bar"
        onPointerDown={event => {
          startRef.current = { x: event.clientX, y: event.clientY, t: Date.now() };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={event => {
          const start = startRef.current;
          startRef.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = start.y - event.clientY;
          const dt = Date.now() - start.t;
          if (Math.abs(dx) < 18 && dy < 16) {
            onBack();
            return;
          }
          if (dy > 118 || (dy > 78 && dt > 420)) {
            onOpenRecents();
            return;
          }
          if (dy > 28) onHome();
        }}
        onPointerCancel={() => {
          startRef.current = null;
        }}
      >
        <span className="phone-home-pill" />
      </div>
    </>
  );
}
