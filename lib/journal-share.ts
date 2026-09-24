import { addChatContact, createOrGetSession, pushChatMessage } from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { PENDING_REPLY_PREFIX } from "./friend-request-engine";
import { kvSet } from "./kv-db";
import type { JournalBlock, JournalBook, JournalPage } from "./journal-types";
import { blocksOnSide } from "./journal-storage";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstImage(page?: JournalPage): string {
  return page?.blocks.find(block => block.type === "image")?.src || "";
}

function characterNameMap(): Map<string, string> {
  return new Map(loadCharacters().map(item => [item.id, item.name]));
}

function blockAuthorLabel(block: JournalBlock, book: JournalBook, names: Map<string, string>): string {
  if (block.author === "user") return "用户";
  const id = block.characterId || book.characterId || "";
  return names.get(id) || "对方";
}

function sideAuthorLabel(page: JournalPage, side: "left" | "right", book: JournalBook, names: Map<string, string>): string {
  const authors = Array.from(new Set(blocksOnSide(page, side).map(block => blockAuthorLabel(block, book, names))));
  if (authors.length === 0) return side === "left" ? "用户" : (names.get(book.characterId || "") || "对方");
  return authors.join("、");
}

function sideExcerpt(page: JournalPage, side: "left" | "right"): string {
  return blocksOnSide(page, side)
    .map(block => {
      if (block.type === "text") return block.text.trim();
      if (block.type === "clip") return block.text.trim();
      if (block.type === "image") return block.caption?.trim() || "";
      if (block.type === "stamp") return block.note?.trim() || "";
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .slice(0, 48);
}

function formatSideForShare(page: JournalPage, side: "left" | "right", book: JournalBook, names: Map<string, string>): string {
  const author = sideAuthorLabel(page, side, book, names);
  const lines = blocksOnSide(page, side).map(block => {
    if (block.type === "text" && block.text.trim()) return block.text.trim();
    if (block.type === "image") return block.caption?.trim() || "[手账图片]";
    if (block.type === "doodle") return "[手账涂鸦]";
    if (block.type === "stamp") return block.note?.trim() || "[手账印章]";
    if (block.type === "clip" && block.text.trim()) return `${block.sourceLabel || "摘录"}：${block.text.trim()}`;
    return "";
  }).filter(Boolean);
  return [`${side === "left" ? "左面" : "右面"}（${author}）`, ...lines].join("\n");
}

export function formatJournalShareHistory(input: {
  book: JournalBook;
  page?: JournalPage;
  recipientId: string;
}): string {
  const names = characterNameMap();
  const partnerName = names.get(input.book.characterId || "") || "对方";
  const isPartner = Boolean(input.book.characterId && input.book.characterId === input.recipientId);
  const lines = ["【手账分享】"];

  if (input.book.kind === "couple" && isPartner) {
    lines.push("用户把你们一起做的手账发给你看。左面多半是用户写的，右面是你写的。按人设看看、回一句就好。");
  } else if (input.book.kind === "couple") {
    lines.push(`用户把一篇手账发给你看。这是用户和${partnerName}一起做的情侣手账，不是你写的。`);
    lines.push("你可以看见上面的字和画，按自己的人设反应：可以好奇、吃醋、点评或开玩笑，但不要装作这是你写的，也不要改口称自己是作者。");
  } else if (isPartner) {
    lines.push("用户把自己的手账发给你看。按人设反应即可。");
  } else {
    lines.push("用户把自己的手账发给你看。这不是你写的。你可以看见内容，按自己的人设反应，不要装作作者。");
  }

  lines.push("");
  lines.push(`《${input.book.title}》`);
  if (input.page) {
    if (input.page.title) lines.push(input.page.title);
    if (input.page.dateLabel) lines.push(input.page.dateLabel);
    lines.push(formatSideForShare(input.page, "left", input.book, names));
    lines.push(formatSideForShare(input.page, "right", input.book, names));
  } else {
    lines.push(input.book.kind === "couple" ? "情侣手账" : "个人手账");
    input.book.pages.forEach((page, index) => {
      lines.push(`第${index + 1}面 ${page.title || ""}`.trim());
      lines.push(formatSideForShare(page, "left", input.book, names));
      lines.push(formatSideForShare(page, "right", input.book, names));
    });
  }
  return lines.join("\n");
}

function estimateShareCardHeight(input: { page?: boolean; image?: boolean; excerpt?: number }): number {
  if (!input.page) return input.image ? 156 : 134;
  const text = Math.min(72, 36 + Math.ceil((input.excerpt || 24) / 16) * 16);
  return 86 + (input.image ? 78 : 0) + text;
}

export function buildJournalPageCardHtml(book: JournalBook, page: JournalPage): string {
  const image = firstImage(page);
  const left = sideExcerpt(page, "left");
  const right = sideExcerpt(page, "right");
  return `
<section style="width:100%;box-sizing:border-box;margin:0;padding:10px 11px 9px;background:linear-gradient(180deg,#fffdf8,#f4efe6);color:#2b2722;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:0.1em;opacity:0.5;">
    <span>${book.kind === "couple" ? "情侣手账" : "手账"}</span>
    <span>${escapeHtml(page.dateLabel || "")}</span>
  </div>
  <h3 style="margin:5px 0 3px;font-size:15px;line-height:1.3;font-weight:600;">${escapeHtml(page.title || book.title)}</h3>
  <p style="margin:0 0 8px;font-size:11px;line-height:1.4;opacity:0.55;">《${escapeHtml(book.title)}》</p>
  ${image ? `<img src="${image}" alt="" style="display:block;width:100%;height:72px;object-fit:cover;border-radius:8px;margin:0 0 8px;" />` : ""}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
    <div style="min-width:0;padding:7px 8px;border-radius:8px;background:rgba(255,255,255,0.62);">
      <div style="font-size:10px;opacity:0.42;margin-bottom:3px;">左面</div>
      <p style="margin:0;font-size:11px;line-height:1.5;word-break:break-word;">${escapeHtml(left || "空白")}</p>
    </div>
    <div style="min-width:0;padding:7px 8px;border-radius:8px;background:rgba(255,255,255,0.62);">
      <div style="font-size:10px;opacity:0.42;margin-bottom:3px;">右面</div>
      <p style="margin:0;font-size:11px;line-height:1.5;word-break:break-word;">${escapeHtml(right || "空白")}</p>
    </div>
  </div>
</section>`;
}

export function buildJournalBookCardHtml(book: JournalBook): string {
  const cover = book.coverImage
    ? `<img src="${book.coverImage}" alt="" style="width:56px;height:74px;object-fit:cover;border-radius:6px;flex:0 0 auto;" />`
    : `<div style="width:56px;height:74px;border-radius:6px;flex:0 0 auto;background:${book.coverColor};box-shadow:inset 0 0 0 1px rgba(0,0,0,0.06);"></div>`;
  const titles = book.pages.slice(0, 3).map(page => escapeHtml(page.title)).join(" · ");
  return `
<section style="width:100%;box-sizing:border-box;margin:0;padding:12px;background:linear-gradient(180deg,#fffdf8,#f4efe6);color:#2b2722;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;display:flex;gap:10px;align-items:center;">
  ${cover}
  <div style="min-width:0;flex:1;">
    <div style="font-size:10px;letter-spacing:0.1em;opacity:0.5;margin-bottom:4px;">${book.kind === "couple" ? "情侣手账" : "手账"}</div>
    <h3 style="margin:0 0 4px;font-size:15px;line-height:1.3;">${escapeHtml(book.title)}</h3>
    <p style="margin:0;font-size:12px;line-height:1.5;opacity:0.72;word-break:break-word;">共 ${book.pages.length} 面${titles ? ` · ${titles}` : ""}</p>
  </div>
</section>`;
}

export function sendJournalShareToCharacter(input: {
  characterId: string;
  book: JournalBook;
  page?: JournalPage;
}): { sessionId: string; messageId: string } {
  addChatContact(input.characterId);
  const session = createOrGetSession(input.characterId);
  const isPage = Boolean(input.page);
  const title = input.page?.title || input.book.title;
  const history = formatJournalShareHistory({
    book: input.book,
    page: input.page,
    recipientId: input.characterId,
  });
  const left = input.page ? sideExcerpt(input.page, "left") : "";
  const right = input.page ? sideExcerpt(input.page, "right") : "";
  const image = firstImage(input.page);
  const html = input.page
    ? buildJournalPageCardHtml(input.book, input.page)
    : buildJournalBookCardHtml(input.book);
  const height = estimateShareCardHeight({
    page: isPage,
    image: Boolean(image || (!isPage && input.book.coverImage)),
    excerpt: Math.max(left.length, right.length),
  });
  const message = pushChatMessage({
    sessionId: session.id,
    role: "user",
    content: history,
    mediaType: "app_card",
    mediaData: {
      appId: "diary",
      appName: "手账",
      appCardTitle: title,
      appCardBody: [left, right].filter(Boolean).join(" / ") || `《${input.book.title}》`,
      appCardSummary: [left, right].filter(Boolean).join(" / ").slice(0, 80),
      appHistoryText: history,
      appCardLayout: {
        appLabel: "手账",
        title,
        subtitle: input.book.title,
        body: [left, right].filter(Boolean).join(" / "),
        html,
        height,
        background: "#fffdf8",
        accentColor: "#7a523e",
        sections: input.page
          ? [
              { title: "左面", text: left || "空白" },
              { title: "右面", text: right || "空白" },
            ]
          : [{ title: `${input.book.pages.length} 面`, text: input.book.pages.map(page => page.title).filter(Boolean).join(" · ") }],
      },
    },
  });
  if (typeof window !== "undefined") {
    kvSet(PENDING_REPLY_PREFIX + session.id, "1");
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
  }
  return { sessionId: session.id, messageId: message.id };
}
