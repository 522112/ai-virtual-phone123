"use client";

import { useEffect, useRef } from "react";

export const PHONE_BACK_EVENT = "phone-navigate-back";
export const PHONE_HOME_EVENT = "phone-navigate-home";
export const PHONE_RECENTS_EVENT = "phone-navigate-recents";

type BackHandler = {
  id: number;
  priority: number;
  handler: () => boolean;
};

const backHandlers: BackHandler[] = [];
let nextHandlerId = 1;

export function requestPhoneBack(): boolean {
  if (typeof window === "undefined") return false;
  const ordered = [...backHandlers].sort((left, right) => right.priority - left.priority);
  for (const entry of ordered) {
    if (entry.handler()) return true;
  }
  const event = new CustomEvent(PHONE_BACK_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function requestPhoneHome(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHONE_HOME_EVENT));
}

export function requestPhoneRecents(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHONE_RECENTS_EVENT));
}

/** Higher priority runs first. Return true when this layer consumed the back. */
export function usePhoneBack(handler: () => boolean, priority = 0): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const entry: BackHandler = {
      id: nextHandlerId++,
      priority,
      handler: () => handlerRef.current(),
    };
    backHandlers.push(entry);
    return () => {
      const index = backHandlers.findIndex(item => item.id === entry.id);
      if (index >= 0) backHandlers.splice(index, 1);
    };
  }, [priority]);
}
