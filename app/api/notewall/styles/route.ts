import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/server/account-auth";
import { normalizeNoteWallStyle } from "@/lib/notewall-utils";

const REST_SELECT_STYLES = "select=id,name,note,css,paper,created_by,created_at,updated_at";

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function supabaseHeaders(config: { key: string }): HeadersInit {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };
}

async function supabaseFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  const config = getSupabaseConfig();
  if (!config) return { ok: false, error: "missing_supabase_env", status: 503 };
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(config), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data
      ? String((data as { message?: unknown }).message)
      : text || response.statusText;
    return { ok: false, error: message, status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

export async function GET() {
  const result = await supabaseFetch<unknown[]>(
    `note_wall_styles?order=created_at.asc&${REST_SELECT_STYLES}`,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  const styles = result.data.map(normalizeNoteWallStyle).filter(Boolean);
  return NextResponse.json({ ok: true, styles });
}

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const name = String(record.name ?? "").trim().slice(0, 80);
    const css = String(record.css ?? "");
    if (!name || !css.trim()) {
      return NextResponse.json({ ok: false, error: "样式名和 CSS 不能为空。" }, { status: 400 });
    }
    const payload = {
      id: `nws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      name,
      note: String(record.note ?? "").slice(0, 500),
      css: css.slice(0, 8000),
      paper: String(record.paper ?? "").slice(0, 32),
      created_by: account.id,
    };
    const result = await supabaseFetch<unknown[]>(
      `note_wall_styles?${REST_SELECT_STYLES}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, style: normalizeNoteWallStyle(result.data[0]) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "样式创建失败。" },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const url = new URL(request.url);
    let id = url.searchParams.get("id") ?? "";
    if (!id) {
      const body = await request.json().catch(() => null);
      id = typeof body?.id === "string" ? body.id : "";
    }
    if (!id) return NextResponse.json({ ok: false, error: "missing_style_id" }, { status: 400 });
    const result = await supabaseFetch<unknown[]>(
      `note_wall_styles?id=eq.${encodeURIComponent(id)}&created_by=eq.${encodeURIComponent(account.id)}`,
      { method: "DELETE" },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "样式删除失败。" },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}
