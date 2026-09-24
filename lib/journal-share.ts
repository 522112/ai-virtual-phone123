import { addChatContact, createOrGetSession, pushChatMessage } from "./chat-storage";
import { PENDING_REPLY_PREFIX } from "./friend-request-engine";
import { kvSet } from "./kv-db";
import type { JournalBook, JournalPage } from "./journal-types";
import {
  formatJournalBookPlainText,
  formatJournalPagePlainText,
} from "./journal-storage";

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

export function buildJournalPageCardHtml(book: JournalBook, page: JournalPage): string {
  const image = firstImage(page);
  const excerpt = formatJournalPagePlainText(page).split("\n").slice(2).join(" ").slice(0, 180);
  return `
<section style="margin:0;padding:16px 16px 14px;border-radius:18px;background:linear-gradient(180deg,#fffdf8,#f6f1e8);color:#2b2722;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:11px;letter-spacing:0.12em;opacity:0.55;">
    <span>${book.kind === "couple" ? "COUPLE JOURNAL" : "JOURNAL"}</span>
    <span>${escapeHtml(page.dateLabel || "")}</span>
  </div>
  <h3 style="margin:0 0 8px;font-size:18px;line-height:1.35;">${escapeHtml(page.title || book.title)}</h3>
  <p style="margin:0 0 10px;font-size:12px;opacity:0.62;">来自《${escapeHtml(book.title)}》</p>
  ${image ? `<img src="${image}" alt="" style="width:100%;height:148px;object-fit:cover;border-radius:12px;margin:0 0 10px;" />` : ""}
  <p style="margin:0;font-size:13px;line-height:1.7;">${escapeHtml(excerpt || "一页手账。")}</p>
</section>`;
}

export function buildJournalBookCardHtml(book: JournalBook): string {
  const cover = book.coverImage
    ? `<img src="${book.coverImage}" alt="" style="width:72px;height:96px;object-fit:cover;border-radius:8px;" />`
    : `<div style="width:72px;height:96px;border-radius:8px;background:${book.coverColor};box-shadow:inset 0 0 0 1px rgba(0,0,0,0.06);"></div>`;
  const titles = book.pages.slice(0, 4).map(page => escapeHtml(page.title)).join(" / ");
  return `
<section style="margin:0;padding:16px;border-radius:18px;background:linear-gradient(180deg,#fffdf8,#f4efe6);color:#2b2722;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;display:flex;gap:14px;">
  ${cover}
  <div style="min-width:0;flex:1;">
    <div style="font-size:11px;letter-spacing:0.12em;opacity:0.55;margin-bottom:6px;">${book.kind === "couple" ? "COUPLE BOOK" : "JOURNAL BOOK"}</div>
    <h3 style="margin:0 0 8px;font-size:18px;line-height:1.35;">${escapeHtml(book.title)}</h3>
    <p style="margin:0;font-size:13px;line-height:1.65;opacity:0.78;">共 ${book.pages.length} 页${titles ? ` · ${titles}` : ""}</p>
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
  const body = input.page ? formatJournalPagePlainText(input.page) : formatJournalBookPlainText(input.book);
  const html = input.page
    ? buildJournalPageCardHtml(input.book, input.page)
    : buildJournalBookCardHtml(input.book);
  const message = pushChatMessage({
    sessionId: session.id,
    role: "user",
    content: body,
    mediaType: "app_card",
    mediaData: {
      appId: "diary",
      appName: "手账",
      appCardTitle: title,
      appCardBody: body,
      appCardSummary: body.slice(0, 180),
      appHistoryText: `用户分享了${isPage ? "一篇手账" : "一册手账"}《${input.book.title}》\n${body}`,
      appCardLayout: {
        appLabel: "手账",
        title,
        subtitle: input.book.title,
        body: body.slice(0, 400),
        html,
        height: input.page ? 280 : 220,
      },
    },
  });
  if (typeof window !== "undefined") {
    kvSet(PENDING_REPLY_PREFIX + session.id, "1");
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
  }
  return { sessionId: session.id, messageId: message.id };
}
