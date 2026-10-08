import { useMemo } from "react";

const PALETTES: [string, string][] = [
  ["#8e9eab", "#eef2f3"],
  ["#c79081", "#dfa579"],
  ["#7b8a7a", "#c9d6c5"],
  ["#8a7ba8", "#c5b8e0"],
  ["#a87b7b", "#e0b8b8"],
  ["#6b8e9e", "#b8d4e0"],
  ["#9e8e6b", "#e0d4b8"],
  ["#7a9e8e", "#b8e0d0"],
];

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

type Props = {
  text: string;
  size?: number;
  radius?: number;
  fontSize?: number;
  maxChars?: number;
};

/** 文字图占位：没接生图 API 时，有图动态用文字缩略图代替（名片/朋友圈/详情共用）。 */
export function MomentTextThumb({ text, size = 72, radius = 4, fontSize, maxChars = 12 }: Props) {
  const palette = useMemo(() => PALETTES[hashText(text || "?") % PALETTES.length], [text]);
  const excerpt = (text || "").replace(/\s+/g, " ").trim().slice(0, maxChars) || "图片";
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 6,
        fontSize: fontSize || Math.max(10, Math.round(size / 6)),
        lineHeight: 1.4,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,.25)",
        background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`,
        overflow: "hidden",
        wordBreak: "break-word",
      }}
    >
      {excerpt}
    </span>
  );
}
