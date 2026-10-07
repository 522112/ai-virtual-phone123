import type { NoteWallStyle } from "./notewall-types";

/**
 * 内置便签样式（初始代码，可直接套用；用户也可在云端美化库上传自己的）。
 * CSS 只支持单条声明（安全白名单：背景、颜色、边框、圆角、阴影、字号字重行高等），
 * 同一套声明会同时作用于：墙面卡片、打开后的正文、评论区。
 */
export const BUILTIN_NOTE_WALL_STYLES: Array<{
  name: string;
  note: string;
  css: string;
  paper: string;
}> = [
  {
    name: "复古牛皮纸",
    note: "怀旧、深夜感慨、老故事、慢节奏内容用；暖黄底配深棕字，像旧信纸。",
    css: "background-color: #e8d5b0; color: #4a3521; border: 1px solid #c9a86a; border-radius: 6px; box-shadow: 0 8px 20px rgba(120, 85, 30, 0.25); line-height: 1.9; letter-spacing: 1px;",
    paper: "kraft",
  },
  {
    name: "樱粉少女",
    note: "撒娇、炫耀、恋爱脑、开心分享用；粉底虚线边，甜妹专用。",
    css: "background-color: #ffe9f0; color: #a13b5e; border: 2px dashed #f5a8c0; border-radius: 16px; box-shadow: 0 8px 20px rgba(200, 90, 130, 0.25); line-height: 1.8;",
    paper: "pink",
  },
  {
    name: "深夜霓虹",
    note: "深夜emo、失眠树洞、秘密心事用；深蓝底发光边，适合半夜发。",
    css: "background-color: #1c1f2b; color: #e8ecff; border: 1px solid #5b6cff; border-radius: 12px; box-shadow: 0 0 18px rgba(91, 108, 255, 0.45); line-height: 1.8;",
    paper: "blue",
  },
];

export function builtinStylesAsLibrary(): NoteWallStyle[] {
  const now = new Date().toISOString();
  return BUILTIN_NOTE_WALL_STYLES.map((style, index) => ({
    id: `builtin-style-${index}`,
    name: style.name,
    note: style.note,
    css: style.css,
    paper: style.paper,
    createdBy: "builtin",
    createdAt: now,
    updatedAt: now,
  }));
}
