import React, { useState } from "react";
import { pinyin } from "pinyin-pro";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";

export type WxContactItem = {
  id: string;
  name: string;
  avatar?: string | null;
};

function getInitial(name: string): string {
  if (!name) return "#";
  const first = name.charAt(0);
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  try {
    const py = pinyin(first, { toneType: "none", type: "array" }) as string[];
    if (py.length > 0 && /[a-zA-Z]/.test(py[0].charAt(0))) return py[0].charAt(0).toUpperCase();
  } catch { /* ignore */ }
  return "#";
}

type Props = {
  contacts: WxContactItem[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  footer?: (contact: WxContactItem) => React.ReactNode;
};

/** 微信风联系人列表：字母分组 + 右侧索引栏点跳（选择联系人/推荐名片共用）。 */
export function WxContactSelectList({ contacts, onSelect, disabled, footer }: Props) {
  const groups = React.useMemo(() => {
    const map = new Map<string, WxContactItem[]>();
    for (const c of contacts) {
      const letter = getInitial(c.name || "");
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    const letters = [...map.keys()].sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
    for (const letter of letters) {
      map.get(letter)!.sort((x, y) => (x.name || "").localeCompare(y.name || "", "zh"));
    }
    return letters.map(letter => ({ letter, items: map.get(letter)! }));
  }, [contacts]);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const groupRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  const jumpToLetter = (letter: string) => {
    setActiveLetter(letter);
    const el = groupRefs.current[letter];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.setTimeout(() => setActiveLetter(current => (current === letter ? null : current)), 800);
  };

  const indexLetters = React.useMemo(() => {
    const present = new Set(groups.map(g => g.letter));
    return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"].filter(l => present.has(l));
  }, [groups]);

  if (contacts.length === 0) {
    return <div className="wx-pick-empty">还没有其他联系人</div>;
  }

  return (
    <div className="wx-pick-body">
      <div className="wx-pick-list">
        {groups.map(group => (
          <div key={group.letter}>
            <div
              className="wx-pick-section"
              ref={el => { groupRefs.current[group.letter] = el; }}
            >
              {group.letter}
            </div>
            {group.items.map(c => (
              <div
                key={c.id}
                className="wx-pick-item"
                onClick={() => { if (!disabled) onSelect(c.id); }}
              >
                <div className="wx-pick-avatar">
                  {c.avatar ? (
                    <img src={c.avatar} alt="" />
                  ) : (
                    <ChatFallbackAvatar />
                  )}
                </div>
                <div className="wx-pick-info">
                  <div className="wx-pick-name">{c.name}</div>
                </div>
                {footer ? footer(c) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="wx-pick-index">
        {indexLetters.map(letter => (
          <span
            key={letter}
            className={activeLetter === letter ? "active" : undefined}
            onClick={e => { e.stopPropagation(); jumpToLetter(letter); }}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
