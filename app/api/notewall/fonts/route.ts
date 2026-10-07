import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/server/account-auth";
import { normalizeNoteWallFontFile } from "@/lib/notewall-utils";

const REST_SELECT_FONTS = "select=id,name,note,url,format,created_by,created_at,updated_at";
const FONT_BUCKET = "note-wall-fonts";
const MAX_FONT_BYTES = 8 * 1024 * 1024;

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function authHeaders(config: { key: string }): HeadersInit {
  return { apikey: config.key, Authorization: `Bearer ${config.key}` };
}

async function supabaseFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  const config = getSupabaseConfig();
  if (!config) return { ok: false, error: "missing_supabase_env", status: 503 };
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authHeaders(config),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
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

async function ensureBucket(config: { url: string; key: string }): Promise<void> {
  const created = await fetch(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify({ name: FONT_BUCKET, public: true }),
  });
  if (created.ok || created.status === 409 || created.status === 400) return;
  const text = await created.text().catch(() => "");
  throw new Error(`字体存储桶创建失败：${created.status} ${text}`.slice(0, 200));
}

export async function GET() {
  const result = await supabaseFetch<unknown[]>(
    `note_wall_fonts?order=created_at.asc&${REST_SELECT_FONTS}`,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, fonts: result.data });
}

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const config = getSupabaseConfig();
    if (!config) {
      return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 503 });
    }
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim().slice(0, 40);
    const note = String(form.get("note") ?? "").slice(0, 500);
    const file = form.get("file");
    if (!name) return NextResponse.json({ ok: false, error: "字体名不能为空。" }, { status: 400 });
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "请选择字体文件（woff2/ttf/otf）。" }, { status: 400 });
    }
    if (file.size > MAX_FONT_BYTES) {
      return NextResponse.json({ ok: false, error: "字体文件超过 8MB。" }, { status: 400 });
    }
    const parsed = normalizeNoteWallFontFile(file);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "只支持 woff2/ttf/otf/woff 字体文件。" }, { status: 400 });
    }
    await ensureBucket(config);
    const id = `nwf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const objectPath = `${account.id}/${id}.${parsed.ext}`;
    const upload = await fetch(
      `${config.url}/storage/v1/object/${FONT_BUCKET}/${objectPath}`,
      {
        method: "POST",
        headers: {
          ...authHeaders(config),
          "Content-Type": parsed.mime,
          "x-upsert": "true",
        },
        body: file,
      },
    );
    if (!upload.ok) {
      const text = await upload.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `字体上传失败：${upload.status} ${text}`.slice(0, 200) }, { status: 500 });
    }
    const payload = {
      id,
      name,
      note,
      url: `${config.url}/storage/v1/object/public/${FONT_BUCKET}/${objectPath}`,
      format: parsed.ext,
      created_by: account.id,
    };
    const result = await supabaseFetch<unknown[]>(
      `note_wall_fonts?${REST_SELECT_FONTS}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, font: result.data[0] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "字体上传失败。" },
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
    const id = url.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "missing_font_id" }, { status: 400 });
    const result = await supabaseFetch<unknown[]>(
      `note_wall_fonts?id=eq.${encodeURIComponent(id)}&created_by=eq.${encodeURIComponent(account.id)}`,
      { method: "DELETE" },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "字体删除失败。" },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}
