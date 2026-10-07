/**
 * 动态 chunk 加载失败兜底：页面版本过旧（发版后旧 chunk 被清）或网络超时时，
 * 刷新一次页面即可恢复；用 sessionStorage 防止刷新循环。
 * @returns true=已触发刷新，调用方直接 return；false=已经刷过，调用方显示错误文案
 */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error || "");
  return /loading chunk|chunkloaderror|chunk .* failed|failed.*chunk/i.test(text);
}

export function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem("__chunk_reloaded") === "1") return false;
    window.sessionStorage.setItem("__chunk_reloaded", "1");
  } catch { /* ignore */ }
  window.location.reload();
  return true;
}

/** 统一处理：chunk 失败就刷新一次，否则返回可显示的中文错误 */
export function describeFlowError(error: unknown, fallback: string): string | null {
  if (isChunkLoadError(error)) {
    if (reloadOnceForChunkError()) return null;
    return "网络较慢，刷新页面再试一次";
  }
  return error instanceof Error ? error.message : fallback;
}
